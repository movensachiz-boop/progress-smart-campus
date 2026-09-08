WITH latest AS (
  SELECT snapshot_data, created_by
  FROM public.timetable_snapshots
  ORDER BY created_at DESC
  LIMIT 1
), leo AS (
  SELECT c.class_data
  FROM public.timetable_snapshots s
  CROSS JOIN LATERAL jsonb_array_elements(s.snapshot_data->'classes') AS c(class_data)
  WHERE lower(c.class_data->>'id') = '3leo'
  ORDER BY s.created_at DESC
  LIMIT 1
), restored AS (
  SELECT
    jsonb_set(
      latest.snapshot_data,
      '{classes}',
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM jsonb_array_elements(latest.snapshot_data->'classes') AS current_class
          WHERE lower(current_class->>'id') = '3leo'
        ) THEN latest.snapshot_data->'classes'
        ELSE (latest.snapshot_data->'classes') || jsonb_build_array(leo.class_data)
      END,
      true
    ) AS snapshot_data,
    latest.created_by
  FROM latest
  CROSS JOIN leo
)
INSERT INTO public.timetable_snapshots (name, snapshot_data, is_auto, created_by)
SELECT
  'RESTORED — Form 3 Virgo and Leo 8 September 2026',
  snapshot_data,
  false,
  created_by
FROM restored;