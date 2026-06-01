
CREATE INDEX IF NOT EXISTS idx_profiles_registration_number ON public.profiles (registration_number);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_form ON public.profiles (form);
CREATE INDEX IF NOT EXISTS idx_payments_student_profile_id ON public.payments (student_profile_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments (status);
CREATE INDEX IF NOT EXISTS idx_attendance_student_profile_id ON public.attendance (student_profile_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance (date);
