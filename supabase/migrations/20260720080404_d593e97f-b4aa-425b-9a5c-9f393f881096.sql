
CREATE POLICY "Principals can view all profiles"
ON public.profiles FOR SELECT
USING (public.has_role(auth.uid(), 'principal'));

CREATE POLICY "Principals view all results"
ON public.exam_results FOR SELECT
USING (public.has_role(auth.uid(), 'principal'));
