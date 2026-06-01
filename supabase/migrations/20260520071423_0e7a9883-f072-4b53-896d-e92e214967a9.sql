
ALTER TABLE public.goods_received ADD COLUMN IF NOT EXISTS receipt_urls text[] DEFAULT '{}'::text[];
ALTER TABLE public.goods_received ADD COLUMN IF NOT EXISTS total_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.goods_received ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';

INSERT INTO storage.buckets (id, name, public) VALUES ('grn-receipts', 'grn-receipts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins read grn-receipts"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'grn-receipts' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins upload grn-receipts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'grn-receipts' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete grn-receipts"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'grn-receipts' AND public.has_role(auth.uid(), 'admin'::app_role));
