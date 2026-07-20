DROP POLICY IF EXISTS "Staff view all results" ON public.exam_results;
CREATE POLICY "Staff view all results"
ON public.exam_results
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'owner'::public.app_role)
  OR public.has_role(auth.uid(), 'teacher'::public.app_role)
);

DROP POLICY IF EXISTS "Admins manage results" ON public.exam_results;
CREATE POLICY "Admins and owners manage results"
ON public.exam_results
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'owner'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'owner'::public.app_role)
);