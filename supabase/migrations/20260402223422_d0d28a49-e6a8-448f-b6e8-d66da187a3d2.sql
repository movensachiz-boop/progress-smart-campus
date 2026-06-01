
-- Add deposit slip URL column to payments
ALTER TABLE public.payments ADD COLUMN deposit_slip_url text;

-- Create storage bucket for deposit slips
INSERT INTO storage.buckets (id, name, public) VALUES ('deposit-slips', 'deposit-slips', true);

-- Allow public read access to deposit slips
CREATE POLICY "Deposit slips are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'deposit-slips');

-- Admins can upload deposit slips
CREATE POLICY "Admins can upload deposit slips"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'deposit-slips' AND EXISTS (
  SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
));

-- Admins can delete deposit slips
CREATE POLICY "Admins can delete deposit slips"
ON storage.objects FOR DELETE
USING (bucket_id = 'deposit-slips' AND EXISTS (
  SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
));
