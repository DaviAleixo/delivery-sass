-- ==============================================================================
-- Migration: 20261012_08_catalog_rls_fix.sql
-- Descrição: Ajusta permissões de RLS para produtos, categorias e complementos,
-- garantindo que atualizações de preços, fotos e visibilidade persistam sem bloqueio.
-- ==============================================================================

-- 1. Produtos
DROP POLICY IF EXISTS "Admin manage products" ON public.products;
DROP POLICY IF EXISTS "Public read available products" ON public.products;
DROP POLICY IF EXISTS "Public and admin select products" ON public.products;

CREATE POLICY "Public and admin select products"
    ON public.products FOR SELECT
    TO anon, authenticated
    USING (TRUE);

CREATE POLICY "Admin manage products"
    ON public.products FOR ALL
    TO anon, authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

-- 2. Categorias
DROP POLICY IF EXISTS "Admin manage categories" ON public.categories;
DROP POLICY IF EXISTS "Public read categories" ON public.categories;
DROP POLICY IF EXISTS "Public and admin manage categories" ON public.categories;

CREATE POLICY "Public and admin manage categories"
    ON public.categories FOR ALL
    TO anon, authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

-- 3. Grupos de complementos
DROP POLICY IF EXISTS "Admin manage complement_groups" ON public.complement_groups;
DROP POLICY IF EXISTS "Public and admin manage complement_groups" ON public.complement_groups;

CREATE POLICY "Public and admin manage complement_groups"
    ON public.complement_groups FOR ALL
    TO anon, authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

-- 4. Itens de complementos
DROP POLICY IF EXISTS "Admin manage complement_items" ON public.complement_items;
DROP POLICY IF EXISTS "Public and admin manage complement_items" ON public.complement_items;

CREATE POLICY "Public and admin manage complement_items"
    ON public.complement_items FOR ALL
    TO anon, authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

-- 5. Adicionais de produtos
DROP POLICY IF EXISTS "Allow public read product additionals" ON public.product_additionals;
DROP POLICY IF EXISTS "Allow admin manage product additionals" ON public.product_additionals;

CREATE POLICY "Public and admin manage product additionals"
    ON public.product_additionals FOR ALL
    TO anon, authenticated
    USING (TRUE)
    WITH CHECK (TRUE);
