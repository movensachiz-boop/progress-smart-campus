
CREATE OR REPLACE FUNCTION public.verify_payment_hash(
  p_receipt_number text,
  p_amount text,
  p_student_profile_id text,
  p_created_at text,
  p_stored_hash text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  computed_hash text;
BEGIN
  computed_hash := encode(
    digest(
      COALESCE(p_receipt_number, '') || '|' ||
      p_amount || '|' ||
      p_student_profile_id || '|' ||
      p_created_at || '|' ||
      'PCC-SECURE-2025',
      'sha256'
    ),
    'hex'
  );
  RETURN computed_hash = p_stored_hash;
END;
$$;
