## Goal
Make the Subject header row (with subject codes, Passed, Failed, Pts) stay fixed at the top when scrolling down the marks table on `/admin/exams`.

## Root cause
The shadcn `Table` component wraps `<table>` in `<div className="relative w-full overflow-auto">`. This inner wrapper creates a competing scroll context that breaks `position: sticky` on the `<th>` cells — they resolve against the inner wrapper (which has no height constraint and never scrolls vertically) instead of the outer `flex-1 overflow-auto` container.

## Changes

1. **`src/components/ui/table.tsx`**
   - Add an optional `wrapperClassName?: string` prop to `Table`.
   - Apply it via `cn()` so callers can override the wrapper's `overflow-auto`.

2. **`src/pages/AdminExams.tsx`** (exam editor table only)
   - Pass `wrapperClassName="overflow-visible"` to the `<Table>` so the outer scroll container handles scrolling.
   - Keep existing `sticky top-0 bg-card z-10` on header `<TableHead>` cells (and `z-20` on the top-left Student corner).
   - Optionally use `top-[-1px]` if a hairline gap appears beneath the toolbar.

## Acceptance
- Scrolling down keeps the Subject / Passed / Failed / Pts header row pinned at the top.
- Scrolling right keeps the Student column pinned at the left.
- Horizontal + vertical scrolling still work on wide tables.
- No other tables in the app are affected (new prop is opt-in).
