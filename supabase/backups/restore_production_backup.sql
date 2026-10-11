-- ==============================================================================
-- SCRIPT DE RESTAURAÇÃO COMPLETA DO BACKUP DE PRODUÇÃO
-- Arquivo: supabase/backups/restore_production_backup.sql
-- Gerado em: 2026-10-11T13:42:00Z
-- Projeto: zecuwijuiqsaoeafonsv
-- ==============================================================================

BEGIN;

-- 1. TENANTS (Lojas)
INSERT INTO public.tenants (
    id, slug, name, plan, custom_domain, is_active, logo_url, banner_url,
    theme_config, phone, whatsapp, address, instagram, delivery_fee, min_order_value,
    delivery_time, opening_time, closing_time, open_days, manual_store_open, manual_override_date,
    created_date, updated_date, cep, address_number, address_street, address_neighborhood,
    address_city, address_state, address_complement, delivery_fee_type, delivery_neighborhoods,
    delivery_unlisted_policy, delivery_fallback_fee, free_delivery_threshold
) VALUES (
    '5489690b-a8dd-4f5e-bd75-de339521ac47', 'teste', 'teste', 'basic', NULL, TRUE, NULL, NULL,
    '{"layout_style":"standard","primary_color":"#E11D48","secondary_color":"#111827"}'::jsonb,
    NULL, '(31) 98260-7426', 'Alameda Dois de Novembro, nº 44, Queluz, Conselheiro Lafaiete - MG',
    'davialeixo_nogueira', 0, 0, '40-50 min', '16:00', '00:00',
    '[{"day":1,"enabled":true,"closing_time":"00:00","opening_time":"16:00"},{"day":2,"enabled":true,"closing_time":"00:00","opening_time":"16:00"},{"day":3,"enabled":true,"closing_time":"00:00","opening_time":"16:00"},{"day":4,"enabled":true,"closing_time":"00:00","opening_time":"16:00"},{"day":5,"enabled":true,"closing_time":"00:00","opening_time":"16:00"},{"day":6,"enabled":true,"closing_time":"00:00","opening_time":"16:00"},{"day":0,"enabled":true,"closing_time":"00:00","opening_time":"16:00"}]'::jsonb,
    TRUE, NULL, '2026-10-10T17:39:34.660032+00:00', '2026-10-11T04:57:02.909957+00:00',
    '36405-030', '44', 'Alameda Dois de Novembro', 'Queluz', 'Conselheiro Lafaiete', 'MG', NULL,
    'neighborhood',
    '[{"id":"nh_1791674609021","fee":5,"name":"Centro","active":true,"time_estimate":"25-35 min"},{"id":"nh_1791674609142","fee":5,"name":"Jd. América","active":true,"time_estimate":"35-45 min"}]'::jsonb,
    'block', 10, NULL
) ON CONFLICT (id) DO UPDATE SET
    slug = EXCLUDED.slug,
    name = EXCLUDED.name,
    theme_config = EXCLUDED.theme_config,
    updated_date = EXCLUDED.updated_date;

INSERT INTO public.tenants (
    id, slug, name, plan, custom_domain, is_active, logo_url, banner_url,
    theme_config, phone, whatsapp, address, instagram, delivery_fee, min_order_value,
    delivery_time, opening_time, closing_time, open_days, manual_store_open, manual_override_date,
    created_date, updated_date, cep, address_number, address_street, address_neighborhood,
    address_city, address_state, address_complement, delivery_fee_type, delivery_neighborhoods,
    delivery_unlisted_policy, delivery_fallback_fee, free_delivery_threshold
) VALUES (
    'a0000000-0000-0000-0000-000000000001', 'vruum-burguer', 'Vruum Burguer', 'premium', NULL, TRUE, NULL, NULL,
    '{"layout_style":"premium","primary_color":"#E11D48","secondary_color":"#111827"}'::jsonb,
    '(11) 99999-9999', '11999999999', 'Av. Principal, 100 - Centro', '', 5, 20,
    '40-50 min', '18:00', '23:59',
    '["segunda","terca","quarta","quinta","sexta","sabado","domingo"]'::jsonb,
    NULL, NULL, '2026-10-11T06:24:36.124775+00:00', '2026-10-11T06:24:36.124775+00:00',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'fixed', '[]'::jsonb, 'block', 10, NULL
) ON CONFLICT (id) DO UPDATE SET
    slug = EXCLUDED.slug,
    name = EXCLUDED.name,
    theme_config = EXCLUDED.theme_config,
    updated_date = EXCLUDED.updated_date;

-- 2. CATEGORIES
INSERT INTO public.categories (
    id, tenant_id, name, order_index, is_combo, created_date, updated_date
) VALUES (
    'categories_1791672824242_efbs6x', '5489690b-a8dd-4f5e-bd75-de339521ac47', 'teste', 0, FALSE,
    '2026-10-10T22:53:44.242+00:00', '2026-10-10T22:53:44.93166+00:00'
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    updated_date = EXCLUDED.updated_date;

-- 3. PRODUCTS
INSERT INTO public.products (
    id, tenant_id, name, description, price, category, category_id,
    image_url, available, popular, created_date, updated_date
) VALUES (
    'products_1791672854204_p8qjz0', '5489690b-a8dd-4f5e-bd75-de339521ac47', 'teste', 'teste', 28.9,
    'categories_1791672824242_efbs6x', NULL,
    'https://zecuwijuiqsaoeafonsv.supabase.co/storage/v1/object/public/restaurant-images/uploads/1791672849273_97o97_flex_jpeg.webp',
    TRUE, FALSE, '2026-10-10T22:54:14.204+00:00', '2026-10-11T04:35:12.524056+00:00'
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    price = EXCLUDED.price,
    available = EXCLUDED.available,
    updated_date = EXCLUDED.updated_date;

-- 4. COMPLEMENT_GROUPS
INSERT INTO public.complement_groups (
    id, tenant_id, name, description, min_quantity, max_quantity, required, active, order_index, created_date, updated_date
) VALUES (
    'complement_groups_1791672897954_5ayblh', '5489690b-a8dd-4f5e-bd75-de339521ac47', 'EXTRA', 'EXTRA', 0, 15, FALSE, TRUE, 1,
    '2026-10-10T22:54:57.954+00:00', '2026-10-10T22:54:58.651654+00:00'
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    active = EXCLUDED.active,
    updated_date = EXCLUDED.updated_date;

-- 5. COMPLEMENT_ITEMS
INSERT INTO public.complement_items (
    id, tenant_id, group_id, name, description, price, max_quantity, image_url, active, order_index, created_date, updated_date
) VALUES (
    'complement_items_1791672917189_krfqya', '5489690b-a8dd-4f5e-bd75-de339521ac47', 'complement_groups_1791672897954_5ayblh',
    'Bacon', '', 3.00, 1, NULL, TRUE, 1, '2026-10-10T22:55:17.189+00:00', '2026-10-10T22:55:17.899723+00:00'
), (
    'complement_items_1791672936249_wz8lnn', '5489690b-a8dd-4f5e-bd75-de339521ac47', 'complement_groups_1791672897954_5ayblh',
    'maionese', 'verde', 2.00, 1, NULL, TRUE, 2, '2026-10-10T22:55:36.249+00:00', '2026-10-10T22:55:36.91726+00:00'
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    price = EXCLUDED.price,
    active = EXCLUDED.active,
    updated_date = EXCLUDED.updated_date;

-- 6. PRODUCT_COMPLEMENT_GROUPS
INSERT INTO public.product_complement_groups (
    id, tenant_id, product_id, group_id, order_index, created_date
) VALUES (
    'product_complement_groups_1791672951958_qtlqqf', '5489690b-a8dd-4f5e-bd75-de339521ac47',
    'products_1791672854204_p8qjz0', 'complement_groups_1791672897954_5ayblh', 1, '2026-10-10T22:55:51.958+00:00'
) ON CONFLICT (id) DO NOTHING;

-- 7. BANNER_IMAGES
INSERT INTO public.banner_images (
    id, tenant_id, title, image_url, order_index, active, created_date, updated_date
) VALUES (
    'banner_images_1791670390241_pqtyva', '5489690b-a8dd-4f5e-bd75-de339521ac47', '',
    'https://zecuwijuiqsaoeafonsv.supabase.co/storage/v1/object/public/restaurant-images/uploads/1791670387983_nmufk_Banner_gastron_mico_.webp',
    0, TRUE, '2026-10-10T22:13:10.241+00:00', '2026-10-10T22:13:10.917078+00:00'
) ON CONFLICT (id) DO UPDATE SET
    image_url = EXCLUDED.image_url,
    active = EXCLUDED.active,
    updated_date = EXCLUDED.updated_date;

COMMIT;
