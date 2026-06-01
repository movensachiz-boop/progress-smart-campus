
DELETE FROM public.payments;
DELETE FROM public.attendance;

-- Delete auth users linked to student profiles (virtual @pcc.local accounts)
DELETE FROM auth.users WHERE id IN (
  SELECT p.user_id FROM public.profiles p
  WHERE p.user_id IS NOT NULL
    AND NOT public.has_role(p.user_id, 'admin')
    AND NOT public.has_role(p.user_id, 'teacher')
    AND NOT public.has_role(p.user_id, 'owner')
);

DELETE FROM public.profiles;
