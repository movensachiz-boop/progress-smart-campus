## Goal
Keep the first column in the mark editing table fixed/visible while scrolling, so the subject/name context does not move away when editing lower rows or horizontally scrolling marks.

## Plan
1. Update the marks editing table layout in `TeacherMarks.tsx`.
2. Make the first column use a stronger sticky position with stable width, left offset, background, border, and higher stacking order.
3. Ensure the table container supports both vertical and horizontal scrolling without causing the first column to shift or scroll out of view.
4. Keep the existing sticky header behavior so subject labels remain clear while editing.
5. Verify the UI behavior in the preview by scrolling the marks editor vertically and horizontally.

## Technical details
- Target file: `src/pages/TeacherMarks.tsx`.
- The existing table already uses `sticky left-0`; I will strengthen it by making the table layout fixed/min-width stable and increasing sticky cell/header z-index/background rules where needed.
- No backend or OCR logic changes are needed for this request.