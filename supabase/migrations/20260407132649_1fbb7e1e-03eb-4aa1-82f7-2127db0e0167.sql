
-- Add beginner_only flag to fee_requirements
ALTER TABLE public.fee_requirements ADD COLUMN beginner_only boolean NOT NULL DEFAULT false;

-- Mark all Admission items as beginner-only
UPDATE public.fee_requirements SET beginner_only = true WHERE item_name = 'Admission';

-- Update the fee summary function to respect beginner_only flag
CREATE OR REPLACE FUNCTION public.get_student_fee_summary()
RETURNS TABLE (
  profile_id uuid,
  total_fees numeric,
  total_paid numeric,
  balance numeric,
  payment_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
        -- For beginner students include all categories; for returning only 'fees'
        (p.is_beginner = true) OR (fr.category = 'fees')
      )
      AND (
        -- Skip beginner_only items for non-beginner students
        (fr.beginner_only = false) OR (p.is_beginner = true)
      )
      AND (
        fr.learning_area IS NULL
        OR fr.learning_area = p.stream
      )
  ) fee_calc ON true
  LEFT JOIN LATERAL (
    SELECT SUM(pay.amount) AS total_paid
    FROM payments pay
    WHERE pay.student_profile_id = p.id
      AND pay.status IN ('paid', 'completed')
  ) pay_calc ON true
  WHERE p.form IS NOT NULL;
$$;
