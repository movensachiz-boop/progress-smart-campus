import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Timetable, Subject, Teacher, SchoolClass, DayOfWeek } from '@/types/school';
import { DAYS } from '@/data/defaults';
import { BalancerReport } from './timetableBalancer';

const download = (content: string, filename: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const exportTimetableJSON = (tt: Timetable) => {
  download(JSON.stringify(tt, null, 2), 'timetable.json', 'application/json');
};

const csvEscape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
const toCsv = (rows: string[][]) => rows.map(r => r.map(csvEscape).join(',')).join('\n');

export const exportFairnessCSV = (report: BalancerReport) => {
  const rows: string[][] = [
    ['Class', 'Subject', 'Code', 'Current', 'Target', 'Final', 'Status', 'Delta'],
  ];
  for (const r of report.fairness) {
    const finalRow = report.fairnessAfter.find(a => a.classId === r.classId && a.subjectId === r.subjectId);
    rows.push([r.className, r.subjectName, r.subjectCode, String(r.current), String(r.target), String(finalRow?.current ?? r.current), finalRow?.status || r.status, String(finalRow?.delta ?? r.delta)]);
  }
  download(toCsv(rows), 'fairness_report.csv', 'text/csv;charset=utf-8');
};

export const exportTeacherLoadCSV = (report: BalancerReport) => {
  const rows: string[][] = [['Teacher', 'Before', 'After', 'Max', 'Overloaded']];
  for (const t of report.teacherLoads) rows.push([t.teacherName, String(t.before), String(t.after), String(t.max), t.overloaded ? 'YES' : 'NO']);
  download(toCsv(rows), 'teacher_workload.csv', 'text/csv;charset=utf-8');
};

export const exportClassTimetablesCSV = (tt: Timetable, classes: SchoolClass[], subjects: Subject[]) => {
  const parts: string[] = [];
  for (const c of [...classes].sort((a, b) => a.form - b.form || a.stream.localeCompare(b.stream))) {
    parts.push(`Class ${c.form}${c.stream}`);
    const header = ['Period', ...DAYS];
    const rows: string[][] = [header];
    const periods = Array.from(new Set(tt.slots.filter(s => s.classId === c.id).map(s => s.period))).sort((a, b) => a - b);
    for (const p of periods) {
      const row = [`P${p}`];
      for (const d of DAYS) {
        const s = tt.slots.find(x => x.classId === c.id && x.day === d && x.period === p);
        if (!s) row.push('');
        else if (s.type === 'break') row.push('BREAK');
        else if (s.type === 'lunch') row.push('LUNCH');
        else if (s.type === 'sports') row.push('SPORTS');
        else {
          const sub = subjects.find(su => su.id === s.subjectId);
          const paired = s.pairedSubjectId ? subjects.find(su => su.id === s.pairedSubjectId) : undefined;
          row.push(paired ? `${sub?.code}/${paired.code}` : (sub?.code || ''));
        }
      }
      rows.push(row);
    }
    parts.push(toCsv(rows));
    parts.push('');
  }
  download(parts.join('\n'), 'class_timetables.csv', 'text/csv;charset=utf-8');
};

export const exportTeacherTimetablesCSV = (tt: Timetable, teachers: Teacher[], subjects: Subject[], classes: SchoolClass[]) => {
  const parts: string[] = [];
  for (const t of [...teachers].sort((a, b) => a.name.localeCompare(b.name))) {
    parts.push(`Teacher: ${t.name}`);
    const header = ['Period', ...DAYS];
    const rows: string[][] = [header];
    const periods = Array.from(new Set(tt.slots.filter(s => s.teacherId === t.id).map(s => s.period))).sort((a, b) => a - b);
    for (const p of periods) {
      const row = [`P${p}`];
      for (const d of DAYS) {
        const s = tt.slots.find(x => x.teacherId === t.id && x.day === d && x.period === p);
        if (!s) { row.push(''); continue; }
        const sub = subjects.find(su => su.id === s.subjectId);
        const cls = classes.find(c => c.id === s.classId);
        row.push(sub && cls ? `${sub.code} · ${cls.form}${cls.stream}` : '');
      }
      rows.push(row);
    }
    parts.push(toCsv(rows));
    parts.push('');
  }
  download(parts.join('\n'), 'teacher_timetables.csv', 'text/csv;charset=utf-8');
};

export const exportRoomUsageCSV = (tt: Timetable, subjects: Subject[]) => {
  // Rooms aren't modelled per-slot; report by subject occupancy per (day,period) as a proxy.
  const parts: string[] = ['Subject usage per period (proxy for room load)'];
  const header = ['Subject Code', 'Total Periods', 'Doubles'];
  const rows: string[][] = [header];
  const counts: Record<string, { total: number; doubles: number }> = {};
  for (const s of tt.slots) {
    if (s.type !== 'lesson' || !s.subjectId) continue;
    (counts[s.subjectId] ||= { total: 0, doubles: 0 }).total += 1;
  }
  for (const [sid, c] of Object.entries(counts)) {
    const sub = subjects.find(s => s.id === sid);
    rows.push([sub?.code || sid, String(c.total), String(c.doubles)]);
  }
  parts.push(toCsv(rows));
  download(parts.join('\n'), 'room_usage.csv', 'text/csv;charset=utf-8');
};

export const exportFairnessPDF = (report: BalancerReport) => {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.setTextColor(0, 51, 102);
  doc.text('A-Level Fairness Report', 105, 18, { align: 'center' });
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`Fairness score: ${report.fairnessScore} / 100    Quality score: ${report.qualityScore} / 100`, 105, 26, { align: 'center' });
  doc.text(`Changes applied: ${report.changes.length}    Remaining conflicts: ${report.clashes.remainingConflicts}`, 105, 32, { align: 'center' });

  autoTable(doc, {
    startY: 40,
    head: [['Class', 'Subject', 'Current', 'Target', 'Final', 'Status']],
    body: report.fairness.map(r => {
      const f = report.fairnessAfter.find(a => a.classId === r.classId && a.subjectId === r.subjectId);
      return [r.className, r.subjectCode, String(r.current), String(r.target), String(f?.current ?? r.current), f?.status || r.status];
    }),
    theme: 'grid',
    headStyles: { fillColor: [0, 51, 102], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8 },
  });

  if (report.changes.length) {
    doc.addPage();
    doc.setFontSize(14);
    doc.setTextColor(0, 51, 102);
    doc.text('Change Log', 14, 18);
    autoTable(doc, {
      startY: 24,
      head: [['Class', 'Day', 'Period', 'Old Subject', 'New Subject']],
      body: report.changes.map(c => [c.className, c.day, `P${c.period}-${c.period + 1}`, c.oldSubjectCode || '', c.newSubjectCode || '']),
      theme: 'grid',
      headStyles: { fillColor: [0, 51, 102], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 8 },
    });
  }

  doc.save('fairness_report.pdf');
};
