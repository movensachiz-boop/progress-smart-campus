
-- 1. Terms table
CREATE TABLE IF NOT EXISTS public.terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_number integer NOT NULL CHECK (term_number BETWEEN 1 AND 3),
  year integer NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (term_number, year)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.terms TO authenticated;
GRANT ALL ON public.terms TO service_role;

ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view terms" ON public.terms
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage terms" ON public.terms
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

-- Only one current term at a time
CREATE UNIQUE INDEX IF NOT EXISTS terms_one_current
  ON public.terms (is_current) WHERE is_current = true;

-- 2. Helper: current term id
CREATE OR REPLACE FUNCTION public.current_term_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.terms WHERE is_current = true LIMIT 1;
$$;

-- 3. Trigger to auto-fill term_id
CREATE OR REPLACE FUNCTION public.set_term_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.term_id IS NULL THEN
    NEW.term_id := public.current_term_id();
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Seed default term
INSERT INTO public.terms (term_number, year, is_current)
VALUES (1, EXTRACT(YEAR FROM now())::int, true)
ON CONFLICT (term_number, year) DO UPDATE SET is_current = true;

-- 5. Add term_id to transactional tables + trigger + backfill
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'payments','exam_results','attendance','announcements',
    'requisitions','fund_expenses','inventory_sales',
    'kitchen_issues','kitchen_meals'
  ];
  current_tid uuid;
BEGIN
  SELECT id INTO current_tid FROM public.terms WHERE is_current = true LIMIT 1;

  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS term_id uuid REFERENCES public.terms(id)',
      t
    );
    EXECUTE format('UPDATE public.%I SET term_id = %L WHERE term_id IS NULL', t, current_tid);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (term_id)', t || '_term_idx', t);
    EXECUTE format('DROP TRIGGER IF EXISTS set_term_id_trg ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER set_term_id_trg BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_term_id()',
      t
    );
  END LOOP;
END $$;
