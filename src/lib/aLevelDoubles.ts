import { SchoolClass, Subject, TimetableSlot } from '@/types/school';

/**
 * A-LEVEL DOUBLES ENFORCEMENT
 *
 * Hard rule for Forms 5 and 6: every subject occupies exactly two continuous
 * periods. A lone (single) period is never acceptable — it is repaired, not
 * deleted:
 *   1. grow it into the adjacent free period of the same day,
 *   2. otherwise move it into a free consecutive pair on a day where the
 *      subject is not yet taught,
 *   3. only if neither is possible is it cleared (last resort).
 *
 * Afterwards every subject the class offers is topped up towards its weekly
 * target in whole doubles, so no subject is left short of its periods.
 */

const isALevel = (form?: number) => form === 5 || form === 6;

interface Ctx {
  slots: TimetableSlot[];
  idx: Map<string, number>;          // classId|day|period -> index
  teacherBusy: Set<string>;          // teacherId|day|period
}

function buildCtx(slots: TimetableSlot[]): Ctx {
  const idx = new Map<string, number>();
  const teacherBusy = new Set<string>();
  slots.forEach((s, i) => {
    if (s.type === 'lesson') idx.set(`${s.classId}|${s.day}|${s.period}`, i);
    if (s.teacherId) teacherBusy.add(`${s.teacherId}|${s.day}|${s.period}`);
  });
  return { slots, idx, teacherBusy };
}

const freeIndex = (ctx: Ctx, classId: string, day: string, period: number) => {
  const i = ctx.idx.get(`${classId}|${day}|${period}`);
  if (i == null) return -1;
  const s = ctx.slots[i];
  return s.type === 'lesson' && !s.subjectId ? i : -1;
};

const teacherFree = (ctx: Ctx, teacherId: string | undefined, day: string, period: number) =>
  !teacherId || !ctx.teacherBusy.has(`${teacherId}|${day}|${period}`);

function place(ctx: Ctx, i: number, subjectId: string, teacherId?: string) {
  ctx.slots[i] = { ...ctx.slots[i], subjectId, teacherId };
  if (teacherId) ctx.teacherBusy.add(`${teacherId}|${ctx.slots[i].day}|${ctx.slots[i].period}`);
}

function clear(ctx: Ctx, i: number) {
  const s = ctx.slots[i];
  if (s.teacherId) ctx.teacherBusy.delete(`${s.teacherId}|${s.day}|${s.period}`);
  ctx.slots[i] = { ...s, subjectId: undefined, teacherId: undefined, pairedSubjectId: undefined, pairedTeacherId: undefined };
}

/** Periods used by a subject for a class, grouped per day. */
function periodsByDay(ctx: Ctx, classId: string, subjectId: string) {
  const map: Record<string, number[]> = {};
  ctx.slots.forEach(s => {
    if (s.type !== 'lesson' || s.classId !== classId || s.subjectId !== subjectId) return;
    (map[s.day] ||= []).push(s.period);
  });
  Object.values(map).forEach(a => a.sort((x, y) => x - y));
  return map;
}

function daysOf(ctx: Ctx, classId: string) {
  const days: string[] = [];
  ctx.slots.forEach(s => { if (s.classId === classId && !days.includes(s.day)) days.push(s.day); });
  return days;
}

/** Find a free consecutive pair for the class on a day the subject is unused. */
function findFreePair(ctx: Ctx, cls: SchoolClass, subjectId: string, teacherId?: string, excludeDay?: string) {
  const used = periodsByDay(ctx, cls.id, subjectId);
  for (const day of daysOf(ctx, cls.id)) {
    if (day === excludeDay) continue;
    if (used[day]?.length) continue;
    const periods = ctx.slots
      .filter(s => s.classId === cls.id && s.day === day && s.type === 'lesson')
      .map(s => s.period)
      .sort((a, b) => a - b);
    for (const p of periods) {
      const a = freeIndex(ctx, cls.id, day, p);
      const b = freeIndex(ctx, cls.id, day, p + 1);
      if (a < 0 || b < 0) continue;
      if (!teacherFree(ctx, teacherId, day, p) || !teacherFree(ctx, teacherId, day, p + 1)) continue;
      return [a, b] as const;
    }
  }
  return null;
}

export function enforceALevelDoubles(
  input: TimetableSlot[],
  classes: SchoolClass[],
  subjects: Subject[],
  weeklyTarget: (cls: SchoolClass, subject: Subject) => number
): TimetableSlot[] {
  const ctx = buildCtx(input.map(s => ({ ...s })));
  const aClasses = classes.filter(c => isALevel(c.form));

  for (const cls of aClasses) {
    // ---- 1. Repair singletons -------------------------------------------
    const subjectIds = new Set<string>(cls.subjectIds);
    ctx.slots.forEach(s => { if (s.classId === cls.id && s.subjectId) subjectIds.add(s.subjectId); });

    for (const sid of subjectIds) {
      const byDay = periodsByDay(ctx, cls.id, sid);
      for (const [day, periods] of Object.entries(byDay)) {
        // split into runs
        const runs: number[][] = [];
        periods.forEach(p => {
          const last = runs[runs.length - 1];
          if (last && last[last.length - 1] === p - 1) last.push(p);
          else runs.push([p]);
        });
        for (const run of runs) {
          if (run.length !== 1) continue;
          const p = run[0];
          const si = ctx.idx.get(`${cls.id}|${day}|${p}`);
          if (si == null) continue;
          const teacherId = ctx.slots[si].teacherId;

          // (a) grow into the neighbouring free period
          const after = freeIndex(ctx, cls.id, day, p + 1);
          const before = freeIndex(ctx, cls.id, day, p - 1);
          if (after >= 0 && teacherFree(ctx, teacherId, day, p + 1)) { place(ctx, after, sid, teacherId); continue; }
          if (before >= 0 && teacherFree(ctx, teacherId, day, p - 1)) { place(ctx, before, sid, teacherId); continue; }

          // (b) move the single into a clean free pair elsewhere in the week
          const pair = findFreePair(ctx, cls, sid, teacherId, day);
          if (pair) {
            clear(ctx, si);
            place(ctx, pair[0], sid, teacherId);
            place(ctx, pair[1], sid, teacherId);
            continue;
          }

          // (c) last resort — leave no single period behind
          clear(ctx, si);
        }
      }
    }

    // ---- 2. Top up deficits in whole doubles ------------------------------
    for (const sid of cls.subjectIds) {
      const subject = subjects.find(s => s.id === sid);
      if (!subject) continue;
      const rawTarget = weeklyTarget(cls, subject);
      const target = Math.max(2, rawTarget % 2 === 0 ? rawTarget : rawTarget + 1);
      let count = ctx.slots.filter(s => s.type === 'lesson' && s.classId === cls.id && s.subjectId === sid).length;
      if (count >= target) continue;
      const teacherId = ctx.slots.find(s => s.classId === cls.id && s.subjectId === sid)?.teacherId;
      let guard = 0;
      while (count + 1 < target && guard++ < 20) {
        const pair = findFreePair(ctx, cls, sid, teacherId);
        if (!pair) break;
        place(ctx, pair[0], sid, teacherId);
        place(ctx, pair[1], sid, teacherId);
        count += 2;
      }
    }
  }

  return ctx.slots;
}
