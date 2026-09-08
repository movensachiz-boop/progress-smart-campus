INSERT INTO public.timetable_snapshots (name, snapshot_data, is_auto, created_by)
SELECT
  'RESTORED — 3 Aries and 3 Leo timetable 8 September 2026',
  jsonb_set(
    latest.snapshot_data,
    '{timetable,slots}',
    (
      SELECT jsonb_agg(slot ORDER BY ord_group, ord)
      FROM (
        SELECT slot, 1 AS ord_group, ord
        FROM jsonb_array_elements(COALESCE(latest.snapshot_data->'timetable'->'slots', '[]'::jsonb)) WITH ORDINALITY AS l(slot, ord)
        WHERE upper(regexp_replace(COALESCE(slot->>'classId',''), '[^A-Z0-9]', '', 'g')) NOT IN ('3ARIES','3LEO')
        UNION ALL
        SELECT slot, 2 AS ord_group, ord
        FROM jsonb_array_elements(COALESCE(source.snapshot_data->'timetable'->'slots', '[]'::jsonb)) WITH ORDINALITY AS s(slot, ord)
        WHERE upper(regexp_replace(COALESCE(slot->>'classId',''), '[^A-Z0-9]', '', 'g')) IN ('3ARIES','3LEO')
      ) restored_slots
    ),
    true
  ),
  false,
  latest.created_by
FROM public.timetable_snapshots latest
CROSS JOIN public.timetable_snapshots source
WHERE latest.id = '35c27468-529e-4af8-8301-3aff4aaaf872'
  AND source.id = 'f89a5cdd-40c5-47f9-82eb-ccccec548e28';