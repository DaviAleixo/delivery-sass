-- ============================================================================
-- Fase 4: Resiliência Operacional & Recuperação de Falhas
-- 1. Máquina de estados terminal em public.orders (impede 2 operadores concorrentes
--    de ressuscitar pedido 'cancelado' ou regredir pedido 'entregue')
-- 2. Recuperação automática + dead-letter em public.spooler_poll (>90s printing)
-- 3. Idempotência de print_count em public.spooler_ack em retries de rede
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_orders_guard_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_old TEXT := LOWER(COALESCE(OLD.status, ''));
    v_new TEXT := LOWER(COALESCE(NEW.status, ''));
BEGIN
    IF v_old = v_new THEN
        RETURN NEW;
    END IF;

    IF v_old = 'cancelado' AND v_new <> 'cancelado' THEN
        RAISE EXCEPTION 'Transição inválida: pedido cancelado não pode ser reativado para "%".', NEW.status
            USING ERRCODE = 'P0001';
    END IF;

    IF v_old = 'entregue' AND v_new NOT IN ('entregue', 'cancelado') THEN
        RAISE EXCEPTION 'Transição inválida: pedido já entregue não pode regredir para "%".', NEW.status
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_guard_status_transition ON public.orders;
CREATE TRIGGER trg_orders_guard_status_transition
    BEFORE UPDATE OF status ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_orders_guard_status_transition();

CREATE OR REPLACE FUNCTION public.spooler_poll(p_station_token TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_tenant RECORD;
    v_jobs JSONB := '[]'::jsonb;
    v_recovered_count INT := 0;
    v_dead_letter_count INT := 0;
BEGIN
    IF COALESCE(trim(p_station_token), '') = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Token de estação ausente.');
    END IF;

    SELECT id, name, slug
    INTO v_tenant
    FROM public.tenants
    WHERE spooler_station_token = trim(p_station_token)
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estação não autorizada ou desconectada.');
    END IF;

    UPDATE public.tenants
    SET spooler_last_seen_at = NOW()
    WHERE id = v_tenant.id;

    -- 1) Dead-letter: jobs travados em 'printing' > 90s que atingiram 5 tentativas vão para 'failed'
    UPDATE public.print_jobs
    SET status = 'failed',
        error_message = COALESCE(NULLIF(error_message, ''), 'Falha após 5 tentativas: Spooler ou impressora interrompido antes da confirmação.'),
        updated_date = NOW()
    WHERE tenant_id = v_tenant.id
      AND status = 'printing'
      AND updated_date < NOW() - INTERVAL '90 seconds'
      AND attempts >= 5;
    GET DIAGNOSTICS v_dead_letter_count = ROW_COUNT;

    -- 2) Recupera jobs travados em 'printing' há mais de 90s (< 5 tentativas) para nova tentativa
    UPDATE public.print_jobs
    SET status = 'pending', updated_date = NOW()
    WHERE tenant_id = v_tenant.id
      AND status = 'printing'
      AND updated_date < NOW() - INTERVAL '90 seconds'
      AND attempts < 5;
    GET DIAGNOSTICS v_recovered_count = ROW_COUNT;

    -- 3) Claim atômico FIFO dos próximos jobs térmicos das últimas 12 horas
    WITH next_jobs AS (
        SELECT pj.id
        FROM public.print_jobs pj
        WHERE pj.tenant_id = v_tenant.id
          AND pj.status = 'pending'
          AND pj.printer_type <> 'a4_browser'
          AND pj.created_date >= NOW() - INTERVAL '12 hours'
        ORDER BY pj.created_date ASC
        LIMIT 10
        FOR UPDATE SKIP LOCKED
    ),
    claimed AS (
        UPDATE public.print_jobs pj
        SET
            status = 'printing',
            attempts = pj.attempts + 1,
            updated_date = NOW()
        FROM next_jobs nj
        WHERE pj.id = nj.id
        RETURNING pj.*
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', c.id,
                'order_id', c.order_id,
                'sector_id', c.sector_id,
                'sector_key', c.sector_key,
                'sector_name', c.sector_name,
                'printer_name', c.printer_name,
                'printer_type', c.printer_type,
                'paper_width', c.paper_width,
                'content_mode', c.content_mode,
                'copies', c.copies,
                'items_payload', c.items_payload,
                'storeName', v_tenant.name,
                'order', to_jsonb(o.*)
            )
            ORDER BY c.created_date ASC
        ),
        '[]'::jsonb
    )
    INTO v_jobs
    FROM claimed c
    JOIN public.orders o ON o.id = c.order_id;

    RETURN jsonb_build_object(
        'success', true,
        'tenantName', v_tenant.name,
        'recoveredCount', v_recovered_count,
        'deadLetterCount', v_dead_letter_count,
        'jobs', v_jobs
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.spooler_ack(
    p_station_token TEXT,
    p_job_id UUID,
    p_status TEXT,
    p_error_message TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_tenant_id UUID;
    v_prev_status TEXT;
    v_order_id TEXT;
    v_final_status TEXT := CASE WHEN p_status = 'printed' THEN 'printed' ELSE 'failed' END;
    v_all_done BOOLEAN := false;
BEGIN
    SELECT id INTO v_tenant_id
    FROM public.tenants
    WHERE spooler_station_token = trim(COALESCE(p_station_token, ''))
    LIMIT 1;

    IF v_tenant_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estação não autorizada.');
    END IF;

    SELECT status, order_id
    INTO v_prev_status, v_order_id
    FROM public.print_jobs
    WHERE id = p_job_id
      AND tenant_id = v_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Job não encontrado.');
    END IF;

    -- Idempotência: se já estava 'printed' e recebeu retry de ACK 'printed', não duplica print_count
    IF v_prev_status = 'printed' AND v_final_status = 'printed' THEN
        RETURN jsonb_build_object('success', true, 'idempotent_replay', true);
    END IF;

    -- Não regride job já cancelado para printed/failed
    IF v_prev_status = 'cancelled' THEN
        RETURN jsonb_build_object('success', true, 'cancelled_ignored', true);
    END IF;

    UPDATE public.print_jobs
    SET
        status = v_final_status,
        printed_at = CASE WHEN v_final_status = 'printed' THEN COALESCE(printed_at, NOW()) ELSE NULL END,
        error_message = p_error_message,
        updated_date = NOW()
    WHERE id = p_job_id
      AND tenant_id = v_tenant_id;

    IF v_final_status = 'printed' THEN
        SELECT NOT EXISTS (
            SELECT 1
            FROM public.print_jobs pj
            WHERE pj.order_id = v_order_id
              AND pj.status NOT IN ('printed', 'cancelled')
        ) INTO v_all_done;

        IF v_all_done THEN
            UPDATE public.orders
            SET
                print_status = 'printed',
                printed_at = COALESCE(printed_at, NOW()),
                print_count = COALESCE(print_count, 0) + 1,
                updated_date = NOW()
            WHERE id = v_order_id;
        END IF;
    ELSIF v_final_status = 'failed' THEN
        UPDATE public.orders
        SET print_status = 'failed',
            updated_date = NOW()
        WHERE id = v_order_id
          AND print_status <> 'printed';
    END IF;

    RETURN jsonb_build_object('success', true, 'idempotent_replay', false);
END;
$function$;

