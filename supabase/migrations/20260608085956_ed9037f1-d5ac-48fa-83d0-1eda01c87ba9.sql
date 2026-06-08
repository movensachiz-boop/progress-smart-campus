
ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS image_url text;

CREATE POLICY "Admins manage requisition scans"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'requisition-scans' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'requisition-scans' AND public.has_role(auth.uid(), 'admin'));
