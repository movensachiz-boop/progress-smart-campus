import type { TimetableSlot } from '@/types/school';

/** One class + subject that must run at the same time as the others in its block. */
export interface ParallelEntry {
  classId: string;
  subjectId: string;
}

/** A group of class/subject pairs that must always be timetabled in the same periods. */
export interface ParallelBlock {
  id: string;
  name: string;
  /** Optional form this group applies to (matching happens per form). */
  form?: number;
  /** Subjects that must run at the same time in every form and every stream that takes them. */
  subjectIds?: string[];
  entries: ParallelEntry[];
}

/** Minimal class shape needed to expand subject pairs into class/subject rows. */
export interface ClassLike {
  id: string;
  form: number;
  subjectIds: string[];
}

/**
 * Turn each configured block into one aligned set per form: a pair (or more) of
 * subjects is matched across every stream of a form that studies them.
 */
export function expandBlocks(blocks: ParallelBlock[], classes: ClassLike[]): { name: string; entries: ParallelEntry[] }[] {
  const out: { name: string; entries: ParallelEntry[] }[] = [];
  blocks.forEach(block => {
    const subjectIds = (block.subjectIds || []).filter(Boolean);
    if (subjectIds.length >= 2) {
      const forms = [...new Set(classes.map(c => c.form))]
        .filter(f => !block.form || f === block.form)
        .sort((a, b) => a - b);
      forms.forEach(form => {
        const entries: ParallelEntry[] = [];
        classes
          .filter(c => c.form === form)
          .forEach(c => {
            const taken = subjectIds.filter(id => c.subjectIds.includes(id));
            // A class that takes more than one subject of the pair cannot sit in
            // two lessons at once, so it is skipped — the pair only aligns across
            // classes that take exactly one of the subjects (no clash possible).
            if (taken.length === 1) entries.push({ classId: c.id, subjectId: taken[0] });
          });
        const distinctSubjects = new Set(entries.map(e => e.subjectId));
        if (entries.length >= 2 && distinctSubjects.size >= 2) {
          out.push({ name: `${block.name || 'Group'} · Form ${form}`, entries });
        }
      });

      return;
    }
    const manual = (block.entries || []).filter(e => e.classId && e.subjectId);
    if (manual.length >= 2) out.push({ name: block.name || 'Untitled group', entries: manual });
  });
  return out;
}

const KEY = 'tt_parallel_blocks';

export function loadParallelBlocks(): ParallelBlock[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((b: any) => b && Array.isArray(b.entries)) as ParallelBlock[];
  } catch {
    return [];
  }
}

export function saveParallelBlocks(blocks: ParallelBlock[]) {
  try { localStorage.setItem(KEY, JSON.stringify(blocks)); } catch { /* ignore */ }
}

type Spot = { day: string; period: number };
const spotKey = (s: Spot) => `${s.day}|${s.period}`;

/** Lesson-carrying fields that move together when two slots swap content. */
function content(s: TimetableSlot) {
  return {
    subjectId: s.subjectId,
    teacherId: s.teacherId,
    combinedClassIds: s.combinedClassIds,
    pairedSubjectId: s.pairedSubjectId,
    pairedTeacherId: s.pairedTeacherId,
  };
}

/**
 * Post-generation pass: for every configured block, line up the block's
 * class/subject pairs so they occupy the same day+period, by swapping periods
 * inside each class only (never changing how many periods a subject gets).
 */
export function alignParallelBlocks(
  slots: TimetableSlot[],
  blocks?: ParallelBlock[],
  classes: ClassLike[] = []
): TimetableSlot[] {
  const groups = expandBlocks(blocks ?? loadParallelBlocks(), classes);
  if (!groups.length) return slots;

  const out = slots.map(s => ({ ...s }));

  const teacherAt = new Map<string, string>(); // teacherId|day|period -> slotId
  out.forEach(s => {
    if (s.type === 'lesson' && s.teacherId) teacherAt.set(`${s.teacherId}|${s.day}|${s.period}`, s.id);
  });

  const indexOfSlot = (classId: string, day: string, period: number) =>
    out.findIndex(s => s.classId === classId && s.day === day && s.period === period);

  const teacherFree = (teacherId: string | undefined, day: string, period: number, ignoreSlotIds: string[]) => {
    if (!teacherId) return true;
    const holder = teacherAt.get(`${teacherId}|${day}|${period}`);
    return !holder || ignoreSlotIds.includes(holder);
  };

  const applySwap = (aIdx: number, bIdx: number) => {
    const a = out[aIdx];
    const b = out[bIdx];
    const ca = content(a);
    const cb = content(b);
    if (ca.teacherId) teacherAt.delete(`${ca.teacherId}|${a.day}|${a.period}`);
    if (cb.teacherId) teacherAt.delete(`${cb.teacherId}|${b.day}|${b.period}`);
    out[aIdx] = { ...a, ...cb };
    out[bIdx] = { ...b, ...ca };
    if (cb.teacherId) teacherAt.set(`${cb.teacherId}|${a.day}|${a.period}`, a.id);
    if (ca.teacherId) teacherAt.set(`${ca.teacherId}|${b.day}|${b.period}`, b.id);
  };

  groups.forEach(block => {
    const entries = (block.entries || []).filter(e => e.classId && e.subjectId);
    if (entries.length < 2) return;

    const spotsFor = (e: ParallelEntry): Spot[] =>
      out
        .filter(s => s.type === 'lesson' && s.classId === e.classId && s.subjectId === e.subjectId)
        .map(s => ({ day: s.day, period: s.period }));

    // Anchor on the pair with the most periods so we move the fewest lessons.
    const anchor = entries.reduce((best, e) => (spotsFor(e).length > spotsFor(best).length ? e : best), entries[0]);
    const anchorSpots = spotsFor(anchor).sort((x, y) => (x.day === y.day ? x.period - y.period : x.day.localeCompare(y.day)));

    entries.forEach(entry => {
      if (entry === anchor) return;
      const own = spotsFor(entry);
      const ownKeys = new Set(own.map(spotKey));
      const needed = anchorSpots.filter(s => !ownKeys.has(spotKey(s)));
      const extras = own.filter(s => !anchorSpots.some(a => spotKey(a) === spotKey(s)));

      needed.forEach(target => {
        const extra = extras.shift();
        if (!extra) return;

        const fromIdx = indexOfSlot(entry.classId, extra.day, extra.period);
        const toIdx = indexOfSlot(entry.classId, target.day, target.period);
        if (fromIdx < 0 || toIdx < 0) return;
        const from = out[fromIdx];
        const to = out[toIdx];
        if (from.type !== 'lesson' || to.type !== 'lesson') return;

        const ignore = [from.id, to.id];
        if (!teacherFree(from.teacherId, to.day, to.period, ignore)) return;
        if (!teacherFree(to.teacherId, from.day, from.period, ignore)) return;

        applySwap(fromIdx, toIdx);
      });
    });
  });

  return out;
}

/** Report block pairs that did not end up in the same periods, for user feedback. */
export function parallelBlockIssues(
  slots: TimetableSlot[],
  blocks?: ParallelBlock[],
  classes: ClassLike[] = []
): string[] {
  const groups = expandBlocks(blocks ?? loadParallelBlocks(), classes);
  const issues: string[] = [];
  groups.forEach(block => {
    const entries = (block.entries || []).filter(e => e.classId && e.subjectId);
    if (entries.length < 2) return;
    const keySets = entries.map(e =>
      new Set(
        slots
          .filter(s => s.type === 'lesson' && s.classId === e.classId && s.subjectId === e.subjectId)
          .map(s => `${s.day}|${s.period}`)
      )
    );
    const base = keySets[0];
    const aligned = keySets.every(set => set.size === base.size && [...set].every(k => base.has(k)));
    if (!aligned) issues.push(block.name || 'Untitled group');
  });
  return issues;
}
