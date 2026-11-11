-- ============================================================================
-- Fase 5: Hardening de Storage Multi-Tenant (Bloqueio SVG + Isolamento por Tenant)
-- 1. Remove 'image/svg+xml' de allowed_mime_types do bucket 'restaurant-images'
-- 2. Revoga INSERT público anônimo em storage.objects
-- 3. Restringe INSERT/UPDATE/DELETE em 'restaurant-images' estritamente à pasta
--    tenants/<tenant_id>/... do admin autenticado ou SuperAdmin
-- ============================================================================

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'restaurant-images';

DROP POLICY IF EXISTS "Authorized upload restaurant images" ON storage.objects;
DROP POLICY IF EXISTS "Admin delete restaurant images" ON storage.objects;
DROP POLICY IF EXISTS "Admin update restaurant images" ON storage.objects;
DROP POLICY IF EXISTS "Tenant isolated upload restaurant images" ON storage.objects;
DROP POLICY IF EXISTS "Tenant isolated update restaurant images" ON storage.objects;
DROP POLICY IF EXISTS "Tenant isolated delete restaurant images" ON storage.objects;

CREATE POLICY "Tenant isolated upload restaurant images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'restaurant-images'
    AND (
        public.is_super_admin() IS TRUE
        OR (
            public.get_auth_tenant_id() IS NOT NULL
            AND public.is_authorized_for_tenant(public.get_auth_tenant_id()) IS TRUE
            AND name LIKE ('tenants/' || public.get_auth_tenant_id()::text || '/%')
            AND name NOT LIKE '%..%'
        )
    )
);

CREATE POLICY "Tenant isolated update restaurant images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'restaurant-images'
    AND (
        public.is_super_admin() IS TRUE
        OR (
            public.get_auth_tenant_id() IS NOT NULL
            AND public.is_authorized_for_tenant(public.get_auth_tenant_id()) IS TRUE
            AND name LIKE ('tenants/' || public.get_auth_tenant_id()::text || '/%')
        )
    )
)
WITH CHECK (
    bucket_id = 'restaurant-images'
    AND (
        public.is_super_admin() IS TRUE
        OR (
            public.get_auth_tenant_id() IS NOT NULL
            AND public.is_authorized_for_tenant(public.get_auth_tenant_id()) IS TRUE
            AND name LIKE ('tenants/' || public.get_auth_tenant_id()::text || '/%')
            AND name NOT LIKE '%..%'
        )
    )
);

CREATE POLICY "Tenant isolated delete restaurant images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'restaurant-images'
    AND (
        public.is_super_admin() IS TRUE
        OR (
            public.get_auth_tenant_id() IS NOT NULL
            AND public.is_authorized_for_tenant(public.get_auth_tenant_id()) IS TRUE
            AND name LIKE ('tenants/' || public.get_auth_tenant_id()::text || '/%')
        )
    )
);

