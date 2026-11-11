-- Estrutura do Banco PostgreSQL & Políticas RLS:
-- 1. Saneamento do único registro histórico duplicado de (tenant_id, order_number) e criação do índice UNIQUE
-- 2. Atualização explícita de delete_tenant cobrindo todas as novas tabelas filhas (preservando system_issues)
-- 3. Remoção dos 4 avisos de multiple_permissive_policies em tenants, tenant_admins e system_issues

-- ============================================================================
-- 1. Renumerar duplicata histórica em orders e criar UNIQUE (tenant_id, order_number)
-- ============================================================================
DO $$
DECLARE
    v_dup RECORD;
    v_next_num INT;
BEGIN
    -- Aproveita a lacuna #4 existente no tenant 'teste' caso o registro legado duplicado #3 ainda esteja presente
    IF EXISTS (
        SELECT 1 FROM public.orders
        WHERE id = '63df245d-82ca-4159-83e9-dc0064ad9cbf'
          AND tenant_id = '5489690b-a8dd-4f5e-bd75-de339521ac47'::uuid
          AND order_number = 3
    ) AND NOT EXISTS (
        SELECT 1 FROM public.orders
        WHERE tenant_id = '5489690b-a8dd-4f5e-bd75-de339521ac47'::uuid
          AND order_number = 4
    ) THEN
        UPDATE public.orders
        SET order_number = 4
        WHERE id = '63df245d-82ca-4159-83e9-dc0064ad9cbf';
    END IF;

    -- Fallback seguro para quaisquer outras eventuais duplicatas de (tenant_id, order_number)
    FOR v_dup IN
        SELECT id, tenant_id
        FROM (
            SELECT id,
                   tenant_id,
                   ROW_NUMBER() OVER (
                       PARTITION BY tenant_id, order_number
                       ORDER BY created_date ASC NULLS FIRST, id ASC
                   ) AS rn
            FROM public.orders
            WHERE order_number IS NOT NULL
        ) ranked
        WHERE rn > 1
    LOOP
        SELECT COALESCE(MAX(order_number), 0) + 1
        INTO v_next_num
        FROM public.orders
        WHERE tenant_id = v_dup.tenant_id;

        UPDATE public.orders
        SET order_number = v_next_num
        WHERE id = v_dup.id;
    END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_tenant_order_number
    ON public.orders (tenant_id, order_number)
    WHERE order_number IS NOT NULL;

-- ============================================================================
-- 2. delete_tenant explícita e completa para todas as tabelas do SaaS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_tenant(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
    v_slug TEXT;
    v_name TEXT;
    v_auth_user_ids UUID[];
BEGIN
    IF NOT (public.is_super_admin() IS TRUE OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Acesso negado: Apenas o SuperAdmin pode excluir estabelecimentos.';
    END IF;

    SELECT slug, name INTO v_slug, v_name
    FROM public.tenants
    WHERE id = p_tenant_id;

    IF v_slug IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Empresa não encontrada.');
    END IF;

    -- Coleta os IDs de contas Auth vinculadas ao tenant
    SELECT ARRAY(
        SELECT DISTINCT uid
        FROM (
            SELECT user_id AS uid FROM public.tenant_admins WHERE tenant_id = p_tenant_id AND user_id IS NOT NULL
            UNION
            SELECT id AS uid FROM public.admin_users WHERE tenant_id = p_tenant_id AND id IS NOT NULL
        ) sub
    ) INTO v_auth_user_ids;

    -- Exclusão explícita em ordem segura de dependências (system_issues preserva histórico via SET NULL)
    DELETE FROM public.print_jobs WHERE tenant_id = p_tenant_id;
    DELETE FROM public.customer_cashback_transactions WHERE tenant_id = p_tenant_id;
    DELETE FROM public.customer_cashback_wallets WHERE tenant_id = p_tenant_id;
    DELETE FROM public.customer_sessions WHERE tenant_id = p_tenant_id;
    DELETE FROM public.whatsapp_otp_codes WHERE tenant_id = p_tenant_id;
    DELETE FROM public.shift_closings WHERE tenant_id = p_tenant_id;
    DELETE FROM public.order_items WHERE tenant_id = p_tenant_id;
    DELETE FROM public.orders WHERE tenant_id = p_tenant_id;
    DELETE FROM public.table_sessions WHERE tenant_id = p_tenant_id;
    DELETE FROM public.restaurant_tables WHERE tenant_id = p_tenant_id;
    DELETE FROM public.user_addresses WHERE tenant_id = p_tenant_id;
    DELETE FROM public.customers WHERE tenant_id = p_tenant_id;
    DELETE FROM public.coupon_usages WHERE tenant_id = p_tenant_id;
    DELETE FROM public.coupons WHERE tenant_id = p_tenant_id;
    DELETE FROM public.banner_images WHERE tenant_id = p_tenant_id;
    DELETE FROM public.banners WHERE tenant_id = p_tenant_id;
    DELETE FROM public.product_complement_groups WHERE tenant_id = p_tenant_id;
    DELETE FROM public.complement_items WHERE tenant_id = p_tenant_id;
    DELETE FROM public.complement_groups WHERE tenant_id = p_tenant_id;
    DELETE FROM public.product_additionals WHERE tenant_id = p_tenant_id;
    DELETE FROM public.products WHERE tenant_id = p_tenant_id;
    DELETE FROM public.categories WHERE tenant_id = p_tenant_id;
    DELETE FROM public.production_sectors WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenant_admins WHERE tenant_id = p_tenant_id;
    DELETE FROM public.admin_users WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenants WHERE id = p_tenant_id;

    -- Exclusão das contas do Supabase Auth associadas
    IF v_auth_user_ids IS NOT NULL AND array_length(v_auth_user_ids, 1) > 0 THEN
        DELETE FROM auth.identities WHERE user_id = ANY(v_auth_user_ids);
        DELETE FROM auth.users WHERE id = ANY(v_auth_user_ids);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'deleted_name', v_name,
        'message', 'Restaurante ' || v_name || ' e todas as suas contas de acesso foram removidos com sucesso!'
    );
END;
$function$;

-- ============================================================================
-- 3. Eliminar os 4 avisos de multiple_permissive_policies (authenticated)
-- ============================================================================
DROP POLICY IF EXISTS tenants_manage_superadmin ON public.tenants;
CREATE POLICY tenants_insert_superadmin
    ON public.tenants FOR INSERT
    TO authenticated
    WITH CHECK (public.is_super_admin());
CREATE POLICY tenants_delete_superadmin
    ON public.tenants FOR DELETE
    TO authenticated
    USING (public.is_super_admin());

DROP POLICY IF EXISTS tenant_admins_manage_super ON public.tenant_admins;
CREATE POLICY tenant_admins_insert_super
    ON public.tenant_admins FOR INSERT
    TO authenticated
    WITH CHECK (public.is_super_admin());
CREATE POLICY tenant_admins_update_super
    ON public.tenant_admins FOR UPDATE
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());
CREATE POLICY tenant_admins_delete_super
    ON public.tenant_admins FOR DELETE
    TO authenticated
    USING (public.is_super_admin());

DROP POLICY IF EXISTS system_issues_superadmin_manage ON public.system_issues;
CREATE POLICY system_issues_superadmin_select
    ON public.system_issues FOR SELECT
    TO authenticated
    USING (public.is_super_admin());
CREATE POLICY system_issues_superadmin_update
    ON public.system_issues FOR UPDATE
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());
CREATE POLICY system_issues_superadmin_delete
    ON public.system_issues FOR DELETE
    TO authenticated
    USING (public.is_super_admin());

