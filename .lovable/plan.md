## Issue

After scanning a mark sheet, student rows should appear in the exact top‑to‑bottom order of the uploaded sheet. Today the grid still shows them alphabetically because:

1. The initial DB query orders students by `last_name`.
2. After a scan, only *matched* students get a `rank` from `scanStudentOrder`. Unmatched students fall back to `POSITIVE_INFINITY` and end up at the bottom in their original alphabetical order — so the visible order doesn't match the printed sheet.
3. The AI's `row_number` is sometimes unreliable, so the rank often collapses to a fallback sequence that mixes with the alphabetical tail.

## Fix (frontend only — `src/pages/TeacherMarks.tsx`)

1. In `handleCapture`, after matching students, **interleave unmatched students into the scanned order** instead of dropping them at the end:
   - Walk `rows` (scanned rows) in order. For each scanned name, push the matched student id (if any) into a new `finalOrder` array.
   - After the loop, append any students that were never matched, preserving their original DB order, so nothing disappears.
   - Set `setScanStudentOrder(finalOrder)`.

2. Strengthen `orderedStudents` so the sort is stable and always honours `scanStudentOrder` first:
   - Students present in `scanStudentOrder` keep their scanned index.
   - Students not in `scanStudentOrder` keep their current DB index (appended after).
   - Remove the alphabetical fallback inside the sort.

3. Persist the order for the session: keep `scanStudentOrder` across re-renders (already in state) and reset it only when the exam changes (already handled in the `useEffect` for `examId`).

4. No backend/edge‑function changes needed — `extract-marks` already returns `row_number` and the sheet order is preserved in `scanOrder`/`scanStudentOrder`.

## Out of scope

- Column order (already fixed to `LIT, RS, HIS, CS, BIO, CHE, MAT, ACC, PHY, GEO, BUS, ECO, Pts`).
- Save logic, OCR prompt, auth, styling.
