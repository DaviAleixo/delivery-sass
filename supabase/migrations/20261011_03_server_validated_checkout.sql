-- ==============================================================================
-- MIGRATION: CHECKOUT PÚBLICO VALIDADO NO SERVIDOR & TRACKING TOKEN
-- Arquivo: supabase/migrations/20261011_03_server_validated_checkout.sql
-- Status: NÃO EXECUTADO (Aguardando autorização explícita)
-- Objetivo: Validação de preços/cupons no banco e consulta segura de pedidos anônimos
-- ==============================================================================

-- 1. ADICIONA COLUNA DE TOKEN DE ACOMPANHAMENTO NA TABELA ORDERS
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS tracking_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_orders_tracking_token 
ON public.orders(id, tracking_token);

-- 2. PROCEDURE TRANSACIONAL: CRIAÇÃO DE PEDIDO COM VALIDAÇÃO NO SERVIDOR
CREATE OR REPLACE FUNCTION public.create_public_order(
    p_tenant_id UUID,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_delivery_type TEXT,
    p_delivery_address TEXT,
    p_payment_method TEXT,
    p_items JSONB,
    p_coupon_code TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_table_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant RECORD;
    v_order_id TEXT;
    v_order_number INT;
    v_tracking_token UUID := gen_random_uuid();
    v_subtotal NUMERIC(10,2) := 0;
    v_delivery_fee NUMERIC(10,2) := 0;
    v_discount NUMERIC(10,2) := 0;
    v_total NUMERIC(10,2) := 0;
    v_item JSONB;
    v_prod_id TEXT;
    v_qty NUMERIC(10,2);
    v_db_product RECORD;
    v_item_subtotal NUMERIC(10,2);
    v_verified_items JSONB := '[]'::jsonb;
    v_coupon RECORD;
BEGIN
    -- A. Valida se a loja existe e está ativa
    SELECT id, name, is_active, delivery_fee, min_order_value, free_delivery_threshold
    INTO v_tenant
    FROM public.tenants
    WHERE id = p_tenant_id;

    IF NOT FOUND OR NOT v_tenant.is_active THEN
        RETURN jsonb_build_object('success', false, 'message', 'Restaurante indisponível no momento.');
    END IF;

    -- B. Valida telefone e nome do cliente
    IF TRIM(COALESCE(p_customer_name, '')) = '' OR TRIM(COALESCE(p_customer_phone, '')) = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Nome e telefone são obrigatórios.');
    END IF;

    -- C. Valida e precifica cada item diretamente do catálogo do banco
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'O pedido deve conter pelo menos um item.');
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := v_item->>'product_id';
        v_qty := COALESCE((v_item->>'quantity')::numeric, 1);

        IF v_qty <= 0 THEN
            RETURN jsonb_build_object('success', false, 'message', 'Quantidade inválida para um dos itens.');
        END IF;

        -- Busca o produto no banco com preço autêntico
        SELECT id, name, price, available
        INTO v_db_product
        FROM public.products
        WHERE id = v_prod_id AND tenant_id = p_tenant_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'message', 'Produto não encontrado no cardápio desta loja.');
        END IF;

        IF NOT v_db_product.available THEN
            RETURN jsonb_build_object('success', false, 'message', 'O item ' || v_db_product.name || ' não está disponível.');
        END IF;

        v_item_subtotal := ROUND(v_db_product.price * v_qty, 2);
        v_subtotal := v_subtotal + v_item_subtotal;

        -- Registra item com preço garantido pelo banco
        v_verified_items := v_verified_items || jsonb_build_object(
            'product_id', v_db_product.id,
            'product_name', v_db_product.name,
            'product_price', v_db_product.price,
            'quantity', v_qty,
            'subtotal', v_item_subtotal,
            'additionals', COALESCE(v_item->'additionals', '[]'::jsonb),
            'notes', COALESCE(v_item->>'notes', '')
        );
    END LOOP;

    -- D. Valida valor mínimo do pedido
    IF v_tenant.min_order_value > 0 AND v_subtotal < v_tenant.min_order_value THEN
        RETURN jsonb_build_object('success', false, 'message', 'Valor mínimo do pedido é R$ ' || v_tenant.min_order_value);
    END IF;

    -- E. Valida e calcula cupom de desconto se fornecido
    IF p_coupon_code IS NOT NULL AND TRIM(p_coupon_code) <> '' THEN
        SELECT code, discount_type, discount_value, min_order_value, active, valid_until
        INTO v_coupon
        FROM public.coupons
        WHERE tenant_id = p_tenant_id 
          AND LOWER(code) = LOWER(TRIM(p_coupon_code))
          AND active = true
          AND (valid_until IS NULL OR valid_until >= now());

        IF FOUND THEN
            IF v_coupon.min_order_value IS NULL OR v_subtotal >= v_coupon.min_order_value THEN
                IF v_coupon.discount_type = 'percentage' THEN
                    v_discount := ROUND((v_subtotal * (v_coupon.discount_value / 100.0)), 2);
                ELSE
                    v_discount := LEAST(v_coupon.discount_value, v_subtotal);
                END IF;
            END IF;
        END IF;
    END IF;

    -- F. Valida taxa de entrega
    IF p_delivery_type = 'delivery' THEN
        IF v_tenant.free_delivery_threshold IS NOT NULL AND v_tenant.free_delivery_threshold > 0 AND v_subtotal >= v_tenant.free_delivery_threshold THEN
            v_delivery_fee := 0;
        ELSE
            v_delivery_fee := COALESCE(v_tenant.delivery_fee, 0);
        END IF;
    ELSE
        v_delivery_fee := 0;
    END IF;

    -- G. Total final auditado
    v_total := GREATEST(0, (v_subtotal + v_delivery_fee - v_discount));

    -- H. Gera número sequencial de pedido para o tenant
    SELECT COALESCE(MAX(order_number), 0) + 1
    INTO v_order_number
    FROM public.orders
    WHERE tenant_id = p_tenant_id;

    v_order_id := 'ord_' || to_char(now(), 'YYYYMMDD') || '_' || lpad(v_order_number::text, 4, '0') || '_' || substr(gen_random_uuid()::text, 1, 6);

    -- I. Insere o pedido auditado na tabela orders
    INSERT INTO public.orders (
        id, tenant_id, order_number, tracking_token, customer_name, customer_phone,
        customer_address, delivery_address, total_amount, total, subtotal, delivery_fee,
        discount_amount, discount, status, payment_method, order_type, table_number,
        notes, coupon_code, items, created_date, updated_date
    ) VALUES (
        v_order_id, p_tenant_id, v_order_number, v_tracking_token, TRIM(p_customer_name), TRIM(p_customer_phone),
        p_delivery_address, p_delivery_address, v_total, v_total, v_subtotal, v_delivery_fee,
        v_discount, v_discount, 'pendente', p_payment_method, p_delivery_type, p_table_number,
        p_notes, p_coupon_code, v_verified_items, now(), now()
    );

    -- J. Insere itens detalhados na tabela order_items
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_verified_items)
    LOOP
        INSERT INTO public.order_items (
            id, tenant_id, order_id, product_id, product_name, product_price,
            quantity, subtotal, created_date, updated_date
        ) VALUES (
            gen_random_uuid()::text, p_tenant_id, v_order_id, v_item->>'product_id',
            v_item->>'product_name', (v_item->>'product_price')::numeric,
            (v_item->>'quantity')::numeric, (v_item->>'subtotal')::numeric, now(), now()
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'tracking_token', v_tracking_token,
        'total', v_total,
        'subtotal', v_subtotal,
        'delivery_fee', v_delivery_fee,
        'discount', v_discount,
        'status', 'pendente',
        'message', 'Pedido criado com sucesso!'
    );
END;
$$;

-- 3. PROCEDURE SEGURA DE CONSULTA POR TRACKING TOKEN
CREATE OR REPLACE FUNCTION public.get_order_by_tracking_token(
    p_order_id TEXT,
    p_tracking_token UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
BEGIN
    SELECT 
        o.id, o.tenant_id, o.order_number, o.customer_name, o.customer_phone,
        o.delivery_address, o.total, o.subtotal, o.delivery_fee, o.discount,
        o.status, o.payment_method, o.order_type, o.table_number, o.notes,
        o.items, o.created_date, o.updated_date,
        t.name AS restaurant_name, t.phone AS restaurant_phone
    INTO v_order
    FROM public.orders o
    JOIN public.tenants t ON t.id = o.tenant_id
    WHERE o.id = p_order_id 
      AND o.tracking_token = p_tracking_token;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pedido não encontrado ou token inválido.');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order', to_jsonb(v_order)
    );
END;
$$;

-- Permissões de Execução
GRANT EXECUTE ON FUNCTION public.create_public_order TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_order_by_tracking_token TO anon, authenticated, service_role;
