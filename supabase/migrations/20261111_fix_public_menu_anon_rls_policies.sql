-- Separate anon vs authenticated SELECT policies on public catalog/coupon/banner tables
-- so Postgres never evaluates get_auth_tenant_id() / is_super_admin() under anon role when active = false/null.

DROP POLICY IF EXISTS complement_groups_public_select ON public.complement_groups;
CREATE POLICY complement_groups_anon_select ON public.complement_groups
  FOR SELECT TO anon USING (active = true);
CREATE POLICY complement_groups_auth_select ON public.complement_groups
  FOR SELECT TO authenticated USING (active = true OR tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

DROP POLICY IF EXISTS complement_items_public_select ON public.complement_items;
CREATE POLICY complement_items_anon_select ON public.complement_items
  FOR SELECT TO anon USING (active = true);
CREATE POLICY complement_items_auth_select ON public.complement_items
  FOR SELECT TO authenticated USING (active = true OR tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

DROP POLICY IF EXISTS product_additionals_public_select ON public.product_additionals;
CREATE POLICY product_additionals_anon_select ON public.product_additionals
  FOR SELECT TO anon USING (active = true);
CREATE POLICY product_additionals_auth_select ON public.product_additionals
  FOR SELECT TO authenticated USING (active = true OR tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

DROP POLICY IF EXISTS banner_images_public_select ON public.banner_images;
CREATE POLICY banner_images_anon_select ON public.banner_images
  FOR SELECT TO anon USING (active = true);
CREATE POLICY banner_images_auth_select ON public.banner_images
  FOR SELECT TO authenticated USING (active = true OR tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

DROP POLICY IF EXISTS banners_public_select ON public.banners;
CREATE POLICY banners_anon_select ON public.banners
  FOR SELECT TO anon USING (active = true);
CREATE POLICY banners_auth_select ON public.banners
  FOR SELECT TO authenticated USING (active = true OR tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

DROP POLICY IF EXISTS coupons_public_select ON public.coupons;
CREATE POLICY coupons_anon_select ON public.coupons
  FOR SELECT TO anon USING (active = true AND (end_date IS NULL OR end_date >= now()));
CREATE POLICY coupons_auth_select ON public.coupons
  FOR SELECT TO authenticated USING ((active = true AND (end_date IS NULL OR end_date >= now())) OR tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

