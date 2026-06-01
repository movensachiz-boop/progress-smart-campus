-- Delete erroneous $100 payment(s)
DELETE FROM public.payments WHERE amount = 100;

-- Allow admins to delete payments going forward
CREATE POLICY "Admins can delete payments"
ON public.payments
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Cloud backup snapshots for payments (mirrors timetable_snapshots)
CREATE TABLE public.payment_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  snapshot_data JSONB NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  is_auto BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_snapshots_created_at ON public.payment_snapshots(created_at DESC);

ALTER TABLE public.payment_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage payment snapshots"
ON public.payment_snapshots
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));