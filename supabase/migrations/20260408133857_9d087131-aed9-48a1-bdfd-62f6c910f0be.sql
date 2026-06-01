CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.verify_document_fingerprint(p_bank_name text, p_swift_code text, p_transaction_id_format text, p_amount text)
 RETURNS TABLE(match_found boolean, matching_payment_id uuid, matching_receipt_number text, matching_student text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  computed_fp text;
BEGIN
  computed_fp := encode(
    digest(
      COALESCE(p_bank_name, '') || '|' ||
      COALESCE(p_swift_code, '') || '|' ||
      COALESCE(p_transaction_id_format, '') || '|' ||
      p_amount || '|' ||
      'PCC-DOC-FINGERPRINT-2025',
      'sha256'
    ),
    'hex'
  );

  RETURN QUERY
  SELECT
    true AS match_found,
    p.id AS matching_payment_id,
    p.receipt_number AS matching_receipt_number,
    pr.first_name || ' ' || pr.last_name AS matching_student
  FROM payments p
  LEFT JOIN profiles pr ON pr.id = p.student_profile_id
  WHERE p.document_fingerprint = computed_fp
  LIMIT 1;
END;
$function$;