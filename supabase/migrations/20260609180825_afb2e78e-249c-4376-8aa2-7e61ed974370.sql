CREATE TABLE public.requisition_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  snapshot_data JSONB NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  is_auto BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.requisition_snapshots TO authenticated;
GRANT ALL ON public.requisition_snapshots TO service_role;
ALTER TABLE public.requisition_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage requisition snapshots" ON public.requisition_snapshots
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_requisition_snapshots_created_at ON public.requisition_snapshots (created_at DESC);