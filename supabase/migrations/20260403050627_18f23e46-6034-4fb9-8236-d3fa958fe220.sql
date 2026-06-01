
-- 1. Remove the dangerous anon policy on profiles
DROP POLICY IF EXISTS "Anyone can check registration number" ON public.profiles;
DROP POLICY IF EXISTS "Anon can check registration number only" ON public.profiles;

-- 2. Remove student UPDATE on payments (students should NOT modify payment records)
DROP POLICY IF EXISTS "Students can update own payments" ON public.payments;

-- 3. Make storage buckets private
UPDATE storage.buckets SET public = false WHERE id IN ('deposit-slips', 'student-photos');

-- 4. Fix storage policies for deposit-slips
DROP POLICY IF EXISTS "Public can view deposit slips" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view deposit slips" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload deposit slips" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete deposit slips" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage deposit slips" ON storage.objects;

CREATE POLICY "Admins full access deposit slips"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'deposit-slips' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'deposit-slips' AND public.has_role(auth.uid(), 'admin'));

-- 5. Fix storage policies for student-photos
DROP POLICY IF EXISTS "Public can view student photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view student photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload student photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete student photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage student photos" ON storage.objects;
DROP POLICY IF EXISTS "Students can view student photos" ON storage.objects;

CREATE POLICY "Admins full access student photos"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'student-photos' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'student-photos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can view student photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'student-photos');
