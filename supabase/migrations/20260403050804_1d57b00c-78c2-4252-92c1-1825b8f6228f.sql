
CREATE POLICY "Students can view own photo"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'student-photos'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND registration_number = split_part(storage.objects.name, '.', 1)
  )
);
