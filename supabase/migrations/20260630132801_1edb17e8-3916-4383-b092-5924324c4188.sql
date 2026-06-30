
CREATE POLICY "Students can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students can upload own selfie"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'student-photos');

CREATE POLICY "Students can update own selfie"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'student-photos')
  WITH CHECK (bucket_id = 'student-photos');
