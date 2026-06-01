CREATE TABLE public.timetable_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  snapshot_data jsonb NOT NULL,
  is_auto boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.timetable_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage timetable snapshots"
ON public.timetable_snapshots
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_timetable_snapshots_created_at ON public.timetable_snapshots (created_at DESC);
