
-- Device sessions table: track active sessions per user (max 2 devices)
CREATE TABLE public.device_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ip_address text NOT NULL,
  device_fingerprint text NOT NULL,
  user_agent text,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one session per user per device fingerprint
ALTER TABLE public.device_sessions
  ADD CONSTRAINT unique_user_device UNIQUE (user_id, device_fingerprint);

-- Index for quick lookup
CREATE INDEX idx_device_sessions_user ON public.device_sessions(user_id);

-- Enable RLS
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;

-- Only admins and the user themselves can see their sessions
CREATE POLICY "Users can view own sessions"
  ON public.device_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all sessions"
  ON public.device_sessions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add verification_hash column to payments for tamper-proof receipts
ALTER TABLE public.payments
  ADD COLUMN verification_hash text;

-- Function to generate SHA-256 verification hash on payment insert
CREATE OR REPLACE FUNCTION public.generate_verification_hash()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Hash = SHA-256 of (receipt_number + amount + student_profile_id + created_at + secret salt)
  NEW.verification_hash := encode(
    digest(
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
$$;

-- Trigger: auto-generate hash on insert
CREATE TRIGGER set_verification_hash
  BEFORE INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_verification_hash();

-- Enable pgcrypto for digest function (if not already)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
