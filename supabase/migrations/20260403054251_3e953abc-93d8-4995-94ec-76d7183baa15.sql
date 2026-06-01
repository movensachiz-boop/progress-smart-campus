-- Create attendance table
CREATE TABLE public.attendance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'present',
  class_id TEXT,
  marked_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(student_profile_id, date)
);

-- Enable RLS
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Admin policies: full access
CREATE POLICY "Admins can view all attendance"
  ON public.attendance FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert attendance"
  ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update attendance"
  ON public.attendance FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete attendance"
  ON public.attendance FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Teacher policies: can view and mark attendance only
CREATE POLICY "Teachers can view all attendance"
  ON public.attendance FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'teacher'));

CREATE POLICY "Teachers can insert attendance"
  ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'teacher'));

CREATE POLICY "Teachers can update attendance"
  ON public.attendance FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'teacher'));

-- Student: view own attendance only
CREATE POLICY "Students can view own attendance"
  ON public.attendance FOR SELECT TO authenticated
  USING (student_profile_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  ));

-- Teacher access to profiles (non-sensitive fields accessed via view)
CREATE POLICY "Teachers can view student profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'teacher'));

-- Create a view exposing only non-sensitive student data for teachers
CREATE VIEW public.student_roster
WITH (security_invoker = on) AS
  SELECT id, first_name, last_name, form, stream, registration_number, status
  FROM public.profiles;

-- Trigger for updated_at
CREATE TRIGGER update_attendance_updated_at
  BEFORE UPDATE ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();