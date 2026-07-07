import { Timetable, TimetableSlot, Subject, Teacher, SchoolClass, DayOfWeek } from '@/types/school';

/** Target periods per week for every A-level subject (4 doubles). */
export const A_LEVEL_TARGET = 8;
export const A_LEVEL_MIN = 8;
export const A_LEVEL_MAX = 8;

export type FairnessStatus = 'FAIR' | 'UNFAIR' | 'MISSING';

export interface SubjectFairnessRow {
  classId: string;
  className: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  current: number;
  target: number;
  status: FairnessStatus;
  delta: number; // current - target
  doubles: number;
}

export interface TeacherLoadRow {
  teacherId: string;
  teacherName: string;
  before: number;
  after: number;
  max: number;
  overloaded: boolean;
}

export interface BalancerChange {
  slotIds: string[]; // includes combined siblings
  day: DayOfWeek;
  period: number;
  classId: string;
  className: string;
  oldSubjectId?: string;
  oldSubjectCode?: string;
  newSubjectId?: string;
  newSubjectCode?: string;
  oldTeacherId?: string;
  newTeacherId?: string;
}

export interface BalancerReport {
  fairness: SubjectFairnessRow[];
  fairnessAfter: SubjectFairnessRow[];
  teacherLoads: TeacherLoadRow[];
  changes: BalancerChange[];
  fairnessScore: number; // 0..100
  qualityScore: number;  // 0..100
  clashes: {
    teacherClashesRemoved: number;
    classClashesRemoved: number;
    remainingConflicts: number;
  };
}

const isALevel = (form: number) => form === 5 || form === 6;

const slotKey = (s: TimetableSlot) => `${s.day}#${s.period}`;

/** Group A-level lesson slots into their double blocks: 2 consecutive periods same class/subject/teacher. */
function collectDoubles(slots: TimetableSlot[], classId: string) {
  const byDay: Record<string, TimetableSlot[]> = {};
  for (const s of slots) {
    if (s.classId !== classId) continue;
    if (s.type !== 'lesson' || !s.subjectId) continue;
    (byDay[s.day] ||= []).push(s);
  }
  const doubles: { day: DayOfWeek; period: number; subjectId: string; teacherId?: string; slots: TimetableSlot[] }[] = [];
  for (const day of Object.keys(byDay)) {
    const arr = byDay[day].sort((a, b) => a.period - b.period);
    const used = new Set<string>();
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      if (used.has(a.id)) continue;
      const b = arr.find(x => x.period === a.period + 1 && x.subjectId === a.subjectId && x.teacherId === a.teacherId);
      if (b) {
        doubles.push({ day: a.day, period: a.period, subjectId: a.subjectId!, teacherId: a.teacherId, slots: [a, b] });
        used.add(a.id); used.add(b.id);
      } else {
        doubles.push({ day: a.day, period: a.period, subjectId: a.subjectId!, teacherId: a.teacherId, slots: [a] });
        used.add(a.id);
      }
    }
  }
  return doubles;
}

export function analyzeFairness(
  timetable: Timetable,
  classes: SchoolClass[],
  subjects: Subject[]
): SubjectFairnessRow[] {
  const rows: SubjectFairnessRow[] = [];
  const aClasses = classes.filter(c => isALevel(c.form));
  for (const cls of aClasses) {
    const doubles = collectDoubles(timetable.slots, cls.id);
    const bySubj: Record<string, { count: number; doubles: number }> = {};
    for (const d of doubles) {
      const rec = (bySubj[d.subjectId] ||= { count: 0, doubles: 0 });
      rec.count += d.slots.length;
      if (d.slots.length === 2) rec.doubles += 1;
    }
    // Include every subject present in this class OR currently scheduled
    const subjectIds = new Set<string>([...cls.subjectIds, ...Object.keys(bySubj)]);
    for (const sid of subjectIds) {
      const subj = subjects.find(s => s.id === sid);
      if (!subj) continue;
      const cur = bySubj[sid]?.count || 0;
      const doubles = bySubj[sid]?.doubles || 0;
      const status: FairnessStatus = cur === 0 ? 'MISSING' : (cur >= A_LEVEL_MIN && cur <= A_LEVEL_MAX ? 'FAIR' : 'UNFAIR');
      rows.push({
        classId: cls.id,
        className: `${cls.form}${cls.stream}`,
        subjectId: sid,
        subjectCode: subj.code,
        subjectName: subj.name,
        current: cur,
        target: A_LEVEL_TARGET,
        status,
        delta: cur - A_LEVEL_TARGET,
        doubles,
      });
    }
  }
  return rows.sort((a, b) => a.className.localeCompare(b.className) || a.subjectCode.localeCompare(b.subjectCode));
}

export function fairnessScore(rows: SubjectFairnessRow[]): number {
  if (rows.length === 0) return 100;
  const totalDelta = rows.reduce((sum, r) => sum + Math.abs(r.delta), 0);
  const worst = rows.length * A_LEVEL_TARGET;
  return Math.max(0, Math.round(100 - (totalDelta / worst) * 100));
}

export function teacherLoads(slots: TimetableSlot[], teachers: Teacher[]): Record<string, number> {
  const load: Record<string, number> = {};
  teachers.forEach(t => { load[t.id] = 0; });
  for (const s of slots) {
    if (s.type !== 'lesson' || !s.teacherId) continue;
    load[s.teacherId] = (load[s.teacherId] || 0) + 1;
  }
  return load;
}

/** Find a teacher assigned to (subjectId, classId) who is free at (day, period, period+1). */
function findFreeTeacher(
  subjectId: string,
  classId: string,
  day: DayOfWeek,
  period: number,
  span: number,
  slots: TimetableSlot[],
  teachers: Teacher[]
): string | undefined {
  const candidates = teachers.filter(t =>
    t.subjectIds.includes(subjectId) &&
    t.assignments.some(a => a.subjectId === subjectId && a.classIds.some(cid => cid === classId || cid.replace(/\s+/g, '').toLowerCase() === classId.toLowerCase()))
  );
  const pool = candidates.length ? candidates : teachers.filter(t => t.subjectIds.includes(subjectId));
  for (const t of pool) {
    let ok = true;
    for (let off = 0; off < span; off++) {
      const clash = slots.some(s =>
        s.day === day && s.period === period + off &&
        s.teacherId === t.id && s.classId !== classId
      );
      if (clash) { ok = false; break; }
    }
    if (ok) return t.id;
  }
  return undefined;
}

function sameFormOtherFormHasSubject(
  slots: TimetableSlot[],
  classes: SchoolClass[],
  day: DayOfWeek,
  period: number,
  subjectId: string,
  form: number
): boolean {
  // A-level cross-form lock: same subject cannot be at same (day, period) in the other A-level form.
  const otherForm = form === 5 ? 6 : 5;
  const otherClassIds = new Set(classes.filter(c => c.form === otherForm).map(c => c.id));
  return slots.some(s => s.day === day && s.period === period && s.subjectId === subjectId && otherClassIds.has(s.classId));
}

/**
 * Rebalance A-level subject allocations.
 * For each A-level class:
 *   - Identify subjects OVER target (current > 8) and UNDER target (current < 8, but in class.subjectIds).
 *   - Convert excess doubles of over-allocated subjects into under-allocated ones,
 *     provided no teacher/class/cross-form clash is introduced.
 * Combined slots are updated together (co-taught streams stay in sync).
 * Practical / paired subjects are left untouched (never split).
 */
export function rebalance(
  timetable: Timetable,
  classes: SchoolClass[],
  subjects: Subject[],
  teachers: Teacher[]
): { nextTimetable: Timetable; report: BalancerReport } {
  const before = JSON.parse(JSON.stringify(timetable)) as Timetable;
  const working = JSON.parse(JSON.stringify(timetable)) as Timetable;
  const changes: BalancerChange[] = [];
  const teacherLoadsBefore = teacherLoads(before.slots, teachers);

  const aClasses = classes.filter(c => isALevel(c.form));

  for (const cls of aClasses) {
    let attempts = 0;
    while (attempts++ < 30) {
      const doubles = collectDoubles(working.slots, cls.id);
      const bySubj: Record<string, number> = {};
      for (const d of doubles) bySubj[d.subjectId] = (bySubj[d.subjectId] || 0) + d.slots.length;

      // Candidate under-allocated subjects: in class.subjectIds AND have an eligible teacher
      const under = cls.subjectIds
        .map(sid => ({ sid, count: bySubj[sid] || 0 }))
        .filter(x => x.count < A_LEVEL_TARGET)
        .sort((a, b) => a.count - b.count);
      const over = Object.entries(bySubj)
        .filter(([, c]) => c > A_LEVEL_TARGET)
        .sort((a, b) => b[1] - a[1]);
      if (!under.length || !over.length) break;

      let didChange = false;
      for (const [overSid, overCount] of over) {
        if (overCount <= A_LEVEL_TARGET) continue;
        // Prefer moving a FULL double (2 slots) — never split a paired/practical block.
        const donorDouble = doubles.find(d =>
          d.subjectId === overSid &&
          d.slots.length === 2 &&
          !d.slots.some(s => s.pairedSubjectId) // don't split paired A-level slots
        );
        if (!donorDouble) continue;

        for (const { sid: newSid } of under) {
          if (newSid === overSid) continue;
          if (bySubj[newSid] >= A_LEVEL_TARGET) continue;

          // Cross-form lock: cannot introduce newSid at this (day,period) if other A-level form has it
          if (sameFormOtherFormHasSubject(working.slots, classes, donorDouble.day, donorDouble.period, newSid, cls.form)) continue;
          if (sameFormOtherFormHasSubject(working.slots, classes, donorDouble.day, donorDouble.period + 1, newSid, cls.form)) continue;

          // Find a teacher free for both periods
          const newTeacher = findFreeTeacher(newSid, cls.id, donorDouble.day, donorDouble.period, 2, working.slots, teachers);
          if (!newTeacher) continue;

          // Apply: update the two slots (and any combined siblings at same day/period)
          const affectedIds: string[] = [];
          working.slots = working.slots.map(s => {
            const inBlock = donorDouble.slots.some(d => d.id === s.id);
            const isCombinedSibling =
              donorDouble.slots.some(d => d.day === s.day && d.period === s.period && d.combinedClassIds?.includes(s.classId));
            if (inBlock || isCombinedSibling) {
              affectedIds.push(s.id);
              return { ...s, subjectId: newSid, teacherId: newTeacher, pairedSubjectId: undefined, pairedTeacherId: undefined };
            }
            return s;
          });
          changes.push({
            slotIds: affectedIds,
            day: donorDouble.day,
            period: donorDouble.period,
            classId: cls.id,
            className: `${cls.form}${cls.stream}`,
            oldSubjectId: overSid,
            oldSubjectCode: subjects.find(s => s.id === overSid)?.code,
            newSubjectId: newSid,
            newSubjectCode: subjects.find(s => s.id === newSid)?.code,
            oldTeacherId: donorDouble.teacherId,
            newTeacherId: newTeacher,
          });
          didChange = true;
          break;
        }
        if (didChange) break;
      }
      if (!didChange) break;
    }

    // HARD CAP: any subject still over 8 periods → convert excess doubles to free slots.
    // Guarantees "current ≤ 8" in the fairness report even when no receiver exists.
    const doublesFinal = collectDoubles(working.slots, cls.id);
    const finalCount: Record<string, number> = {};
    for (const d of doublesFinal) finalCount[d.subjectId] = (finalCount[d.subjectId] || 0) + d.slots.length;
    for (const [sid, count] of Object.entries(finalCount)) {
      let excess = count - A_LEVEL_TARGET;
      if (excess <= 0) continue;
      const donors = doublesFinal
        .filter(d => d.subjectId === sid && d.slots.length === 2 && !d.slots.some(s => s.pairedSubjectId));
      for (const donor of donors) {
        if (excess <= 0) break;
        const affectedIds: string[] = [];
        working.slots = working.slots.map(s => {
          const inBlock = donor.slots.some(d => d.id === s.id);
          const isSibling = donor.slots.some(d => d.day === s.day && d.period === s.period && d.combinedClassIds?.includes(s.classId));
          if (inBlock || isSibling) {
            affectedIds.push(s.id);
            return { ...s, subjectId: undefined, teacherId: undefined, pairedSubjectId: undefined, pairedTeacherId: undefined, type: 'lesson' as const };
          }
          return s;
        });
        changes.push({
          slotIds: affectedIds,
          day: donor.day,
          period: donor.period,
          classId: cls.id,
          className: `${cls.form}${cls.stream}`,
          oldSubjectId: sid,
          oldSubjectCode: subjects.find(s => s.id === sid)?.code,
          newSubjectId: undefined,
          newSubjectCode: 'FREE',
          oldTeacherId: donor.teacherId,
          newTeacherId: undefined,
        });
        excess -= 2;
      }
    }
  }


  const fairnessBefore = analyzeFairness(before, classes, subjects);
  const fairnessAfter = analyzeFairness(working, classes, subjects);
  const teacherLoadsAfter = teacherLoads(working.slots, teachers);

  const teacherRows: TeacherLoadRow[] = teachers.map(t => ({
    teacherId: t.id,
    teacherName: t.name,
    before: teacherLoadsBefore[t.id] || 0,
    after: teacherLoadsAfter[t.id] || 0,
    max: t.maxPeriodsPerWeek,
    overloaded: (teacherLoadsAfter[t.id] || 0) > t.maxPeriodsPerWeek,
  }));

  // Roll back changes that overloaded a teacher
  const overloadedIds = new Set(teacherRows.filter(r => r.overloaded && (teacherLoadsBefore[r.teacherId] || 0) <= r.max).map(r => r.teacherId));
  if (overloadedIds.size) {
    // Simple safeguard: revert changes assigning to overloaded teachers
    const kept: BalancerChange[] = [];
    for (const ch of changes) {
      if (ch.newTeacherId && overloadedIds.has(ch.newTeacherId)) {
        working.slots = working.slots.map(s => {
          if (!ch.slotIds.includes(s.id)) return s;
          const orig = before.slots.find(o => o.id === s.id);
          return orig ? { ...orig } : s;
        });
      } else {
        kept.push(ch);
      }
    }
    changes.length = 0;
    changes.push(...kept);
  }

  const clashesBefore = before.conflicts.length;
  const clashesAfter = working.conflicts.length;

  const report: BalancerReport = {
    fairness: fairnessBefore,
    fairnessAfter,
    teacherLoads: teacherLoads(working.slots, teachers) as any && teacherRows,
    changes,
    fairnessScore: fairnessScore(fairnessAfter),
    qualityScore: Math.round((fairnessScore(fairnessAfter) * 0.7) + (Math.max(0, 100 - clashesAfter * 10) * 0.3)),
    clashes: {
      teacherClashesRemoved: Math.max(0, before.conflicts.filter(c => c.type === 'teacher-clash').length - working.conflicts.filter(c => c.type === 'teacher-clash').length),
      classClashesRemoved: Math.max(0, before.conflicts.filter(c => c.type === 'class-clash').length - working.conflicts.filter(c => c.type === 'class-clash').length),
      remainingConflicts: clashesAfter,
    },
  };
  return { nextTimetable: working, report };
}
