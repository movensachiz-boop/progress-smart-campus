import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Subject, Teacher, SchoolClass } from '@/types/school';

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

export type AllocationView = 'teacher' | 'class' | 'subject';

export interface AllocationReportInput {
  subjects: Subject[];
  teachers: Teacher[];
  classes: SchoolClass[];
  view: AllocationView;
}

const TITLES: Record<AllocationView, string> = {
  teacher: 'Teachers · Subjects & Classes',
  class: 'Classes · Subjects & Teachers',
  subject: 'Subjects · Classes & Teachers',
};

export function generateAllocationReport({ subjects, teachers, classes, view }: AllocationReportInput) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text('PROGRESS CHRISTIAN COLLEGE', W / 2, 10, { align: 'center' });
  doc.setFontSize(10);
  doc.text(TITLES[view], W / 2, 17, { align: 'center' });
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`Generated: ${new Date().toLocaleString()}`, W / 2, 27, { align: 'center' });
  doc.setTextColor(51, 51, 51);

  const subjectById = new Map(subjects.map(s => [s.id, s]));
  const teachersFor = (subjectId: string, cls: SchoolClass) =>
    teachers.filter(t => t.assignments.some(a => a.subjectId === subjectId && a.classIds.some(cid => matchesClass(cid, cls))));

  let head: string[][] = [];
  const body: string[][] = [];

  if (view === 'teacher') {
    head = [['Teacher', 'Subject', 'Classes']];
    [...teachers].sort((a, b) => a.name.localeCompare(b.name)).forEach(t => {
      const rows = t.assignments
        .map(a => {
          const s = subjectById.get(a.subjectId);
          if (!s) return null;
          const cls = classes.filter(c => a.classIds.some(cid => matchesClass(cid, c))).map(classLabel).sort();
          return [`${t.title} ${t.name}`, `${s.code} — ${s.name}`, cls.join(', ') || '—'];
        })
        .filter(Boolean) as string[][];
      if (rows.length === 0) body.push([`${t.title} ${t.name}`, 'No subject allocated', '—']);
      else body.push(...rows);
    });
  } else if (view === 'class') {
    head = [['Class', 'Subject', 'Teacher(s)']];
    [...classes].sort((a, b) => a.form - b.form || a.stream.localeCompare(b.stream)).forEach(c => {
      const subs = c.subjectIds.map(id => subjectById.get(id)).filter(Boolean) as Subject[];
      if (subs.length === 0) { body.push([classLabel(c), 'No subjects assigned', '—']); return; }
      subs.sort((a, b) => a.name.localeCompare(b.name)).forEach(s => {
        const ts = teachersFor(s.id, c).map(t => `${t.title} ${t.name}`);
        body.push([classLabel(c), `${s.code} — ${s.name}`, ts.join(', ') || 'UNASSIGNED']);
      });
    });
  } else {
    head = [['Code', 'Subject', 'Class', 'Teacher(s)']];
    [...subjects].sort((a, b) => a.name.localeCompare(b.name)).forEach(s => {
      const taught = classes
        .filter(c => c.subjectIds.includes(s.id))
        .sort((a, b) => a.form - b.form || a.stream.localeCompare(b.stream));
      if (taught.length === 0) { body.push([s.code, s.name, 'Not offered', '—']); return; }
      taught.forEach(c => {
        const ts = teachersFor(s.id, c).map(t => `${t.title} ${t.name}`);
        body.push([s.code, s.name, classLabel(c), ts.join(', ') || 'UNASSIGNED']);
      });
    });
  }

  autoTable(doc, {
    startY: 32,
    head,
    body: body.length ? body : [head[0].map(() => '—')],
    theme: 'grid',
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 8, cellPadding: 1.6 },
    didParseCell: (d) => {
      if (d.section === 'body' && typeof d.cell.raw === 'string' && /UNASSIGNED|No subject|No subjects|Not offered/.test(d.cell.raw)) {
        d.cell.styles.textColor = [180, 30, 30];
      }
    },
    margin: { left: 10, right: 10 },
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(130);
    doc.text(`Progress Christian College · ${TITLES[view]} · Page ${i} of ${pages}`,
      W / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' });
  }

  doc.save(`allocations_by_${view}.pdf`);
  return { rows: body.length };
}
