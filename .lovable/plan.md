## Goal
Make the student list in the marks editor follow the row order printed on the uploaded form (top → bottom), not alphabetical by surname. This applies both to matched students and the overall display.

## Current behavior
- Students are loaded from the database ordered by `last_name` (alphabetical).
- After an OCR scan, only matched students are reordered using the order the AI returned them in. Unmatched students fall back to alphabetical order at the end.
- The AI tool schema does not capture an explicit row number from the form, so order depends on the order the model happens to emit items.

## Changes

### 1. `supabase/functions/extract-marks/index.ts`
- Add `row_number` (integer, 1-based, as printed on the form) to each student in the tool-call schema and require it.
- Update the system prompt to instruct the model to emit students strictly in the same top-to-bottom order they appear on the sheet, and to use the printed row number when visible.
- In the transcript fallback parser, capture the leading row number already present in each line and include it as `row_number`.
- Sort `parsed.students` by `row_number` ascending before returning.

### 2. `src/pages/TeacherMarks.tsx`
- Update the response type to include `row_number?: number` per student.
- When processing rows, record `{ studentId, rowNumber }` pairs and build `scanStudentOrder` sorted by `rowNumber` (falling back to the order returned by the function when row numbers are missing).
- In `orderedStudents`:
  - Matched students render in the form's row-number order at the top.
  - Unmatched students render after, preserving their existing relative order (no alphabetical reshuffle on top of the scan).
- Keep the alphabetical order only as the initial state when no scan has been performed yet (unchanged from today).

## Out of scope
- Backend schema/RLS changes.
- Subject column ordering (already handled).
- Changing how students are initially fetched from the database.

## Files to edit
- `supabase/functions/extract-marks/index.ts`
- `src/pages/TeacherMarks.tsx`