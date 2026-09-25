CREATE OR REPLACE FUNCTION public.search_staff_for_calls(p_term text)
RETURNS TABLE(user_id uuid, name text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH staff AS (
    SELECT DISTINCT ur.user_id, ur.role::text AS role
    FROM public.user_roles ur
    WHERE ur.role <> 'student'
  )
  SELECT
    s.user_id,
    COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''),
      NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', '')), ''),
      INITCAP(REPLACE(SPLIT_PART(u.email, '@', 1), '.', ' '))
    ) AS name,
    s.role
  FROM staff s
  JOIN auth.users u ON u.id = s.user_id
  LEFT JOIN public.profiles p ON p.user_id = s.user_id
  WHERE
    p_term = ''
    OR u.email ILIKE '%' || p_term || '%'
    OR COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', '') ILIKE '%' || p_term || '%'
    OR COALESCE(p.first_name, '') ILIKE '%' || p_term || '%'
    OR COALESCE(p.last_name, '') ILIKE '%' || p_term || '%'
  ORDER BY name
  LIMIT 30;
$$;

GRANT EXECUTE ON FUNCTION public.search_staff_for_calls(text) TO authenticated;