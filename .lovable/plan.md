# Per-term class snapshots

Right now every student has a single `form` / `stream` on their profile. The moment anyone promotes or edits a student, the old term's rosters change too — which is why some classes now look empty. We'll snapshot each student's class per term so past terms stay historically accurate and new terms start with a copy of the previous term's rosters.

## What changes for you

- Every term keeps its own frozen list of which class each student was in.
- When you start a new term, the system automatically copies the previous term's rosters — nothing goes empty.
- Editing a student's form/stream only affects the currently selected term. Past terms stay as they were.
- All the class-based screens (Classes, Class Roster, Teacher Marks, Principal Marks, Attendance) resolve a student's class through the snapshot of the term you've selected.

## Screens updated

- Admin → Classes: student counts come from the selected term's snapshot.
- Admin → Class Roster, Teacher → Class Roster, Teacher → Class Teacher: list the students who were in that class during the selected term.
- Teacher Marks / Principal Marks: class dropdown and roster driven by snapshot.
- Admin → Students: editing form/stream writes to the current term's snapshot (and to the profile so new-term seeding still works).

## Technical section

1. New table `student_class_terms`
   - `term_id uuid` (FK terms), `student_profile_id uuid` (FK profiles), `form text`, `stream text`, `created_at`, `updated_at`.
   - PK `(term_id, student_profile_id)`.
   - GRANTs to `authenticated` + `service_role`; RLS: authenticated can read all, only staff (admin/owner/principal/it_assistant) can write. Students can read their own row.
   - Trigger `updated_at`.

2. Seeding
   - Migration backfill: insert a row for every existing term × profile using the profile's current `form`/`stream` (only where both are set), on conflict do nothing. This makes historical terms non-empty immediately.

3. New-term inheritance
   - Update `TermContext.startNewTerm` to, after inserting the new term, copy the latest previous term's rows into the new `term_id` (fallback: seed from `profiles` if there was no previous term).

4. Read path
   - Add a small hook `useTermClass(selectedTermId)` returning `Map<profileId, {form, stream}>` from `student_class_terms` for that term, with a fallback to `profiles` when a row is missing.
   - Replace `profiles.form` / `profiles.stream` reads in: `AdminClasses`, `AdminClassRoster`, `TeacherClassRoster`, `TeacherClassTeacher`, `TeacherMarks` (class filter), `AdminPrincipalMarks`, `TeacherAttendance` roster, and any other class-driven roster query.

5. Write path
   - When admin edits a student's form/stream (`AdminStudents`), also upsert into `student_class_terms` for the currently selected term. Keep writing to `profiles` too so newly-created terms have a sensible default.
   - New student registration inserts a snapshot row for the current term.

6. Non-goals
   - Exam results, payments, attendance rows themselves already carry `term_id` and are untouched.
   - No UI for editing past-term rosters in this pass (edits only touch the selected term going forward).

Approve and I'll ship the migration + code changes.
