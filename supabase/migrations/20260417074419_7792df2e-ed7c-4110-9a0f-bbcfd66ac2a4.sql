-- Owner read-only policies
CREATE POLICY "Owners can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Owners can view all payments"
ON public.payments
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Owners can view all attendance"
ON public.attendance
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'owner'::app_role));