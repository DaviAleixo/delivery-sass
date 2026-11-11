-- RPCs atômicas para o Spooler Autônomo (.exe Etapa 2) parear, consumir print_jobs e confirmar impressão
-- Autenticação baseada no token criptográfico exclusivo da loja (spooler_station_token).

CREATE OR REPLACE FUNCTION public.spooler_pair(p_pairing_code TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_tenant RECORD;
    v_clean_code TEXT := upper(trim(COALESCE(p_pairing_code, '')));
BEGIN
    IF v_clean_code = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Código de pareamento obrigatório.');
    END IF;

    SELECT id, name, slug, spooler_station_token
    INTO v_tenant
    FROM public.tenants
    WHERE spooler_pairing_code = v_clean_code
      AND spooler_station_token IS NOT NULL
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Código de pareamento inválido.');
    END IF;

    UPDATE public.tenants
    SET spooler_last_seen_at = NOW()
    WHERE id = v_tenant.id;

    RETURN jsonb_build_object(
        'success', true,
        'stationToken', v_tenant.spooler_station_token,
        'tenantId', v_tenant.id,
        'tenantName', v_tenant.name,
        'tenantSlug', v_tenant.slug
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.spooler_poll(p_station_token TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_tenant RECORD;
    v_jobs JSONB := '[]'::jsonb;
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

    -- Recupera jobs travados em 'printing' há mais de 90s (máx 5 tentativas)
    UPDATE public.print_jobs
    SET status = 'pending', updated_date = NOW()
    WHERE tenant_id = v_tenant.id
      AND status = 'printing'
      AND updated_date < NOW() - INTERVAL '90 seconds'
      AND attempts < 5;

    -- Claim atômico FIFO dos próximos jobs térmicos das últimas 12 horas
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
SET search_path = public
AS $function$
DECLARE
    v_tenant_id UUID;
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

    UPDATE public.print_jobs
    SET
        status = v_final_status,
        printed_at = CASE WHEN v_final_status = 'printed' THEN NOW() ELSE NULL END,
        error_message = p_error_message,
        updated_date = NOW()
    WHERE id = p_job_id
      AND tenant_id = v_tenant_id
    RETURNING order_id INTO v_order_id;

    IF v_order_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Job não encontrado.');
    END IF;

    IF v_final_status = 'printed' THEN
        SELECT NOT EXISTS (
            SELECT 1
            FROM public.print_jobs pj
            WHERE pj.order_id = v_order_id
              AND pj.status <> 'printed'
        ) INTO v_all_done;

        IF v_all_done THEN
            UPDATE public.orders
            SET
                print_status = 'printed',
                printed_at = NOW(),
                print_count = COALESCE(print_count, 0) + 1,
                updated_date = NOW()
            WHERE id = v_order_id;
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.spooler_pair(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spooler_poll(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spooler_ack(TEXT, UUID, TEXT, TEXT) TO anon, authenticated;

