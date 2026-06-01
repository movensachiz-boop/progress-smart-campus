
-- Create storage bucket for student photos
INSERT INTO storage.buckets (id, name, public) VALUES ('student-photos', 'student-photos', true);

-- Anyone can view photos (needed for ID card PDF generation)
CREATE POLICY "Student photos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'student-photos');

-- Admins can upload photos
CREATE POLICY "Admins can upload student photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'student-photos' AND public.has_role(auth.uid(), 'admin'));

-- Admins can update photos
CREATE POLICY "Admins can update student photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'student-photos' AND public.has_role(auth.uid(), 'admin'));

-- Admins can delete photos
CREATE POLICY "Admins can delete student photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'student-photos' AND public.has_role(auth.uid(), 'admin'));
