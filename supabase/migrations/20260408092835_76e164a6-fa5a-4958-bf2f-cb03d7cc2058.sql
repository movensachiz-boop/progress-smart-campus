
-- 1. Fix: Students can only insert payments with status='pending'
DROP POLICY IF EXISTS "Students can insert own payments" ON public.payments;
CREATE POLICY "Students can insert own payments"
  ON public.payments FOR INSERT
  TO authenticated
  WITH CHECK (
    status = 'pending'
    AND student_profile_id IN (
      SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()
    )
  );

-- Add CHECK constraint for valid payment statuses
ALTER TABLE public.payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending', 'processing', 'paid', 'completed', 'failed', 'cancelled'));

-- 2. Fix: Announcements role filtering enforced server-side
DROP POLICY IF EXISTS "Anyone authenticated can view announcements" ON public.announcements;
CREATE POLICY "Authenticated users view targeted announcements"
  ON public.announcements FOR SELECT
  TO authenticated
  USING (
    target_role = 'all'
    OR has_role(auth.uid(), target_role::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- 3. Fix: Fee requirements should only be readable by authenticated users
DROP POLICY IF EXISTS "Anyone can view fee requirements" ON public.fee_requirements;
CREATE POLICY "Authenticated users can view fee requirements"
  ON public.fee_requirements FOR SELECT
  TO authenticated
  USING (true);
