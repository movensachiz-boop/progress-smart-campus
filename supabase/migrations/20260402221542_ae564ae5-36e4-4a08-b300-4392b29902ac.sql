
-- Drop overly permissive anon policies
DROP POLICY "Service can insert payments" ON public.payments;
DROP POLICY "Service can update payments" ON public.payments;

-- Students can insert their own payments
CREATE POLICY "Students can insert own payments"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (
  student_profile_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Students can update their own pending payments
CREATE POLICY "Students can update own payments"
ON public.payments
FOR UPDATE
TO authenticated
USING (
  student_profile_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  )
);
