
-- Remove payments from realtime (correct syntax)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.payments;
  END IF;
END;
$$;
