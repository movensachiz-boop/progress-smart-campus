
-- Make user_id nullable so admin can pre-register without auth user
ALTER TABLE public.profiles ALTER COLUMN user_id DROP NOT NULL;

-- Add claimed flag
ALTER TABLE public.profiles ADD COLUMN claimed BOOLEAN NOT NULL DEFAULT false;

-- Drop the unique constraint on user_id since it can now be null
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_id_key;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);

-- Allow anon to check if a registration number exists (for claim flow)
CREATE POLICY "Anyone can check registration number"
  ON public.profiles FOR SELECT
  TO anon
  USING (true);
