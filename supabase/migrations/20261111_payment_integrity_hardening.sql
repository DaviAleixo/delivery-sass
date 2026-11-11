-- Payment Integrity Hardening:
-- Prevent converting an already-paid PIX order back to payment_status = 'pending_delivery'

CREATE OR REPLACE FUNCTION public.convert_pix_order_to_delivery(
    p_order_id text,
    p_tracking_token uuid,
    p_payment_method text DEFAULT 'card_delivery'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_order RECORD;
    v_next_status TEXT := 'pendente';
BEGIN
    SELECT o.*, t.auto_accept_delivery
    INTO v_order
    FROM public.orders o
    JOIN public.tenants t ON t.id = o.tenant_id
    WHERE o.id = p_order_id AND o.tracking_token = p_tracking_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pedido não encontrado ou token inválido.');
    END IF;

    IF LOWER(COALESCE(v_order.payment_status, '')) = 'paid' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Este pedido já teve o pagamento aprovado e não pode ser convertido.');
    END IF;

    IF v_order.status NOT IN ('aguardando_pagamento', 'pendente') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Este pedido não pode mais alterar a forma de pagamento.');
    END IF;

    IF COALESCE(v_order.auto_accept_delivery, false) = true AND COALESCE(v_order.order_type, 'delivery') = 'delivery' THEN
        v_next_status := 'confirmado';
    END IF;

    UPDATE public.orders
    SET payment_method = p_payment_method,
        payment_status = 'pending_delivery',
        status = v_next_status,
        updated_date = NOW()
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true, 'status', v_next_status, 'payment_status', 'pending_delivery');
END;
$function$;

