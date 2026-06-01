
CREATE OR REPLACE FUNCTION public.auto_unset_beginner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prev_count integer;
BEGIN
  -- Count existing paid payments for this student (excluding current)
  SELECT COUNT(*) INTO prev_count
  FROM payments
  WHERE student_profile_id = NEW.student_profile_id
    AND status IN ('paid', 'completed')
    AND id != NEW.id;

  -- If student already has a previous payment, they're no longer a beginner
  IF prev_count > 0 THEN
    UPDATE profiles SET is_beginner = false WHERE id = NEW.student_profile_id AND is_beginner = true;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_unset_beginner
AFTER INSERT OR UPDATE ON public.payments
FOR EACH ROW
WHEN (NEW.status IN ('paid', 'completed'))
EXECUTE FUNCTION public.auto_unset_beginner();
