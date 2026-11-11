-- Realtime & Synchronization Hardening:
-- Add table_sessions, restaurant_tables, and print_jobs to supabase_realtime publication
-- and enable REPLICA IDENTITY FULL so UPDATE/DELETE payloads include complete row state.

ALTER TABLE public.table_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.restaurant_tables REPLICA IDENTITY FULL;
ALTER TABLE public.print_jobs REPLICA IDENTITY FULL;

DO $$
DECLARE
    v_tbl TEXT;
BEGIN
    FOREACH v_tbl IN ARRAY ARRAY['table_sessions', 'restaurant_tables', 'print_jobs'] LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = v_tbl
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_tbl);
        END IF;
    END LOOP;
END $$;

