CREATE OR REPLACE FUNCTION public.verify_document_fingerprint(p_bank_name text, p_swift_code text, p_transaction_id_format text, p_amount text)
 RETURNS TABLE(match_found boolean, matching_payment_id uuid, matching_receipt_number text, matching_student text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  computed_fp text;
BEGIN
  computed_fp := encode(
    extensions.digest(
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

CREATE OR REPLACE FUNCTION public.generate_verification_hash()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  NEW.verification_hash := encode(
    extensions.digest(
      COALESCE(NEW.receipt_number, '') || '|' ||
      NEW.amount::text || '|' ||
      NEW.student_profile_id::text || '|' ||
      NEW.created_at::text || '|' ||
      'PCC-SECURE-2025',
      'sha256'
    ),
    'hex'
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_payment_hash(p_receipt_number text, p_amount text, p_student_profile_id text, p_created_at text, p_stored_hash text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  computed_hash text;
BEGIN
  computed_hash := encode(
    extensions.digest(
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
$function$;