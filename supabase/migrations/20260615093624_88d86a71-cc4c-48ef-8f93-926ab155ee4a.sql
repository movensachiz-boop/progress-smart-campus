
-- ============ EXAMS ============
CREATE TABLE public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  exam_type text NOT NULL DEFAULT 'mid-term',
  term int NOT NULL DEFAULT 1,
  year int NOT NULL DEFAULT EXTRACT(YEAR FROM now())::int,
  form_levels int[] NOT NULL DEFAULT '{}',
  published boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.exams TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.exams TO authenticated;
GRANT ALL ON public.exams TO service_role;

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view exams" ON public.exams
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage exams" ON public.exams
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_exams_updated_at
  BEFORE UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ EXAM RESULTS ============
CREATE TABLE public.exam_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_code text NOT NULL,
  subject_name text,
  mark numeric(5,2),
  grade text,
  points int,
  entered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(exam_id, student_profile_id, subject_code)
);

CREATE INDEX idx_exam_results_exam ON public.exam_results(exam_id);
CREATE INDEX idx_exam_results_student ON public.exam_results(student_profile_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_results TO authenticated;
GRANT ALL ON public.exam_results TO service_role;

ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;

-- Students see only their own results (and only when exam is published)
CREATE POLICY "Students view own published results" ON public.exam_results
  FOR SELECT TO authenticated
  USING (
    student_profile_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_id AND e.published = true)
  );

-- Staff (admin/teacher) can view all results
CREATE POLICY "Staff view all results" ON public.exam_results
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'teacher')
  );

-- Admins fully manage results
CREATE POLICY "Admins manage results" ON public.exam_results
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Teachers can insert/update results
CREATE POLICY "Teachers insert results" ON public.exam_results
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'teacher'));

CREATE POLICY "Teachers update results" ON public.exam_results
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'teacher'))
  WITH CHECK (public.has_role(auth.uid(), 'teacher'));

CREATE TRIGGER trg_exam_results_updated_at
  BEFORE UPDATE ON public.exam_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
