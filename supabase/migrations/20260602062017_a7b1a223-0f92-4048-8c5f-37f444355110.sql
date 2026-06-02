
-- 1. Add residency to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS residency text NOT NULL DEFAULT 'day'
  CHECK (residency IN ('day', 'boarder'));

-- 2. Add residency filter to fee_requirements
ALTER TABLE public.fee_requirements
  ADD COLUMN IF NOT EXISTS residency text NOT NULL DEFAULT 'all'
  CHECK (residency IN ('all', 'day', 'boarder'));

-- 3. Reseed fees: remove existing 'fees' category items, then insert new structure
DELETE FROM public.fee_requirements WHERE category = 'fees';

INSERT INTO public.fee_requirements (item_name, category, form_levels, learning_area, gender, amount, residency, notes, sort_order) VALUES
  -- Form 1-4 Day Scholars
  ('Tuition (Form 1-4)', 'fees', ARRAY['1','2','3','4'], NULL, 'all', 770, 'day', 'Day scholar tuition', 10),
  ('Transport (Form 1-4)', 'fees', ARRAY['1','2','3','4'], NULL, 'all', 100, 'day', 'Day scholar transport', 11),
  -- Form 1-4 Boarders
  ('Boarding (Form 1-4)', 'fees', ARRAY['1','2','3','4'], NULL, 'all', 1300, 'boarder', 'Boarders all-inclusive', 12),

  -- Form 5-6 Sciences Day
  ('Tuition (A-Level Sciences)', 'fees', ARRAY['5','6'], 'Sciences', 'all', 850, 'day', 'Day scholar tuition', 20),
  ('Transport (A-Level Sciences)', 'fees', ARRAY['5','6'], 'Sciences', 'all', 100, 'day', 'Day scholar transport', 21),
  -- Form 5-6 Sciences Boarder
  ('Boarding (A-Level Sciences)', 'fees', ARRAY['5','6'], 'Sciences', 'all', 1400, 'boarder', 'Boarders all-inclusive', 22),

  -- Form 5-6 Commercials Day
  ('Tuition (A-Level Commercials)', 'fees', ARRAY['5','6'], 'Commercials', 'all', 800, 'day', 'Day scholar tuition', 30),
  ('Transport (A-Level Commercials)', 'fees', ARRAY['5','6'], 'Commercials', 'all', 100, 'day', 'Day scholar transport', 31),
  -- Form 5-6 Commercials Boarder
  ('Boarding (A-Level Commercials)', 'fees', ARRAY['5','6'], 'Commercials', 'all', 1350, 'boarder', 'Boarders all-inclusive', 32),

  -- Form 5-6 Arts Day
  ('Tuition (A-Level Arts)', 'fees', ARRAY['5','6'], 'Arts', 'all', 800, 'day', 'Day scholar tuition', 40),
  ('Transport (A-Level Arts)', 'fees', ARRAY['5','6'], 'Arts', 'all', 100, 'day', 'Day scholar transport', 41),
  ('Boarding (A-Level Arts)', 'fees', ARRAY['5','6'], 'Arts', 'all', 1350, 'boarder', 'Boarders all-inclusive', 42);

-- 4. Update fee summary function to honor residency
CREATE OR REPLACE FUNCTION public.get_student_fee_summary()
 RETURNS TABLE(profile_id uuid, total_fees numeric, total_paid numeric, balance numeric, payment_status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id AS profile_id,
    COALESCE(fee_calc.total_fees, 0) AS total_fees,
    COALESCE(pay_calc.total_paid, 0) AS total_paid,
    COALESCE(pay_calc.total_paid, 0) - COALESCE(fee_calc.total_fees, 0) AS balance,
    CASE
      WHEN COALESCE(fee_calc.total_fees, 0) = 0 THEN 'No Fees'
      WHEN COALESCE(pay_calc.total_paid, 0) >= COALESCE(fee_calc.total_fees, 0) THEN
        CASE WHEN COALESCE(pay_calc.total_paid, 0) > COALESCE(fee_calc.total_fees, 0) THEN 'Overpaid' ELSE 'Paid in Full' END
      ELSE 'Outstanding'
    END AS payment_status
  FROM profiles p
  LEFT JOIN LATERAL (
    SELECT SUM(fr.amount) AS total_fees
    FROM fee_requirements fr
    WHERE fr.is_active = true
      AND p.form = ANY(fr.form_levels)
      AND (
        (p.is_beginner = true AND fr.returning_only = false)
        OR (p.is_beginner = false AND fr.beginner_only = false)
      )
      AND (
        (p.is_beginner = true) OR (fr.category = 'fees')
      )
      AND (fr.learning_area IS NULL OR fr.learning_area = p.stream)
      AND (
        fr.gender = 'all'
        OR fr.gender = CASE WHEN p.gender = 'male' THEN 'boys' WHEN p.gender = 'female' THEN 'girls' ELSE 'all' END
      )
      AND (fr.residency = 'all' OR fr.residency = p.residency)
  ) fee_calc ON true
  LEFT JOIN LATERAL (
    SELECT SUM(pay.amount) AS total_paid
    FROM payments pay
    WHERE pay.student_profile_id = p.id
      AND pay.status IN ('paid', 'completed')
  ) pay_calc ON true
  WHERE p.form IS NOT NULL;
$function$;

-- 5. Payment Vouchers table (procurement: money handover record)
CREATE TABLE public.payment_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_number text UNIQUE,
  purchase_order_id uuid,
  supplier_name text,
  paid_to text NOT NULL,
  paid_by text NOT NULL,
  received_by text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  method text NOT NULL DEFAULT 'cash',
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_vouchers TO authenticated;
GRANT ALL ON public.payment_vouchers TO service_role;

ALTER TABLE public.payment_vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage payment vouchers"
  ON public.payment_vouchers FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owners view payment vouchers"
  ON public.payment_vouchers FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role));

CREATE SEQUENCE IF NOT EXISTS payment_voucher_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_voucher_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.voucher_number IS NULL THEN
    NEW.voucher_number := 'PV-' || LPAD(nextval('payment_voucher_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_voucher_number
  BEFORE INSERT ON public.payment_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.generate_voucher_number();

CREATE TRIGGER update_payment_vouchers_updated_at
  BEFORE UPDATE ON public.payment_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
