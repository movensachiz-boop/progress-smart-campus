
-- Known bank document patterns for validation
CREATE TABLE public.bank_document_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name text NOT NULL UNIQUE,
  swift_code text NOT NULL,
  transaction_id_format text NOT NULL,
  id_regex text NOT NULL,
  sample_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_document_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage bank patterns"
  ON public.bank_document_patterns FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow edge functions (service role) to read patterns
CREATE POLICY "Service role can read patterns"
  ON public.bank_document_patterns FOR SELECT
  TO service_role
  USING (true);

-- Seed known Zimbabwean bank patterns
INSERT INTO public.bank_document_patterns (bank_name, swift_code, transaction_id_format, id_regex, sample_reference) VALUES
  ('Ecobank Zimbabwe', 'EABORZIHA', 'SMTXXXXXXXXXX (16 alphanumeric)', '^SMT[A-Z0-9]{13,14}$', 'SMTEZWDTGBS9Y7Q8'),
  ('NBS Building Society', 'NBSZZIHA', 'DEP-NNNNNN (numeric sequence)', '^DEP-[0-9]{4,8}$', 'DEP-004521'),
  ('CBZ Bank', 'CBZWZWHA', 'CBZ-XXXXXXXXXX (alphanumeric)', '^CBZ-[A-Z0-9]{6,12}$', 'CBZ-TXN8834A1'),
  ('Stanbic Bank Zimbabwe', 'SBICZWHA', 'STB-XXXXXXXXXX (alphanumeric)', '^STB-[A-Z0-9]{6,12}$', 'STB-REF992341'),
  ('FBC Bank', 'FBCPZWHA', 'FBC-XXXXXXXXXX (alphanumeric)', '^FBC-[A-Z0-9]{6,12}$', 'FBC-PAY443210'),
  ('ZB Bank', 'ZBCOZWHA', 'ZB-XXXXXXXXXX (alphanumeric)', '^ZB-[A-Z0-9]{6,12}$', 'ZB-TRX7721A9');

CREATE TRIGGER update_bank_patterns_updated_at
  BEFORE UPDATE ON public.bank_document_patterns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
