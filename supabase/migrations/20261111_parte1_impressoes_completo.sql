-- Migration: Parte 1 Completa (Aceite Automático Delivery, Etapa 2 Spooler Autônomo, Senha Curta e Auto-Sync print_jobs)

-- 1. Novas colunas em public.tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS auto_accept_delivery BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS spooler_pairing_code TEXT,
  ADD COLUMN IF NOT EXISTS spooler_station_token TEXT,
  ADD COLUMN IF NOT EXISTS spooler_last_seen_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_spooler_pairing_code
  ON public.tenants (spooler_pairing_code)
  WHERE spooler_pairing_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_spooler_station_token
  ON public.tenants (spooler_station_token)
  WHERE spooler_station_token IS NOT NULL;

-- 2. Liberar 'short_receipt' (Senha Curta / Autoatendimento / Maquininha) em production_sectors e print_jobs
ALTER TABLE public.production_sectors
  DROP CONSTRAINT IF EXISTS production_sectors_content_mode_check;

ALTER TABLE public.production_sectors
  ADD CONSTRAINT production_sectors_content_mode_check
  CHECK (content_mode IN ('production_only', 'full_ticket', 'short_receipt'));

ALTER TABLE public.print_jobs
  DROP CONSTRAINT IF EXISTS print_jobs_content_mode_check;

ALTER TABLE public.print_jobs
  ADD CONSTRAINT print_jobs_content_mode_check
  CHECK (content_mode IN ('production_only', 'full_ticket', 'short_receipt'));

-- 3. Atualizar RPC update_tenant_settings para persistir auto_accept_delivery
CREATE OR REPLACE FUNCTION public.update_tenant_settings(p_tenant_id uuid, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_updated_tenant JSONB;
BEGIN
    UPDATE public.tenants
    SET 
        name = COALESCE(p_data->>'name', name),
        logo_url = CASE WHEN p_data ? 'logo_url' THEN p_data->>'logo_url' ELSE logo_url END,
        opening_time = COALESCE(p_data->>'opening_time', opening_time),
        closing_time = COALESCE(p_data->>'closing_time', closing_time),
        open_days = CASE WHEN p_data ? 'open_days' THEN p_data->'open_days' ELSE open_days END,
        delivery_time = CASE WHEN p_data ? 'delivery_time' THEN p_data->>'delivery_time' ELSE delivery_time END,
        salon_mode = CASE WHEN p_data ? 'salon_mode' THEN p_data->>'salon_mode' ELSE salon_mode END,
        auto_accept_delivery = CASE WHEN p_data ? 'auto_accept_delivery' THEN (p_data->>'auto_accept_delivery')::boolean ELSE auto_accept_delivery END,
        cashback_enabled = CASE WHEN p_data ? 'cashback_enabled' THEN (p_data->>'cashback_enabled')::boolean ELSE cashback_enabled END,
        cashback_rate = CASE WHEN p_data ? 'cashback_rate' THEN (p_data->>'cashback_rate')::numeric ELSE cashback_rate END,
        cashback_validity_days = CASE WHEN p_data ? 'cashback_validity_days' THEN (p_data->>'cashback_validity_days')::integer ELSE cashback_validity_days END,
        cashback_max_discount_percentage = CASE WHEN p_data ? 'cashback_max_discount_percentage' THEN (p_data->>'cashback_max_discount_percentage')::numeric ELSE cashback_max_discount_percentage END,
        manual_store_open = CASE 
            WHEN p_data ? 'manual_store_open' THEN 
                CASE 
                    WHEN (p_data->>'manual_store_open') IS NULL THEN NULL
                    ELSE (p_data->>'manual_store_open')::boolean 
                END
            ELSE manual_store_open 
        END,
        manual_override_date = CASE 
            WHEN p_data ? 'manual_override_date' THEN 
                CASE 
                    WHEN (p_data->>'manual_override_date') IS NULL THEN NULL
                    ELSE p_data->>'manual_override_date' 
                END
            ELSE manual_override_date 
        END,
        address = COALESCE(p_data->>'address', address),
        cep = CASE WHEN p_data ? 'cep' THEN p_data->>'cep' ELSE cep END,
        address_street = CASE WHEN p_data ? 'address_street' THEN p_data->>'address_street' ELSE address_street END,
        address_number = CASE WHEN p_data ? 'address_number' THEN p_data->>'address_number' ELSE address_number END,
        address_neighborhood = CASE WHEN p_data ? 'address_neighborhood' THEN p_data->>'address_neighborhood' ELSE address_neighborhood END,
        address_city = CASE WHEN p_data ? 'address_city' THEN p_data->>'address_city' ELSE address_city END,
        address_state = CASE WHEN p_data ? 'address_state' THEN p_data->>'address_state' ELSE address_state END,
        address_complement = CASE WHEN p_data ? 'address_complement' THEN p_data->>'address_complement' ELSE address_complement END,
        instagram = CASE WHEN p_data ? 'instagram' THEN p_data->>'instagram' ELSE instagram END,
        whatsapp = CASE WHEN p_data ? 'whatsapp' THEN p_data->>'whatsapp' ELSE whatsapp END,
        delivery_fee = CASE WHEN p_data ? 'delivery_fee' THEN (p_data->>'delivery_fee')::numeric ELSE delivery_fee END,
        min_order_value = CASE WHEN p_data ? 'min_order_value' THEN (p_data->>'min_order_value')::numeric ELSE min_order_value END,
        delivery_fee_type = COALESCE(p_data->>'delivery_fee_type', delivery_fee_type),
        delivery_neighborhoods = CASE WHEN p_data ? 'delivery_neighborhoods' THEN p_data->'delivery_neighborhoods' ELSE delivery_neighborhoods END,
        delivery_unlisted_policy = COALESCE(p_data->>'delivery_unlisted_policy', delivery_unlisted_policy),
        delivery_fallback_fee = CASE WHEN p_data ? 'delivery_fallback_fee' THEN (p_data->>'delivery_fallback_fee')::numeric ELSE delivery_fallback_fee END,
        free_delivery_threshold = CASE WHEN p_data ? 'free_delivery_threshold' AND (p_data->>'free_delivery_threshold') IS NOT NULL AND (p_data->>'free_delivery_threshold') != '' THEN (p_data->>'free_delivery_threshold')::numeric ELSE free_delivery_threshold END,
        payment_methods = CASE WHEN p_data ? 'payment_methods' THEN p_data->'payment_methods' ELSE payment_methods END,
        accepts_delivery = CASE WHEN p_data ? 'accepts_delivery' THEN (p_data->>'accepts_delivery')::boolean ELSE accepts_delivery END,
        accepts_takeaway = CASE WHEN p_data ? 'accepts_takeaway' THEN (p_data->>'accepts_takeaway')::boolean ELSE accepts_takeaway END,
        table_service_fee_enabled = CASE WHEN p_data ? 'table_service_fee_enabled' THEN (p_data->>'table_service_fee_enabled')::boolean ELSE table_service_fee_enabled END,
        table_service_fee_rate = CASE WHEN p_data ? 'table_service_fee_rate' THEN (p_data->>'table_service_fee_rate')::numeric ELSE table_service_fee_rate END,
        updated_date = NOW()
    WHERE id = p_tenant_id;

    SELECT to_jsonb(t.*) INTO v_updated_tenant
    FROM public.tenants t
    WHERE t.id = p_tenant_id;

    RETURN v_updated_tenant;
END;
$function$;

-- 4. RPC segura para gerar código de pareamento do Spooler Autônomo (.exe)
CREATE OR REPLACE FUNCTION public.generate_spooler_pairing_code(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_code TEXT;
    v_token TEXT;
    v_alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_part TEXT := '';
    v_i INT;
BEGIN
    IF NOT (p_tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) THEN
        RAISE EXCEPTION 'Acesso negado para parear esta loja.';
    END IF;

    FOR v_i IN 1..6 LOOP
        v_part := v_part || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;

    v_code := 'PM-' || substr(v_part, 1, 3) || '-' || substr(v_part, 4, 3);
    v_token := encode(gen_random_bytes(24), 'hex');

    UPDATE public.tenants
    SET
        spooler_pairing_code = v_code,
        spooler_station_token = v_token,
        updated_date = NOW()
    WHERE id = p_tenant_id;

    RETURN jsonb_build_object(
        'pairing_code', v_code,
        'station_token', v_token
    );
END;
$function$;

-- 5. Trigger de Auto-Aceite Delivery no servidor (blindagem extra caso pedido venha sem o flag do front)
CREATE OR REPLACE FUNCTION public.fn_orders_auto_accept_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_auto_accept BOOLEAN := false;
BEGIN
    IF NEW.status = 'pendente' AND COALESCE(lower(NEW.order_type), 'delivery') = 'delivery' THEN
        SELECT COALESCE(t.auto_accept_delivery, false)
        INTO v_auto_accept
        FROM public.tenants t
        WHERE t.id = NEW.tenant_id;

        IF v_auto_accept THEN
            NEW.status := 'confirmado';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_auto_accept_delivery ON public.orders;
CREATE TRIGGER trg_orders_auto_accept_delivery
    BEFORE INSERT OR UPDATE OF status
    ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_orders_auto_accept_delivery();

-- 6. Trigger que gera fila print_jobs no Postgres mesmo com o navegador fechado
CREATE OR REPLACE FUNCTION public.fn_orders_sync_print_jobs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_status TEXT := COALESCE(lower(NEW.status), 'pendente');
    v_order_type TEXT := COALESCE(lower(NEW.order_type), '');
    v_table_num TEXT := COALESCE(lower(NEW.table_number), '');
    v_channel TEXT := 'delivery';
    v_has_active_sectors BOOLEAN := false;
    v_sector RECORD;
    v_items JSONB := COALESCE(NEW.items, '[]'::jsonb);
    v_sector_items JSONB;
    v_item JSONB;
    v_item_sector_id UUID;
    v_allowed JSONB;
BEGIN
    -- Ignora rascunhos PIX, cancelados e já finalizados
    IF v_status IN ('aguardando_pagamento', 'cancelado', 'entregue') THEN
        RETURN NEW;
    END IF;

    -- Não cria fila retroativa se o pedido já entrou marcado como impresso
    IF TG_OP = 'INSERT' AND COALESCE(NEW.print_status, 'pending') = 'printed' THEN
        RETURN NEW;
    END IF;

    IF v_order_type IN ('pickup', 'balcao', 'takeaway') OR v_table_num LIKE '%balc%' THEN
        v_channel := 'pickup';
    ELSIF v_order_type IN ('dine_in', 'mesa') OR (v_table_num <> '' AND v_table_num NOT LIKE '%balc%') THEN
        v_channel := 'dine_in';
    ELSE
        v_channel := 'delivery';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.production_sectors ps
        WHERE ps.tenant_id = NEW.tenant_id
          AND ps.is_active = true
          AND ps.operation_mode IN ('kds_and_print', 'print_only')
    ) INTO v_has_active_sectors;

    IF NOT v_has_active_sectors THEN
        INSERT INTO public.print_jobs (
            tenant_id, order_id, sector_id, sector_key, sector_name,
            printer_name, printer_type, paper_width, content_mode, copies,
            items_payload, status
        )
        VALUES (
            NEW.tenant_id, NEW.id, NULL, 'general', 'Geral',
            NULL, 'thermal_raw', '80mm', 'full_ticket', 1,
            v_items, 'pending'
        )
        ON CONFLICT (order_id, sector_key) DO NOTHING;

        RETURN NEW;
    END IF;

    FOR v_sector IN
        SELECT *
        FROM public.production_sectors ps
        WHERE ps.tenant_id = NEW.tenant_id
          AND ps.is_active = true
          AND ps.operation_mode IN ('kds_and_print', 'print_only')
        ORDER BY ps.order_index ASC, ps.created_date ASC
    LOOP
        v_allowed := COALESCE(v_sector.allowed_channels, '["delivery","pickup","dine_in"]'::jsonb);
        IF jsonb_typeof(v_allowed) = 'array' AND jsonb_array_length(v_allowed) > 0 THEN
            IF NOT (v_allowed ? v_channel) THEN
                CONTINUE;
            END IF;
        END IF;

        IF v_channel = 'delivery' AND COALESCE(v_sector.print_on_delivery, 'on_arrival') = 'on_accept' AND v_status = 'pendente' THEN
            CONTINUE;
        END IF;

        IF v_sector.content_mode IN ('full_ticket', 'short_receipt') THEN
            v_sector_items := v_items;
        ELSE
            v_sector_items := '[]'::jsonb;
            IF jsonb_typeof(v_items) = 'array' THEN
                FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
                    v_item_sector_id := NULL;
                    IF NULLIF(v_item->>'sector_id', '') IS NOT NULL THEN
                        BEGIN
                            v_item_sector_id := (v_item->>'sector_id')::uuid;
                        EXCEPTION WHEN OTHERS THEN
                            v_item_sector_id := NULL;
                        END;
                    END IF;

                    IF v_item_sector_id IS NULL AND NULLIF(v_item->>'product_id', '') IS NOT NULL THEN
                        SELECT COALESCE(p.sector_id, c.sector_id)
                        INTO v_item_sector_id
                        FROM public.products p
                        LEFT JOIN public.categories c ON c.id = COALESCE(NULLIF(v_item->>'category_id', ''), p.category_id, p.category)
                        WHERE p.id = v_item->>'product_id'
                        LIMIT 1;
                    END IF;

                    IF v_item_sector_id IS NULL AND NULLIF(v_item->>'category_id', '') IS NOT NULL THEN
                        SELECT c.sector_id INTO v_item_sector_id
                        FROM public.categories c
                        WHERE c.id = v_item->>'category_id'
                        LIMIT 1;
                    END IF;

                    IF v_item_sector_id = v_sector.id THEN
                        v_sector_items := v_sector_items || jsonb_build_array(v_item);
                    END IF;
                END LOOP;
            END IF;
        END IF;

        IF jsonb_typeof(v_sector_items) = 'array' AND jsonb_array_length(v_sector_items) > 0 THEN
            INSERT INTO public.print_jobs (
                tenant_id, order_id, sector_id, sector_key, sector_name,
                printer_name, printer_type, paper_width, content_mode, copies,
                items_payload, status
            )
            VALUES (
                NEW.tenant_id, NEW.id, v_sector.id, v_sector.id::text, v_sector.name,
                v_sector.printer_name, v_sector.printer_type, v_sector.paper_width, v_sector.content_mode,
                GREATEST(1, LEAST(5, COALESCE(v_sector.copies, 1))),
                v_sector_items, 'pending'
            )
            ON CONFLICT (order_id, sector_key) DO NOTHING;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_sync_print_jobs ON public.orders;
CREATE TRIGGER trg_orders_sync_print_jobs
    AFTER INSERT OR UPDATE OF status
    ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_orders_sync_print_jobs();

