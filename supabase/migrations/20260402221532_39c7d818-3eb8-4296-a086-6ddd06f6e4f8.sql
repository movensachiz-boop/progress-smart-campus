
-- Create payments table
CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  paynow_reference TEXT,
  poll_url TEXT,
  receipt_number TEXT,
  phone TEXT,
  description TEXT DEFAULT 'School Fees Payment',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Auto-generate receipt numbers
CREATE SEQUENCE receipt_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_receipt_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.receipt_number := 'RCP-' || LPAD(nextval('receipt_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_receipt_number
BEFORE INSERT ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.generate_receipt_number();

-- Update timestamp trigger
CREATE TRIGGER update_payments_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Students can view their own payments
CREATE POLICY "Students can view own payments"
ON public.payments
FOR SELECT
TO authenticated
USING (
  student_profile_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Admins can view all payments
CREATE POLICY "Admins can view all payments"
ON public.payments
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Admins can insert payments
CREATE POLICY "Admins can insert payments"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Admins can update payments
CREATE POLICY "Admins can update payments"
ON public.payments
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Service role inserts (for edge function)
CREATE POLICY "Service can insert payments"
ON public.payments
FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "Service can update payments"
ON public.payments
FOR UPDATE
TO anon
USING (true);

-- Enable realtime for payment status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
