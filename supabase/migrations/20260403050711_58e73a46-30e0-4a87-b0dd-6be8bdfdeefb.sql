
-- Remove old public policies
DROP POLICY IF EXISTS "Deposit slips are publicly viewable" ON storage.objects;
DROP POLICY IF EXISTS "Student photos are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update student photos" ON storage.objects;

-- Fix student profile UPDATE to only allow safe fields
DROP POLICY IF EXISTS "Students can update own profile" ON public.profiles;

-- Students should not be able to update balance, status, registration_number, or claimed
-- We'll handle profile updates through edge functions instead
-- For now, no student UPDATE policy (admin-only updates)
