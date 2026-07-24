
-- 1. class_teacher_assignments
CREATE TABLE public.class_teacher_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_user_id uuid NOT NULL,
  class_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_user_id, class_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_teacher_assignments TO authenticated;
GRANT ALL ON public.class_teacher_assignments TO service_role;
ALTER TABLE public.class_teacher_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cta_read_all_authenticated" ON public.class_teacher_assignments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "cta_teacher_insert_self" ON public.class_teacher_assignments
  FOR INSERT TO authenticated WITH CHECK (teacher_user_id = auth.uid());
CREATE POLICY "cta_teacher_delete_self" ON public.class_teacher_assignments
  FOR DELETE TO authenticated USING (
    teacher_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'owner')
  );

-- 2. exam_comments
CREATE TABLE public.exam_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL,
  student_profile_id uuid NOT NULL,
  comment_type text NOT NULL CHECK (comment_type IN ('subject_teacher','class_teacher','principal')),
  author_user_id uuid NOT NULL,
  subject_code text,
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_profile_id, comment_type, author_user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_comments TO authenticated;
GRANT ALL ON public.exam_comments TO service_role;
ALTER TABLE public.exam_comments ENABLE ROW LEVEL SECURITY;

-- SELECT: author, staff, or the owning student
CREATE POLICY "exam_comments_select" ON public.exam_comments
  FOR SELECT TO authenticated USING (
    author_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'principal')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = exam_comments.student_profile_id AND p.user_id = auth.uid()
    )
  );

-- INSERT: author writes their own; type must match their role
CREATE POLICY "exam_comments_insert" ON public.exam_comments
  FOR INSERT TO authenticated WITH CHECK (
    author_user_id = auth.uid() AND (
      (comment_type = 'subject_teacher' AND public.has_role(auth.uid(), 'teacher'))
      OR (comment_type = 'class_teacher' AND public.has_role(auth.uid(), 'teacher'))
      OR (comment_type = 'principal' AND public.has_role(auth.uid(), 'principal'))
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'owner')
    )
  );

CREATE POLICY "exam_comments_update" ON public.exam_comments
  FOR UPDATE TO authenticated USING (
    author_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'owner')
  ) WITH CHECK (
    author_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'owner')
  );

CREATE POLICY "exam_comments_delete" ON public.exam_comments
  FOR DELETE TO authenticated USING (
    author_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'owner')
  );

CREATE TRIGGER trg_exam_comments_updated_at
  BEFORE UPDATE ON public.exam_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_exam_comments_exam_student ON public.exam_comments(exam_id, student_profile_id);
CREATE INDEX idx_cta_teacher ON public.class_teacher_assignments(teacher_user_id);
