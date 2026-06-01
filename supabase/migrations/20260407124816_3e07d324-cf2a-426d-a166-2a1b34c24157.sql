
CREATE TABLE public.fee_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name text NOT NULL,
  category text NOT NULL DEFAULT 'fees',
  form_levels text[] NOT NULL DEFAULT '{}',
  learning_area text NULL,
  gender text NOT NULL DEFAULT 'all',
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  notes text NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fee_requirements ENABLE ROW LEVEL SECURITY;

-- Anyone can view fee requirements (public info)
CREATE POLICY "Anyone can view fee requirements"
ON public.fee_requirements FOR SELECT
USING (true);

-- Admins can manage fee requirements
CREATE POLICY "Admins can insert fee requirements"
ON public.fee_requirements FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update fee requirements"
ON public.fee_requirements FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete fee requirements"
ON public.fee_requirements FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Timestamp trigger
CREATE TRIGGER update_fee_requirements_updated_at
BEFORE UPDATE ON public.fee_requirements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
