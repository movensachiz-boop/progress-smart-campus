
-- 1. Remove overly broad student photo SELECT policy
DROP POLICY IF EXISTS "Authenticated can view student photos" ON storage.objects;

-- Photos are served via admin context or embedded in pages, 
-- students don't need direct storage access

-- 2. Allow students to view deposit slips for their own payments
CREATE POLICY "Students can view own deposit slips"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'deposit-slips' 
  AND EXISTS (
    SELECT 1 FROM public.payments p
    JOIN public.profiles pr ON p.student_profile_id = pr.id
    WHERE pr.user_id = auth.uid()
    AND p.deposit_slip_url LIKE '%' || storage.objects.name
  )
);

-- 3. Verify user_roles INSERT is properly restricted (it already is, but let's be explicit)
-- The existing policy "Admins can insert roles" has WITH CHECK: has_role(auth.uid(), 'admin')
-- This is correct - non-admins cannot insert roles
