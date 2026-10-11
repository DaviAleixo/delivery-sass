-- ==============================================================================
-- MIGRATION: POLÍTICAS RLS ESTRITAS (HARDENING COMPLETO MULTI-TENANT)
-- Arquivo: supabase/migrations/20261011_04_strict_rls_hardening.sql
-- Status: NÃO EXECUTADO (Aguardando autorização explícita)
-- Objetivo: Garantir isolamento impenetrável sem políticas USING (TRUE)
-- ==============================================================================

-- ==============================================================================
-- 1. TABELA TENANTS
-- ==============================================================================
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public delete tenants" ON public.tenants;
DROP POLICY IF EXISTS "Allow public insert tenants" ON public.tenants;
DROP POLICY IF EXISTS "Allow public update tenants" ON public.tenants;
DROP POLICY IF EXISTS "Public read active tenants" ON public.tenants;
DROP POLICY IF EXISTS "Service role full access tenants" ON public.tenants;

-- Público pode ler apenas lojas ativas
CREATE POLICY "Public read active tenants"
    ON public.tenants FOR SELECT
    TO anon, authenticated
    USING (is_active = true);

-- Apenas administradores do próprio restaurante podem atualizar suas configurações
CREATE POLICY "Admin update own tenant"
    ON public.tenants FOR UPDATE
    TO authenticated
    USING (id = public.get_auth_tenant_id() OR public.is_super_admin())
    WITH CHECK (id = public.get_auth_tenant_id() OR public.is_super_admin());

-- Criação e deleção de lojas restritas a superadmin ou service_role
CREATE POLICY "Superadmin manage tenants"
    ON public.tenants FOR ALL
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Service role full tenants"
    ON public.tenants FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


-- ==============================================================================
-- 2. TABELA ADMIN_USERS
-- ==============================================================================
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access admin_users" ON public.admin_users;

-- Totalmente bloqueada para acesso anônimo público
CREATE POLICY "Block public read admin_users"
    ON public.admin_users FOR ALL
    TO anon
    USING (false)
    WITH CHECK (false);

CREATE POLICY "Superadmin manage admin_users"
    ON public.admin_users FOR ALL
    TO authenticated
    USING (public.is_super_admin() OR tenant_id = public.get_auth_tenant_id())
    WITH CHECK (public.is_super_admin() OR tenant_id = public.get_auth_tenant_id());

CREATE POLICY "Service role full admin_users"
    ON public.admin_users FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


-- ==============================================================================
-- 3. PRODUTOS, CATEGORIAS E COMPLEMENTOS (CARDÁPIO)
-- ==============================================================================
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complement_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_complement_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow admin manage categories" ON public.categories;
DROP POLICY IF EXISTS "Public read categories" ON public.categories;
DROP POLICY IF EXISTS "Allow admin manage products" ON public.products;
DROP POLICY IF EXISTS "Public read products" ON public.products;
DROP POLICY IF EXISTS "Allow admin manage groups" ON public.complement_groups;
DROP POLICY IF EXISTS "Public read complement_groups" ON public.complement_groups;
DROP POLICY IF EXISTS "Allow admin manage items" ON public.complement_items;
DROP POLICY IF EXISTS "Public read complement_items" ON public.complement_items;
DROP POLICY IF EXISTS "Allow admin manage prod_groups" ON public.product_complement_groups;
DROP POLICY IF EXISTS "Public read product_complement_groups" ON public.product_complement_groups;

-- Leituras Públicas: Somente itens disponíveis do catálogo
CREATE POLICY "Public read categories"
    ON public.categories FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Public read available products"
    ON public.products FOR SELECT
    TO anon, authenticated
    USING (available = true);

CREATE POLICY "Public read active complement_groups"
    ON public.complement_groups FOR SELECT
    TO anon, authenticated
    USING (active = true);

CREATE POLICY "Public read active complement_items"
    ON public.complement_items FOR SELECT
    TO anon, authenticated
    USING (active = true);

CREATE POLICY "Public read product_complement_groups"
    ON public.product_complement_groups FOR SELECT
    TO anon, authenticated
    USING (true);

-- Modificações (INSERT, UPDATE, DELETE): Isoladas estritamente por tenant_id
CREATE POLICY "Admin manage categories"
    ON public.categories FOR ALL
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "Admin manage products"
    ON public.products FOR ALL
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "Admin manage complement_groups"
    ON public.complement_groups FOR ALL
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "Admin manage complement_items"
    ON public.complement_items FOR ALL
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "Admin manage product_complement_groups"
    ON public.product_complement_groups FOR ALL
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());


-- ==============================================================================
-- 4. BANNERS E CUPONS
-- ==============================================================================
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banner_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow admin manage banners" ON public.banners;
DROP POLICY IF EXISTS "Public read banners" ON public.banners;
DROP POLICY IF EXISTS "Allow admin manage banner_images" ON public.banner_images;
DROP POLICY IF EXISTS "Public read banner_images" ON public.banner_images;
DROP POLICY IF EXISTS "Allow admin manage coupons" ON public.coupons;
DROP POLICY IF EXISTS "Public read coupons" ON public.coupons;

CREATE POLICY "Public read banners"
    ON public.banners FOR SELECT
    TO anon, authenticated
    USING (active = true);

CREATE POLICY "Public read banner_images"
    ON public.banner_images FOR SELECT
    TO anon, authenticated
    USING (active = true);

CREATE POLICY "Public read active coupons"
    ON public.coupons FOR SELECT
    TO anon, authenticated
    USING (active = true AND (valid_until IS NULL OR valid_until >= now()));

CREATE POLICY "Admin manage banners"
    ON public.banners FOR ALL
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "Admin manage banner_images"
    ON public.banner_images FOR ALL
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "Admin manage coupons"
    ON public.coupons FOR ALL
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());


-- ==============================================================================
-- 5. PEDIDOS (ORDERS) E ITENS (ORDER_ITEMS)
-- ==============================================================================
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read own orders" ON public.orders;
DROP POLICY IF EXISTS "Public insert orders" ON public.orders;
DROP POLICY IF EXISTS "Allow admin update orders" ON public.orders;
DROP POLICY IF EXISTS "Public read order_items" ON public.order_items;
DROP POLICY IF EXISTS "Public insert order_items" ON public.order_items;

-- Apenas operadores do restaurante do pedido ou superadmin podem ler ou alterar pedidos diretamente
CREATE POLICY "Admin view tenant orders"
    ON public.orders FOR SELECT
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "Admin update tenant orders"
    ON public.orders FOR UPDATE
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "Admin view tenant order_items"
    ON public.order_items FOR SELECT
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "Service role full orders"
    ON public.orders FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role full order_items"
    ON public.order_items FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


-- ==============================================================================
-- 6. CLIENTES (CUSTOMERS)
-- ==============================================================================
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read customers" ON public.customers;
DROP POLICY IF EXISTS "Public insert customers" ON public.customers;
DROP POLICY IF EXISTS "Public update customers" ON public.customers;

-- Clientes só podem ser gerenciados pelo administrador do tenant correspondente ou service_role
CREATE POLICY "Admin view tenant customers"
    ON public.customers FOR SELECT
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "Admin manage tenant customers"
    ON public.customers FOR ALL
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "Service role full customers"
    ON public.customers FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


-- ==============================================================================
-- 7. STORAGE BUCKET (restaurant-images)
-- ==============================================================================
DROP POLICY IF EXISTS "Anyone can delete restaurant-images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update restaurant-images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload to restaurant-images" ON storage.objects;
DROP POLICY IF EXISTS "Public can view restaurant-images" ON storage.objects;

-- Público pode visualizar qualquer imagem do bucket
CREATE POLICY "Public view restaurant images"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'restaurant-images');

-- Upload permitido para autenticados e clientes autorizados
CREATE POLICY "Authorized upload restaurant images"
    ON storage.objects FOR INSERT
    TO public
    WITH CHECK (bucket_id = 'restaurant-images');

-- Exclusão restrita exclusivamente a administradores autenticados ou service_role
CREATE POLICY "Admin delete restaurant images"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'restaurant-images');
