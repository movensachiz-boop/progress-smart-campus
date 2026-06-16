## Goal

When editing marks, the subject header row (e.g. `Student | BIO | BUS | CHE | ECO | HIS | LIT | MAT | PHY | RS | Pts`) must stay visible at the top of the screen as you scroll down through the students. Today it disappears because each student is rendered in its own card with subjects listed vertically.

## Change

Replace the per-student cards on `src/pages/TeacherMarks.tsx` (lines ~325–375) with one wide mark-sheet grid:

- **Rows** = students (in upload order, same `studentRank` sort already in place).
- **Columns** = the union of all subjects relevant to the loaded class/stream + any subject detected from the scan (so GEO and any other scanned column always appear). Columns are ordered to match the uploaded form when a scan order is available, otherwise alphabetical by code.
- **Header row** uses `position: sticky; top: 0` with a solid background and a higher `z-index` than body cells, so it stays pinned while the page scrolls.
- **First column** (Student name + reg) stays sticky to the left (`position: sticky; left: 0`) — preserves the earlier fix.
- Each subject cell is the same numeric `Input` as today, calling the existing `updateMark(studentId, code, value)`.
- A trailing `Pts` / total column shows the sum of entered marks per row (read-only).
- "+ Subject" control moves to the column header area: lets a teacher add an extra subject column that applies to the whole sheet (keeps current `addSubjectForStudent` logic but applied per row when a value is entered).

## Technical notes

- Wrap the grid in a single scroll container: `<div className="relative overflow-auto max-h-[75vh] border rounded-md">` containing one `<table className="border-separate border-spacing-0">`.
- `thead th` classes: `sticky top-0 z-40 bg-background border-b`; the first `th` also gets `left-0 z-50` and a right border.
- `tbody td` for the student column: `sticky left-0 z-30 bg-background border-r`.
- Build the column list once per render:
  ```ts
  const columns = useMemo(() => {
    const set = new Map<string, string>(); // code -> name
    students.forEach(s => subjectsFor(s).forEach(({code,name}) => set.set(code,name)));
    scanSubjectOrder.forEach(code => { if (!set.has(code)) set.set(code, code); });
    return Array.from(set, ([code,name]) => ({code,name}));
  }, [students, scanSubjectOrder]);
  ```
- Keep `studentRank` sorting and existing save/scan logic untouched — only the rendering block changes.
- No edge-function changes needed for this fix.

## Out of scope

- No changes to extraction logic, save endpoint, or auth.
- No styling overhaul beyond what's needed to make sticky work.
