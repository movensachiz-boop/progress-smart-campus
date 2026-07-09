import { Timetable, TimetableSlot, Subject, Teacher, SchoolClass, DayOfWeek } from '@/types/school';
import { formatSubjectName } from './timetableUtils';

/** Target periods per week for every A-level subject (4 doubles). Form 6 may be raised via options. */
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
  delta: number;
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
  slotIds: string[];
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
  fairnessScore: number;
  qualityScore: number;
  clashes: {
    teacherClashesRemoved: number;
    classClashesRemoved: number;
    remainingConflicts: number;
  };
}

export interface RebalanceOptions {
  /** Max periods/week override for Form 6 (default = A_LEVEL_TARGET). */
  form6Max?: number;
  /** Per-form max periods/week for O-level (Forms 1-4). Caps every subject target in that form. */
  oLevelMax?: Partial<Record<1 | 2 | 3 | 4, number>>;
  /** Subject-id pairs that must never be scheduled at the same (day, period). */
  conflictPairs?: Array<[string, string]>;
  /** When true, O-level classes (Forms 1-4) are also balanced. */
  includeOLevel?: boolean;
}

const isALevelForm = (form: number) => form === 5 || form === 6;

function targetFor(cls: SchoolClass, subject: Subject, opts: RebalanceOptions): number {
  if (cls.form === 5) return A_LEVEL_TARGET;
  if (cls.form === 6) return opts.form6Max ?? A_LEVEL_TARGET;
  const base = cls.subjectPeriods?.[subject.id] ?? subject.periodsPerWeek;
  const cap = opts.oLevelMax?.[cls.form as 1 | 2 | 3 | 4];
  return cap && cap > 0 ? Math.min(base, cap) : base;
}

/** Group A-level lesson slots into their double blocks. */
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
  subjects: Subject[],
  opts: RebalanceOptions = {}
): SubjectFairnessRow[] {
  const rows: SubjectFairnessRow[] = [];
  const targetClasses = classes.filter(c => isALevelForm(c.form) || opts.includeOLevel);
  for (const cls of targetClasses) {
    const doubles = collectDoubles(timetable.slots, cls.id);
    const bySubj: Record<string, { count: number; doubles: number }> = {};
    for (const d of doubles) {
      const rec = (bySubj[d.subjectId] ||= { count: 0, doubles: 0 });
      rec.count += d.slots.length;
      if (d.slots.length === 2) rec.doubles += 1;
    }
    const subjectIds = new Set<string>([...cls.subjectIds, ...Object.keys(bySubj)]);
    for (const sid of subjectIds) {
      const subj = subjects.find(s => s.id === sid);
      if (!subj) continue;
      const cur = bySubj[sid]?.count || 0;
      const doublesCount = bySubj[sid]?.doubles || 0;
      const t = targetFor(cls, subj, opts);
      const status: FairnessStatus = cur === 0 ? 'MISSING' : (cur === t ? 'FAIR' : 'UNFAIR');
      rows.push({
        classId: cls.id,
        className: `${cls.form}${cls.stream}`,
        subjectId: sid,
        subjectCode: subj.code,
        subjectName: formatSubjectName(subj, cls.form),
        current: cur,
        target: t,
        status,
        delta: cur - t,
        doubles: doublesCount,
      });
    }
  }
  return rows.sort((a, b) => a.className.localeCompare(b.className) || a.subjectCode.localeCompare(b.subjectCode));
}

export function fairnessScore(rows: SubjectFairnessRow[]): number {
  if (rows.length === 0) return 100;
  const totalDelta = rows.reduce((sum, r) => sum + Math.abs(r.delta), 0);
  const worst = rows.reduce((sum, r) => sum + Math.max(1, r.target), 0);
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
  if (!isALevelForm(form)) return false;
  const otherForm = form === 5 ? 6 : 5;
  const otherClassIds = new Set(classes.filter(c => c.form === otherForm).map(c => c.id));
  return slots.some(s => s.day === day && s.period === period && s.subjectId === subjectId && otherClassIds.has(s.classId));
}

/** Subjects that conflict with `subjectId` per user rules. */
function conflictingSubjects(subjectId: string, pairs: Array<[string, string]>): Set<string> {
  const out = new Set<string>();
  for (const [a, b] of pairs) {
    if (a === subjectId) out.add(b);
    else if (b === subjectId) out.add(a);
  }
  return out;
}

/** True if placing subjectId at (day,period) would collide with a user-defined conflict elsewhere. */
function slotHasConflict(
  slots: TimetableSlot[],
  day: DayOfWeek,
  period: number,
  subjectId: string,
  pairs: Array<[string, string]>
): boolean {
  const conflicting = conflictingSubjects(subjectId, pairs);
  if (!conflicting.size) return false;
  return slots.some(s => s.day === day && s.period === period && s.subjectId && conflicting.has(s.subjectId));
}

function classLabel(cls: SchoolClass): string { return `${cls.form}${cls.stream}`; }

function clearSlots(working: Timetable, ids: Set<string>) {
  working.slots = working.slots.map(s => ids.has(s.id)
    ? { ...s, subjectId: undefined, teacherId: undefined, pairedSubjectId: undefined, pairedTeacherId: undefined }
    : s);
}

/** Enforce user-defined subject conflict pairs by clearing the collision on the smaller side. */
function enforceConflictPairs(
  working: Timetable,
  classes: SchoolClass[],
  subjects: Subject[],
  opts: RebalanceOptions,
  changes: BalancerChange[]
) {
  const pairs = opts.conflictPairs || [];
  if (!pairs.length) return;
  const byDP = new Map<string, TimetableSlot[]>();
  for (const s of working.slots) {
    if (!s.subjectId) continue;
    const k = `${s.day}#${s.period}`;
    let arr = byDP.get(k);
    if (!arr) { arr = []; byDP.set(k, arr); }
    arr.push(s);
  }
  for (const arr of byDP.values()) {
    for (const [a, b] of pairs) {
      const withA = arr.filter(s => s.subjectId === a);
      const withB = arr.filter(s => s.subjectId === b);
      if (!withA.length || !withB.length) continue;
      const toClear = withB.length <= withA.length ? withB : withA;
      const ids = new Set(toClear.map(s => s.id));
      for (const s of toClear) {
        const cls = classes.find(c => c.id === s.classId);
        const subj = subjects.find(su => su.id === s.subjectId);
        changes.push({
          slotIds: [s.id], day: s.day, period: s.period, classId: s.classId,
          className: cls ? classLabel(cls) : s.classId,
          oldSubjectId: s.subjectId, oldSubjectCode: subj?.code,
          oldTeacherId: s.teacherId, newSubjectCode: 'FREE',
        });
      }
      clearSlots(working, ids);
      arr.forEach(s => { if (ids.has(s.id)) { s.subjectId = undefined; s.teacherId = undefined; } });
    }
  }
}

/** Trim O-level classes to their target by clearing excess. */
function capOLevel(
  working: Timetable,
  classes: SchoolClass[],
  subjects: Subject[],
  opts: RebalanceOptions,
  changes: BalancerChange[]
) {
  const oClasses = classes.filter(c => c.form <= 4);
  for (const cls of oClasses) {
    const bySubj: Record<string, TimetableSlot[]> = {};
    for (const s of working.slots) {
      if (s.classId !== cls.id || s.type !== 'lesson' || !s.subjectId) continue;
      (bySubj[s.subjectId] ||= []).push(s);
    }
    for (const [sid, arr] of Object.entries(bySubj)) {
      const subj = subjects.find(s => s.id === sid);
      if (!subj) continue;
      const t = targetFor(cls, subj, opts);
      if (arr.length <= t) continue;
      const toClear = arr.slice(t);
      const ids = new Set(toClear.map(s => s.id));
      for (const s of toClear) {
        changes.push({
          slotIds: [s.id], day: s.day, period: s.period, classId: cls.id,
          className: classLabel(cls), oldSubjectId: sid, oldSubjectCode: subj.code,
          oldTeacherId: s.teacherId, newSubjectCode: 'FREE',
        });
      }
      clearSlots(working, ids);
    }
  }
}

/** Fill missing periods for every class so current → target. */
function fillDeficits(
  working: Timetable,
  classes: SchoolClass[],
  subjects: Subject[],
  teachers: Teacher[],
  opts: RebalanceOptions,
  changes: BalancerChange[]
) {
  const targetClasses = classes.filter(c => isALevelForm(c.form) || opts.includeOLevel);
  for (const cls of targetClasses) {
    const isA = isALevelForm(cls.form);
    for (const sid of cls.subjectIds) {
      const subj = subjects.find(s => s.id === sid);
      if (!subj) continue;
      const t = targetFor(cls, subj, opts);
      const mine = working.slots.filter(s => s.classId === cls.id && s.subjectId === sid && s.type === 'lesson');
      let need = t - mine.length;
      if (need <= 0) continue;
      const teacher = teachers.find(tc =>
        tc.subjectIds.includes(sid) &&
        tc.assignments.some(a => a.subjectId === sid && a.classIds.some(cid => cid === cls.id))
      ) || teachers.find(tc => tc.subjectIds.includes(sid));
      if (!teacher) continue;
      const daysWithSubject = new Set(mine.map(s => s.day));
      const empties = working.slots
        .filter(s => s.classId === cls.id && s.type === 'lesson' && !s.subjectId)
        .sort((a, b) => a.day.localeCompare(b.day) || a.period - b.period);
      const pairs = opts.conflictPairs || [];

      if (isA) {
        let pairsNeeded = Math.floor(need / 2);
        const claimed = new Set<string>();
        for (let i = 0; i < empties.length - 1 && pairsNeeded > 0; i++) {
          const a = empties[i], b = empties[i + 1];
          if (a.day !== b.day || b.period !== a.period + 1) continue;
          if (claimed.has(a.id) || claimed.has(b.id)) continue;
          if (daysWithSubject.has(a.day)) continue;
          if (working.slots.some(x =>
            (x.day === a.day && (x.period === a.period || x.period === b.period)) &&
            x.teacherId === teacher.id && x.classId !== cls.id
          )) continue;
          if (sameFormOtherFormHasSubject(working.slots, classes, a.day, a.period, sid, cls.form)) continue;
          if (sameFormOtherFormHasSubject(working.slots, classes, a.day, b.period, sid, cls.form)) continue;
          if (slotHasConflict(working.slots, a.day, a.period, sid, pairs)) continue;
          if (slotHasConflict(working.slots, a.day, b.period, sid, pairs)) continue;
          claimed.add(a.id); claimed.add(b.id); daysWithSubject.add(a.day); pairsNeeded--;
          working.slots = working.slots.map(s => (s.id === a.id || s.id === b.id)
            ? { ...s, subjectId: sid, teacherId: teacher.id } : s);
          changes.push({
            slotIds: [a.id, b.id], day: a.day, period: a.period,
            classId: cls.id, className: classLabel(cls),
            oldSubjectCode: 'FREE', newSubjectId: sid, newSubjectCode: subj.code, newTeacherId: teacher.id,
          });
        }
      } else {
        for (const empty of empties) {
          if (need <= 0) break;
          if (working.slots.some(x =>
            x.day === empty.day && x.period === empty.period &&
            x.teacherId === teacher.id && x.classId !== cls.id
          )) continue;
          if (slotHasConflict(working.slots, empty.day, empty.period, sid, pairs)) continue;
          // Avoid stacking >2 of the same subject on a single day for O-level
          const sameDay = working.slots.filter(x => x.classId === cls.id && x.subjectId === sid && x.day === empty.day).length;
          if (sameDay >= 2) continue;
          working.slots = working.slots.map(s => s.id === empty.id
            ? { ...s, subjectId: sid, teacherId: teacher.id } : s);
          changes.push({
            slotIds: [empty.id], day: empty.day, period: empty.period,
            classId: cls.id, className: classLabel(cls),
            oldSubjectCode: 'FREE', newSubjectId: sid, newSubjectCode: subj.code, newTeacherId: teacher.id,
          });
          need--;
        }
      }
    }
  }
}

/**
 * Rebalance timetable.
 */
export function rebalance(
  timetable: Timetable,
  classes: SchoolClass[],
  subjects: Subject[],
  teachers: Teacher[],
  options: RebalanceOptions = {}
): { nextTimetable: Timetable; report: BalancerReport } {
  const opts: RebalanceOptions = { form6Max: A_LEVEL_TARGET, conflictPairs: [], includeOLevel: false, ...options };
  const before = JSON.parse(JSON.stringify(timetable)) as Timetable;
  const working = JSON.parse(JSON.stringify(timetable)) as Timetable;
  const changes: BalancerChange[] = [];
  const teacherLoadsBefore = teacherLoads(before.slots, teachers);

  // 1. Enforce user-defined conflict pairs first.
  enforceConflictPairs(working, classes, subjects, opts, changes);

  // 2. Existing A-level over→under redistribution.
  const aClasses = classes.filter(c => isALevelForm(c.form));
  for (const cls of aClasses) {
    const clsTargetMax = cls.form === 6 ? (opts.form6Max ?? A_LEVEL_TARGET) : A_LEVEL_TARGET;
    let attempts = 0;
    while (attempts++ < 30) {
      const doubles = collectDoubles(working.slots, cls.id);
      const bySubj: Record<string, number> = {};
      for (const d of doubles) bySubj[d.subjectId] = (bySubj[d.subjectId] || 0) + d.slots.length;

      const under = cls.subjectIds
        .map(sid => ({ sid, count: bySubj[sid] || 0 }))
        .filter(x => x.count < clsTargetMax)
        .sort((a, b) => a.count - b.count);
      const over = Object.entries(bySubj)
        .filter(([, c]) => c > clsTargetMax)
        .sort((a, b) => b[1] - a[1]);
      if (!under.length || !over.length) break;

      let didChange = false;
      for (const [overSid, overCount] of over) {
        if (overCount <= clsTargetMax) continue;
        const donorDouble = doubles.find(d =>
          d.subjectId === overSid && d.slots.length === 2 && !d.slots.some(s => s.pairedSubjectId)
        );
        if (!donorDouble) continue;

        for (const { sid: newSid } of under) {
          if (newSid === overSid) continue;
          if ((bySubj[newSid] || 0) >= clsTargetMax) continue;
          if (sameFormOtherFormHasSubject(working.slots, classes, donorDouble.day, donorDouble.period, newSid, cls.form)) continue;
          if (sameFormOtherFormHasSubject(working.slots, classes, donorDouble.day, donorDouble.period + 1, newSid, cls.form)) continue;
          if (slotHasConflict(working.slots, donorDouble.day, donorDouble.period, newSid, opts.conflictPairs || [])) continue;
          if (slotHasConflict(working.slots, donorDouble.day, donorDouble.period + 1, newSid, opts.conflictPairs || [])) continue;

          const newTeacher = findFreeTeacher(newSid, cls.id, donorDouble.day, donorDouble.period, 2, working.slots, teachers);
          if (!newTeacher) continue;

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
            slotIds: affectedIds, day: donorDouble.day, period: donorDouble.period,
            classId: cls.id, className: classLabel(cls),
            oldSubjectId: overSid, oldSubjectCode: subjects.find(s => s.id === overSid)?.code,
            newSubjectId: newSid, newSubjectCode: subjects.find(s => s.id === newSid)?.code,
            oldTeacherId: donorDouble.teacherId, newTeacherId: newTeacher,
          });
          didChange = true;
          break;
        }
        if (didChange) break;
      }
      if (!didChange) break;
    }

    // Hard cap: excess doubles → free
    const doublesFinal = collectDoubles(working.slots, cls.id);
    const finalCount: Record<string, number> = {};
    for (const d of doublesFinal) finalCount[d.subjectId] = (finalCount[d.subjectId] || 0) + d.slots.length;
    for (const [sid, count] of Object.entries(finalCount)) {
      let excess = count - clsTargetMax;
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
          slotIds: affectedIds, day: donor.day, period: donor.period,
          classId: cls.id, className: classLabel(cls),
          oldSubjectId: sid, oldSubjectCode: subjects.find(s => s.id === sid)?.code,
          oldTeacherId: donor.teacherId, newSubjectCode: 'FREE',
        });
        excess -= 2;
      }
    }
  }

  // 3. O-level cap (if opted-in).
  if (opts.includeOLevel) capOLevel(working, classes, subjects, opts, changes);

  // 4. Fill deficits everywhere so Current → Target automatically.
  //    Run a few passes since filling one slot may unlock another.
  for (let pass = 0; pass < 3; pass++) {
    const before = changes.length;
    fillDeficits(working, classes, subjects, teachers, opts, changes);
    if (changes.length === before) break;
  }

  const fairnessBefore = analyzeFairness(before, classes, subjects, opts);
  const fairnessAfter = analyzeFairness(working, classes, subjects, opts);
  const teacherLoadsAfter = teacherLoads(working.slots, teachers);

  const teacherRows: TeacherLoadRow[] = teachers.map(t => ({
    teacherId: t.id, teacherName: t.name,
    before: teacherLoadsBefore[t.id] || 0,
    after: teacherLoadsAfter[t.id] || 0,
    max: t.maxPeriodsPerWeek,
    overloaded: (teacherLoadsAfter[t.id] || 0) > t.maxPeriodsPerWeek,
  }));

  // Roll back moves that overloaded a teacher.
  const overloadedIds = new Set(teacherRows.filter(r => r.overloaded && (teacherLoadsBefore[r.teacherId] || 0) <= r.max).map(r => r.teacherId));
  if (overloadedIds.size) {
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

  const clashesAfter = working.conflicts.length;
  const report: BalancerReport = {
    fairness: fairnessBefore,
    fairnessAfter,
    teacherLoads: teacherRows,
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
