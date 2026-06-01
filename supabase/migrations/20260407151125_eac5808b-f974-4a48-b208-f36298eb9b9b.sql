
-- Add returning_only column
ALTER TABLE public.fee_requirements ADD COLUMN returning_only boolean NOT NULL DEFAULT false;

-- Update fee summary function to handle returning_only
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
      -- Beginner/returning filtering
      AND (
        (p.is_beginner = true AND fr.returning_only = false)
        OR (p.is_beginner = false AND fr.beginner_only = false)
      )
      -- Non-beginner students only see fees category
      AND (
        (p.is_beginner = true) OR (fr.category = 'fees')
      )
      -- Learning area filter
      AND (
        fr.learning_area IS NULL
        OR fr.learning_area = p.stream
      )
      -- Gender filter
      AND (
        fr.gender = 'all'
        OR fr.gender = CASE WHEN p.gender = 'male' THEN 'boys' WHEN p.gender = 'female' THEN 'girls' ELSE 'all' END
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
