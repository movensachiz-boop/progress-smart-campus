## Goal

Turn saved exam marks into a combined mark schedule per class that carries three separate comment streams — subject teacher, class teacher, principal — and let teachers self-select which class(es) they are class teacher of.

## Database (one migration)

1. New table `public.class_teacher_assignments`
   - `teacher_user_id uuid` (references auth.users)
   - `class_id text` (e.g. `3G1`, `5S`)
   - Unique on `(teacher_user_id, class_id)`
   - RLS: a teacher can insert/delete their own rows; admin/principal can read all; every authenticated user can read (needed so principal/admin dashboards can list class teachers).

2. New table `public.exam_comments`
   - `exam_id uuid`, `student_profile_id uuid`, `comment_type text CHECK IN ('subject_teacher','class_teacher','principal')`, `author_user_id uuid`, `subject_code text NULL` (only used to tag which teacher wrote it, optional), `comment text`, timestamps.
   - Unique on `(exam_id, student_profile_id, comment_type, author_user_id)` so each author has one comment per student per exam and per type.
   - RLS: authors can upsert/delete their own rows; principal + admin + owner can read all; the student can read their own comments (for their PDF).
   - GRANTs to `authenticated` and `service_role`.

## Automated per-subject comment

Handled purely in code (no storage). A helper `subjectCommentFor(mark, grade)` returns text like "Excellent grasp", "Needs revision", "Below expectation" based on grade bands. Used only when rendering the PDF report — nothing to save.

## Frontend changes

### Teacher portal
- `src/pages/TeacherMarks.tsx`:
  - Add a single "Overall comment for this student" input at the end of each student row (only for the current teacher's classes). Saved to `exam_comments` as `subject_teacher` with `author_user_id = auth.uid()`.
  - Header button "My class-teacher classes" opens a small dialog listing every class the teacher teaches with a checkbox — writes to `class_teacher_assignments`.

- New page `src/pages/TeacherClassTeacher.tsx` (route `/teacher/class-teacher`):
  - Lists the classes the teacher is class teacher of.
  - Pick exam + class → shows every student in that class with all their marks (read-only) and a "Class teacher comment" textarea per student. Saved to `exam_comments` as `class_teacher`.
  - Add link in `DashboardLayout` teacher nav.

### Principal portal
- Extend `src/pages/AdminPrincipalMarks.tsx`:
  - Add a "Principal comment" textarea per student row (below the marks grid, one per student), saved to `exam_comments` as `principal`.
  - The existing "Download PDF" now renders a per-class report showing marks, auto per-subject remarks, subject-teacher overall comment(s), class-teacher comment, and principal comment.

### Student portal
- `src/lib/generateStudentReport.ts` (or the PDF used by `StudentReports`): append the three comment sections (auto per-subject remarks under each mark, then "Class teacher's comment" and "Principal's comment" blocks). No new visible section inside the app — comments are PDF-only, as requested.

## Access control

- `class_teacher_assignments`: teacher edits own; everyone authenticated can read.
- `exam_comments`:
  - insert/update/delete: `author_user_id = auth.uid()` AND user's role matches the comment_type (has_role check).
  - select: author, admin, owner, principal always; a student can select rows where `student_profile_id` matches their profile (used by PDF generation).

## Out of scope

- Editing comments after the exam is archived (still allowed, no lock).
- Bulk-import of comments.
- Notifications when a comment is added.
