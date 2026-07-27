CREATE TABLE public.student_class_terms (
  term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  student_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  form text,
  stream text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (term_id, student_profile_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_class_terms TO authenticated;
GRANT ALL ON public.student_class_terms TO service_role;

ALTER TABLE public.student_class_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sct read all authenticated"
  ON public.student_class_terms FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "sct staff write"
  ON public.student_class_terms FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'principal')
    OR public.has_role(auth.uid(), 'it_assistant')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'principal')
    OR public.has_role(auth.uid(), 'it_assistant')
  );

CREATE TRIGGER update_student_class_terms_updated_at
  BEFORE UPDATE ON public.student_class_terms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_sct_term_form_stream ON public.student_class_terms (term_id, form, stream);
CREATE INDEX idx_sct_student ON public.student_class_terms (student_profile_id);

-- Backfill: seed every existing term with the current profile classes
INSERT INTO public.student_class_terms (term_id, student_profile_id, form, stream)
SELECT t.id, p.id, p.form, p.stream
FROM public.terms t
CROSS JOIN public.profiles p
WHERE p.form IS NOT NULL AND p.stream IS NOT NULL
ON CONFLICT (term_id, student_profile_id) DO NOTHING;