
CREATE TABLE public.app_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role text,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.app_feedback TO authenticated;
GRANT ALL ON public.app_feedback TO service_role;

ALTER TABLE public.app_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own feedback"
  ON public.app_feedback FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view own feedback"
  ON public.app_feedback FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Staff view all feedback"
  ON public.app_feedback FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'principal')
  );

CREATE INDEX idx_app_feedback_created_at ON public.app_feedback (created_at DESC);
