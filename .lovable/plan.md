## Goal

Make both mark-entry screens behave identically:

- Subject columns follow the printed sheet order: **LIT, R/S, HIS, C/SC, BIO, CHE, MAT, ACC, PHY, GEO, BUS, ECO, POINTS**
- Student rows follow the scanned sheet order (top → bottom), not alphabetical

The teacher page (`/teacher/marks`) already does this. The public phone QR scan page (`/scan/:examId`) does not — it still sorts subjects alphabetically and shows students by last name.

## Changes

### 1. `src/pages/ScanMarks.tsx`
- Add `scanOrder` and `scanStudentOrder` state (same pattern as TeacherMarks).
- In `handleCapture`, capture:
  - Subject codes in left→right order as the OCR returns them.
  - Student ids in top→bottom order based on matched rows, appending unmatched students at the end so nobody disappears.
- Replace alphabetical `subjectCodes.sort()` with the preferred order:
  - `["LIT","RS","HIS","CS","BIO","CHE","MAT","ACC","PHY","GEO","BUS","ECO"]` first, then scan order, then any extras.
  - Add a final `POINTS` column (read-only, computed from grade/level) so the header matches the sheet.
- Replace `visibleStudents` to use a derived `orderedStudents` (scan order first, then DB order for unmatched), then apply the filter.
- Render rows in `orderedStudents` order.

### 2. `supabase/functions/save-exam-results/index.ts`
- Remove `.order("last_name")` on the load query so the page receives students in a neutral order (the page now decides display order). Keep behavior identical for save.

### 3. Points column
- Compute `POINTS` per student as the sum of `computePoints(mark, level)` for all entered marks (matches the TeacherMarks behavior), shown as the final column on both screens.

### 4. No other changes
- Save logic, OCR prompt, auth, styling, and TeacherMarks itself are unchanged.

## Out of scope

- Backend schema changes.
- Edge function `extract-marks` prompt changes.
- Any other module.
