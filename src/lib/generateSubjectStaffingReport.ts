import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Subject, Teacher, SchoolClass, Timetable } from '@/types/school';

const NAVY: [number, number, number] = [0, 51, 102];

const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const matchesClass = (assignedId: string, c: SchoolClass) => {
  const a = normKey(assignedId);
  return a === normKey(c.id)
    || a === normKey(`${c.form}${c.stream}`)
    || a === normKey(`form${c.form}${c.stream}`)
    || (!!c.learningArea && a === normKey(`${c.form}${c.learningArea}`));
};

const classLabel = (c: SchoolClass) => `${c.form} ${c.stream}`;

export interface StaffingReportInput {
  subjects: Subject[];
  teachers: Teacher[];
  classes: SchoolClass[];
  timetable?: Timetable | null;
}

const periodsFor = (c: SchoolClass, s: Subject) => {
  const override = c.subjectPeriods?.[s.id];
  return typeof override === 'number' && override > 0 ? override : s.periodsPerWeek;
};

export function generateSubjectStaffingReport({ subjects, teachers, classes, timetable }: StaffingReportInput) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();

  const header = (title: string) => {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, W, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.text('PROGRESS CHRISTIAN COLLEGE', W / 2, 10, { align: 'center' });
    doc.setFontSize(10);
    doc.text(title, W / 2, 17, { align: 'center' });
    doc.setTextColor(51, 51, 51);
  };

  const teachersFor = (subjectId: string, cls: SchoolClass) =>
    teachers.filter(t => t.assignments.some(a => a.subjectId === subjectId && a.classIds.some(cid => matchesClass(cid, cls))));

  // ---- 1. Subject / class / teacher / periods matrix -------------------------
  const rows: string[][] = [];
  const gaps: string[][] = [];
  const teacherPeriods = new Map<string, number>();
  const teacherSubjects = new Map<string, Set<string>>();
  const teacherClasses = new Map<string, Set<string>>();

  for (const s of [...subjects].sort((a, b) => a.name.localeCompare(b.name))) {
    const taught = classes
      .filter(c => c.subjectIds.includes(s.id))
      .sort((a, b) => a.form - b.form || a.stream.localeCompare(b.stream));
    for (const c of taught) {
      const ts = teachersFor(s.id, c);
      const p = periodsFor(c, s);
      const names = ts.map(t => `${t.title} ${t.name}`).join(', ');
      rows.push([s.code, s.name, classLabel(c), names || 'UNASSIGNED', String(p)]);
      if (ts.length === 0) gaps.push([classLabel(c), s.code, s.name, String(p)]);
      ts.forEach(t => {
        teacherPeriods.set(t.id, (teacherPeriods.get(t.id) || 0) + p / ts.length);
        (teacherSubjects.get(t.id) || teacherSubjects.set(t.id, new Set()).get(t.id)!).add(s.code);
        (teacherClasses.get(t.id) || teacherClasses.set(t.id, new Set()).get(t.id)!).add(classLabel(c));
      });
    }
  }

  const scheduled = new Map<string, number>();
  (timetable?.slots || []).forEach(sl => {
    if (sl.type !== 'lesson') return;
    if (sl.teacherId) scheduled.set(sl.teacherId, (scheduled.get(sl.teacherId) || 0) + 1);
    if (sl.pairedTeacherId) scheduled.set(sl.pairedTeacherId, (scheduled.get(sl.pairedTeacherId) || 0) + 1);
  });

  header('Teaching Staff, Subjects & Workload Report');
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`Generated: ${new Date().toLocaleString()}`, W / 2, 27, { align: 'center' });

  // ---- Teacher summary -------------------------------------------------------
  const teacherRows = [...teachers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(t => {
      const allocated = Math.round(teacherPeriods.get(t.id) || 0);
      const sched = scheduled.get(t.id) || 0;
      const max = t.maxPeriodsPerWeek || 0;
      return [
        `${t.title} ${t.name}`,
        Array.from(teacherSubjects.get(t.id) || []).sort().join(', ') || '—',
        Array.from(teacherClasses.get(t.id) || []).sort().join(', ') || '—',
        String(allocated),
        String(sched),
        String(max || '—'),
        max && allocated > max ? 'OVERLOADED' : allocated === 0 ? 'NO LOAD' : 'OK',
      ];
    });

  autoTable(doc, {
    startY: 32,
    head: [['Teacher', 'Subjects', 'Classes', 'Periods/wk (allocated)', 'Scheduled', 'Max', 'Status']],
    body: teacherRows,
    theme: 'grid',
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 7.5, cellPadding: 1.5 },
    columnStyles: { 1: { cellWidth: 55 }, 2: { cellWidth: 65 } },
    margin: { left: 10, right: 10 },
  });

  // ---- Classes without teachers ---------------------------------------------
  doc.addPage('a4', 'landscape');
  header('Classes With No Teacher Assigned');
  autoTable(doc, {
    startY: 28,
    head: [['Class', 'Code', 'Subject', 'Periods/wk']],
    body: gaps.length ? gaps : [['—', '—', 'All subjects have teachers', '—']],
    theme: 'grid',
    headStyles: { fillColor: [180, 30, 30], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    margin: { left: 10, right: 10 },
  });

  // ---- Full subject matrix ---------------------------------------------------
  doc.addPage('a4', 'landscape');
  header('Subject · Class · Teacher · Periods Matrix');
  autoTable(doc, {
    startY: 28,
    head: [['Code', 'Subject', 'Class', 'Teacher', 'Periods/wk']],
    body: rows.length ? rows : [['—', 'No subject allocations found', '—', '—', '—']],
    theme: 'grid',
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 7.5, cellPadding: 1.4 },
    didParseCell: (d) => {
      if (d.section === 'body' && d.row.raw && (d.row.raw as string[])[3] === 'UNASSIGNED') {
        d.cell.styles.textColor = [180, 30, 30];
      }
    },
    margin: { left: 10, right: 10 },
  });

  // ---- Footer ----------------------------------------------------------------
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(130);
    doc.text(`Progress Christian College · Staffing Report · Page ${i} of ${pages}`,
      W / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' });
  }

  doc.save('teacher_subject_staffing_report.pdf');

  return { totalTeachers: teachers.length, unassigned: gaps.length, allocations: rows.length };
}
