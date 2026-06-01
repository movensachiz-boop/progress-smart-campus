CREATE TABLE IF NOT EXISTS public.payment_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid,
  student_profile_id uuid,
  action text NOT NULL,
  actor_user_id uuid,
  actor_email text,
  amount numeric,
  currency text,
  status text,
  method text,
  receipt_number text,
  before_data jsonb,
  after_data jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pal_payment_id ON public.payment_audit_log(payment_id);
CREATE INDEX IF NOT EXISTS idx_pal_student ON public.payment_audit_log(student_profile_id);
CREATE INDEX IF NOT EXISTS idx_pal_created_at ON public.payment_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pal_actor ON public.payment_audit_log(actor_user_id);

ALTER TABLE public.payment_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit log"
  ON public.payment_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owners can view audit log"
  ON public.payment_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Authenticated can insert audit log"
  ON public.payment_audit_log FOR INSERT TO authenticated
  WITH CHECK (true);

-- No update / no delete policies → effectively immutable

CREATE OR REPLACE FUNCTION public.log_payment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text;
  v_action text;
BEGIN
  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = v_actor;
  EXCEPTION WHEN OTHERS THEN v_email := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
    INSERT INTO public.payment_audit_log (
      payment_id, student_profile_id, action, actor_user_id, actor_email,
      amount, currency, status, method, receipt_number, after_data
    ) VALUES (
      NEW.id, NEW.student_profile_id, v_action, v_actor, v_email,
      NEW.amount, NEW.currency, NEW.status, NEW.method, NEW.receipt_number, to_jsonb(NEW)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW IS DISTINCT FROM OLD THEN
      IF NEW.status = 'voided' AND OLD.status <> 'voided' THEN v_action := 'voided';
      ELSIF NEW.status = 'refunded' AND OLD.status <> 'refunded' THEN v_action := 'refunded';
      ELSIF NEW.status <> OLD.status THEN v_action := 'status_changed';
      ELSE v_action := 'updated';
      END IF;
      INSERT INTO public.payment_audit_log (
        payment_id, student_profile_id, action, actor_user_id, actor_email,
        amount, currency, status, method, receipt_number, before_data, after_data
      ) VALUES (
        NEW.id, NEW.student_profile_id, v_action, v_actor, v_email,
        NEW.amount, NEW.currency, NEW.status, NEW.method, NEW.receipt_number,
        to_jsonb(OLD), to_jsonb(NEW)
      );
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_audit ON public.payments;
CREATE TRIGGER trg_payment_audit
AFTER INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.log_payment_change();