UPDATE public.profiles SET claimed = false, user_id = NULL WHERE registration_number = 'T4792S';
DELETE FROM auth.users WHERE id = '1575ea77-0ebe-4ee2-a7ae-50b9096fa907';