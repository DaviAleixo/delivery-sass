-- Migração: Auto-Finalização por Tempo de Pedidos Despachados (Fallback Inteligente de 2 Horas)
-- Quando um pedido fica com status 'enviado' há mais de 2 horas (ou sem dispatched_at há mais de 3 horas),
-- o sistema conclui automaticamente como 'entregue' e credita o cashback da loja de forma segura.

CREATE OR REPLACE FUNCTION public.auto_deliver_stale_orders(
    p_tenant_id UUID DEFAULT NULL,
    p_timeout_hours INTEGER DEFAULT 2
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_stale_order RECORD;
    v_auto_count INTEGER := 0;
    v_order_ids TEXT[] := ARRAY[]::TEXT[];
BEGIN
    FOR v_stale_order IN
        SELECT id, order_number, tenant_id, cashback_earned, dispatched_at, created_date
        FROM public.orders
        WHERE status = 'enviado'
          AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
          AND (
            (dispatched_at IS NOT NULL AND dispatched_at < NOW() - (p_timeout_hours || ' hours')::INTERVAL)
            OR
            (dispatched_at IS NULL AND created_date < NOW() - ((p_timeout_hours + 1) || ' hours')::INTERVAL)
          )
    LOOP
        UPDATE public.orders
        SET status = 'entregue',
            delivered_at = NOW(),
            updated_date = NOW()
        WHERE id = v_stale_order.id;

        IF COALESCE(v_stale_order.cashback_earned, 0) > 0 THEN
            PERFORM public.process_order_cashback(v_stale_order.id, 'credit_only');
        END IF;

        v_auto_count := v_auto_count + 1;
        v_order_ids := array_append(v_order_ids, v_stale_order.id);
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'auto_delivered_count', v_auto_count,
        'order_ids', v_order_ids
    );
END;
$$;

