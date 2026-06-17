
-- Allow students to view ALL their own exam results (not only published ones)
DROP POLICY IF EXISTS "Students view own published results" ON public.exam_results;
CREATE POLICY "Students view own results"
  ON public.exam_results FOR SELECT
  USING (student_profile_id = auth.uid());

-- Analytics RPC: per-exam pass rate, total students with marks, and top student.
-- SECURITY DEFINER so students can see class aggregates without reading peers' rows.
CREATE OR REPLACE FUNCTION public.get_exam_analytics(p_exam_id uuid)
RETURNS TABLE (
  total_students integer,
  pass_rate numeric,
  top_student_name text,
  top_student_avg numeric,
  my_avg numeric,
  my_rank integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  RETURN QUERY
  WITH per_student AS (
    SELECT
      er.student_profile_id,
      AVG(er.mark)::numeric AS avg_mark,
      BOOL_AND(er.mark >= 50) AS all_pass
    FROM public.exam_results er
    WHERE er.exam_id = p_exam_id AND er.mark IS NOT NULL
    GROUP BY er.student_profile_id
  ),
  ranked AS (
    SELECT ps.*, RANK() OVER (ORDER BY ps.avg_mark DESC) AS rnk
    FROM per_student ps
  ),
  top AS (
    SELECT r.student_profile_id, r.avg_mark
    FROM ranked r WHERE r.rnk = 1 LIMIT 1
  )
  SELECT
    (SELECT COUNT(*)::int FROM per_student),
    COALESCE(ROUND(
      100.0 * (SELECT COUNT(*) FROM per_student WHERE avg_mark >= 50)::numeric
      / NULLIF((SELECT COUNT(*) FROM per_student), 0), 1
    ), 0)::numeric,
    (SELECT TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,''))
       FROM top t JOIN public.profiles p ON p.id = t.student_profile_id),
    (SELECT ROUND(avg_mark, 1) FROM top),
    (SELECT ROUND(avg_mark, 1) FROM per_student WHERE student_profile_id = v_uid),
    (SELECT rnk FROM ranked WHERE student_profile_id = v_uid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_exam_analytics(uuid) TO authenticated;
