
DROP POLICY IF EXISTS "Students view own results" ON public.exam_results;
CREATE POLICY "Students view own results" ON public.exam_results
FOR SELECT TO authenticated
USING (student_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.get_exam_analytics(p_exam_id uuid)
 RETURNS TABLE(total_students integer, pass_rate numeric, top_student_name text, top_student_avg numeric, my_avg numeric, my_rank integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pid uuid;
BEGIN
  SELECT id INTO v_pid FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  RETURN QUERY
  WITH per_student AS (
    SELECT er.student_profile_id, AVG(er.mark)::numeric AS avg_mark
    FROM public.exam_results er
    WHERE er.exam_id = p_exam_id AND er.mark IS NOT NULL
    GROUP BY er.student_profile_id
  ),
  ranked AS (SELECT ps.*, RANK() OVER (ORDER BY ps.avg_mark DESC) AS rnk FROM per_student ps),
  top AS (SELECT r.student_profile_id, r.avg_mark FROM ranked r WHERE r.rnk = 1 LIMIT 1)
  SELECT
    (SELECT COUNT(*)::int FROM per_student),
    COALESCE(ROUND(100.0 * (SELECT COUNT(*) FROM per_student WHERE avg_mark >= 50)::numeric
      / NULLIF((SELECT COUNT(*) FROM per_student), 0), 1), 0)::numeric,
    (SELECT TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,''))
       FROM top t JOIN public.profiles p ON p.id = t.student_profile_id),
    (SELECT ROUND(avg_mark, 1) FROM top),
    (SELECT ROUND(avg_mark, 1) FROM per_student WHERE student_profile_id = v_pid),
    (SELECT rnk FROM ranked WHERE student_profile_id = v_pid);
END;
$function$;
