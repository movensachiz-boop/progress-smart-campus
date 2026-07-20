GRANT SELECT ON public.timetable_snapshots TO authenticated;
GRANT ALL ON public.timetable_snapshots TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'timetable_snapshots'
      AND policyname = 'Teachers can view timetable snapshots'
  ) THEN
    CREATE POLICY "Teachers can view timetable snapshots"
    ON public.timetable_snapshots
    FOR SELECT
    TO authenticated
    USING (
      public.has_role(auth.uid(), 'teacher'::public.app_role)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'owner'::public.app_role)
    );
  END IF;
END $$;