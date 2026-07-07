import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { SchoolConfig, Subject, Teacher, SchoolClass, Timetable, TimetableSlot, TimetableConflict, DayOfWeek, FormLevel } from '@/types/school';
import { defaultConfig, defaultSubjects, generateDefaultClasses, generateDefaultTeachers, DAYS } from '@/data/defaults';
import { v4 } from '@/lib/utils';

interface TimetableContextType {
  config: SchoolConfig;
  setConfig: (config: SchoolConfig) => void;
  subjects: Subject[];
  setSubjects: (subjects: Subject[]) => void;
  teachers: Teacher[];
  setTeachers: (teachers: Teacher[]) => void;
  classes: SchoolClass[];
  setClasses: (classes: SchoolClass[]) => void;
  timetable: Timetable | null;
  generateTimetable: () => void;
  updateSlot: (slotId: string, updates: Partial<TimetableSlot>, combinedClassIds?: string[]) => void;
  replaceTimetable: (next: Timetable) => void;
}

const TimetableContext = createContext<TimetableContextType | undefined>(undefined);

const loadLS = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
};

export function TimetableProvider({ children }: { children: React.ReactNode }) {
  const [config, _setConfig] = useState<SchoolConfig>(() => loadLS('tt_config', defaultConfig));
  const [subjects, _setSubjects] = useState<Subject[]>(() => loadLS('tt_subjects', defaultSubjects));
  const [teachers, _setTeachers] = useState<Teacher[]>(() => loadLS('tt_teachers', generateDefaultTeachers()));
  const [classes, _setClasses] = useState<SchoolClass[]>(() => {
    const stored = loadLS<SchoolClass[]>('tt_classes', generateDefaultClasses());
    const deletedSet = new Set(loadLS<string[]>('tt_deleted_classes', []));
    // Skip any class the user has explicitly deleted.
    const defaults = generateDefaultClasses().filter(d => !deletedSet.has(d.id));
    let changed = false;
    const filteredStored = stored.filter(c => !deletedSet.has(c.id));
    if (filteredStored.length !== stored.length) changed = true;
    const merged: SchoolClass[] = filteredStored.map(c => {
      const def = defaults.find(d => d.id === c.id);
      if (!def) return c;
      const missingSubs = def.subjectIds.filter(sId => !c.subjectIds.includes(sId));
      if (missingSubs.length) {
        changed = true;
        return { ...c, subjectIds: [...c.subjectIds, ...missingSubs] };
      }
      return c;
    });
    const missingClasses = defaults.filter(d => !merged.some(c => c.id === d.id));
    if (missingClasses.length) { changed = true; merged.push(...missingClasses); }
    if (changed) {
      try { localStorage.setItem('tt_classes', JSON.stringify(merged)); } catch {}
      return merged;
    }
    return stored;
  });
  const [timetable, setTimetable] = useState<Timetable | null>(() => loadLS<Timetable | null>('tt_timetable', null));

  const persistTimetable = (v: Timetable | null) => {
    setTimetable(v);
    try {
      if (v) localStorage.setItem('tt_timetable', JSON.stringify(v));
      else localStorage.removeItem('tt_timetable');
    } catch {}
  };
  const invalidateTimetable = () => persistTimetable(null);

  const setConfig = (v: SchoolConfig) => { _setConfig(v); try { localStorage.setItem('tt_config', JSON.stringify(v)); } catch {} invalidateTimetable(); };
  const setSubjects = (v: Subject[]) => { _setSubjects(v); try { localStorage.setItem('tt_subjects', JSON.stringify(v)); } catch {} invalidateTimetable(); };
  const setTeachers = (v: Teacher[]) => { _setTeachers(v); try { localStorage.setItem('tt_teachers', JSON.stringify(v)); } catch {} invalidateTimetable(); };
  const setClasses = (v: SchoolClass[]) => { _setClasses(v); try { localStorage.setItem('tt_classes', JSON.stringify(v)); } catch {} invalidateTimetable(); };

  // Auto-purge: any subject whose code doesn't end with "A" is not an A-level subject.
  // Strip it from Forms 5 & 6 class allocations and any existing A-level timetable slots.
  useEffect(() => {
    const isALevelSubject = (subjectId: string) => {
      const s = subjects.find(x => x.id === subjectId);
      if (!s) return false;
      return (s.code || '').trim().toUpperCase().endsWith('A');
    };
    let classesChanged = false;
    const nextClasses = classes.map(c => {
      if (c.form !== 5 && c.form !== 6) return c;
      const cleaned = c.subjectIds.filter(isALevelSubject);
      if (cleaned.length !== c.subjectIds.length) {
        classesChanged = true;
        return { ...c, subjectIds: cleaned };
      }
      return c;
    });
    if (classesChanged) {
      _setClasses(nextClasses);
      try { localStorage.setItem('tt_classes', JSON.stringify(nextClasses)); } catch {}
    }
    if (timetable) {
      const aLevelClassIds = new Set(classes.filter(c => c.form === 5 || c.form === 6).map(c => c.id));
      let ttChanged = false;
      let nextSlots = timetable.slots.map(s => {
        if (!aLevelClassIds.has(s.classId)) return s;
        if (s.subjectId && !isALevelSubject(s.subjectId)) {
          ttChanged = true;
          return { ...s, subjectId: undefined, teacherId: undefined, pairedSubjectId: undefined, pairedTeacherId: undefined };
        }
        return s;
      });
      // A-LEVEL rule: doubles only, and never the same subject twice on the same day.
      // 1) Any lesson slot without an adjacent same-subject neighbour is an illegal singleton → clear it.
      // 2) If a subject appears in more than one double on the same day, keep the first, clear the rest.
      const hasNeighbour = (s: TimetableSlot) =>
        !!s.subjectId && nextSlots.some(x =>
          x.classId === s.classId && x.subjectId === s.subjectId && x.day === s.day &&
          x.id !== s.id && (x.period === s.period - 1 || x.period === s.period + 1)
        );
      const cleared = new Set<string>();
      for (const s of nextSlots) {
        if (!aLevelClassIds.has(s.classId) || !s.subjectId || s.type !== 'lesson') continue;
        if (!hasNeighbour(s)) cleared.add(s.id);
      }
      // Detect duplicate doubles per (class, day, subject): keep earliest block.
      const seen: Record<string, number> = {};
      const perBlock = [...nextSlots]
        .filter(s => aLevelClassIds.has(s.classId) && s.subjectId && s.type === 'lesson' && !cleared.has(s.id))
        .sort((a, b) => a.day.localeCompare(b.day) || a.period - b.period);
      for (const s of perBlock) {
        const key = `${s.classId}#${s.day}#${s.subjectId}`;
        const first = seen[key];
        if (first === undefined) { seen[key] = s.period; continue; }
        // If this slot is part of a different (non-adjacent to first) block, clear it.
        if (Math.abs(s.period - first) > 1) cleared.add(s.id);
      }
      if (cleared.size) {
        ttChanged = true;
        nextSlots = nextSlots.map(s => cleared.has(s.id)
          ? { ...s, subjectId: undefined, teacherId: undefined, pairedSubjectId: undefined, pairedTeacherId: undefined }
          : s);
      }
      // COMP A is a standalone A-level subject taken by ALL A-level streams — it is
      // NEVER paired with another subject. Strip any legacy COMPA↔BIOA pairing.
      const compA = subjects.find(s => /^COMP.*A$/i.test((s.code || '').trim()));
      if (compA) {
        let unpairedChanged = false;
        nextSlots = nextSlots.map(s => {
          if (!aLevelClassIds.has(s.classId)) return s;
          if (s.subjectId === compA.id && s.pairedSubjectId) {
            unpairedChanged = true;
            return { ...s, pairedSubjectId: undefined, pairedTeacherId: undefined };
          }
          if (s.pairedSubjectId === compA.id) {
            unpairedChanged = true;
            return { ...s, pairedSubjectId: undefined, pairedTeacherId: undefined };
          }
          return s;
        });
        if (unpairedChanged) ttChanged = true;
      }
      if (ttChanged) {
        const next: Timetable = { ...timetable, slots: nextSlots };
        setTimetable(next);
        try { localStorage.setItem('tt_timetable', JSON.stringify(next)); } catch {}
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects, classes.length]);

  const isSportsPeriod = useCallback((day: DayOfWeek, period: number) => {
    return config.sportsDays.includes(day) && period >= config.sportsStartPeriod;
  }, [config]);

  const generateTimetable = useCallback(() => {
    const slots: TimetableSlot[] = [];
    const shuffle = <T,>(arr: T[]): T[] => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    const teacherSchedule: Record<string, Record<string, string>> = {};
    const teacherLoad: Record<string, number> = {};
    const classSubjectCount: Record<string, Record<string, number>> = {};
    const preAssigned: Record<string, { subjectId: string; teacherId: string; combinedClassIds?: string[]; skipTeacherLoad?: boolean }> = {};

    // A-level cross-form period lock: a subject taught at Form 5 in (day, slot) must
    // NOT be taught in Form 6 at the same (day, slot), and vice versa. This ensures
    // Form 5 and Form 6 always take common subjects at DIFFERENT times, while streams
    // within the same form still share the period (via combineGroups / preAssigned).
    // Generalized: same subject cannot appear in a different form at the same
    // (day, slot). Applies to Form 3 vs Form 4, Form 5 vs Form 6, etc. Streams
    // within the same form still share the period via combineGroups / preAssigned.
    const aLevelSubjectSlot: Record<string, number> = {};
    const aKey = (subjectId: string, day: string, slot: number) => `${subjectId}-${day}-${slot}`;
    const markALevel = (form: number | undefined, subjectId: string, day: string, slot: number) => {
      if (typeof form === 'number') aLevelSubjectSlot[aKey(subjectId, day, slot)] = form;
    };
    const blockedByOtherForm = (form: number | undefined, subjectId: string, day: string, slot: number) => {
      if (typeof form !== 'number') return false;
      const owner = aLevelSubjectSlot[aKey(subjectId, day, slot)];
      return owner !== undefined && owner !== form;
    };

    const totalSlots = config.periodsPerDay + 2;
    const breakSlot = config.morningBreakAfterPeriod + 1;
    const lunchSlot = config.lunchAfterPeriod + 2;

    const STRICT_DOUBLE_CODES = new Set(['PHY', 'CHE', 'BIO']);
    const isStrictDouble = (s: Subject) => STRICT_DOUBLE_CODES.has((s.code || '').toUpperCase());

    // Per-class subject periods-per-week overrides. Matched by class stream (case-insensitive)
    // and subject code. These ALWAYS take precedence over the default O-level / A-level counts.
    const streamIs = (classId: string, stream: string) =>
      new RegExp(`^\\d+\\s*${stream}$`, 'i').test(classId);
    const PPW_OVERRIDES: Array<{ match: (cls: { id: string; form?: number }) => boolean; code: string; periods: number }> = [
      { match: (c) => c.form === 4 && streamIs(c.id, 'whale'), code: 'ECO', periods: 5 },
      { match: (c) => c.form === 4 && streamIs(c.id, 'whale'), code: 'ACC', periods: 7 },
      { match: (c) => c.form === 6, code: 'ECO', periods: 4 },
    ];
    // A-level (forms 5/6) classes get 8 periods/week per subject regardless of the subject's
    // configured periodsPerWeek. O-level uses the subject's configured value; strict sciences
    // are rounded up to an even count so they can never be forced into a single session.
    // Per-class `subjectPeriods` overrides take highest precedence.
    const ppwFor = (subject: Subject, classOrForm?: { id: string; form?: number } | number) => {
      const classForm = typeof classOrForm === 'number' ? classOrForm : classOrForm?.form;
      const classId = typeof classOrForm === 'object' && classOrForm ? classOrForm.id : undefined;
      const code = (subject.code || '').toUpperCase();
      if (classId) {
        const cls = classes.find(c => c.id === classId);
        const perClass = cls?.subjectPeriods?.[subject.id];
        if (typeof perClass === 'number' && perClass > 0) {
          return isStrictDouble(subject) && perClass % 2 === 1 ? perClass + 1 : perClass;
        }
        const ov = PPW_OVERRIDES.find(o => o.code === code && o.match({ id: classId, form: classForm }));
        if (ov) return isStrictDouble(subject) && ov.periods % 2 === 1 ? ov.periods + 1 : ov.periods;
      }
      const base = (classForm === 5 || classForm === 6) ? 8 : subject.periodsPerWeek;
      return isStrictDouble(subject) && base % 2 === 1 ? base + 1 : base;
    };
    // Subjects eligible for an automatic double period somewhere in the week:
    // anything scheduled at 6+ periods/week (covers core sciences, languages, A-level subjects),
    // plus any subject flagged as `subjectDoubles` on the specific class.
    const globalDoubleEligible = new Set(subjects.filter(s => s.periodsPerWeek >= 6).map(s => s.id));
    const isDoubleEligible = (subjectId: string, classId: string) => {
      if (globalDoubleEligible.has(subjectId)) return true;
      const cls = classes.find(c => c.id === classId);
      return !!cls?.subjectDoubles?.includes(subjectId);
    };
    // "Always double" subjects: every placement must be part of a double period.
    // Covers core sciences + Agriculture by code. A-level (forms 5/6) use QUADS instead.
    const ALWAYS_DOUBLE_CODES = new Set(['PHY', 'CHE', 'BIO', 'CLS', 'AGR', 'AGRI', 'CS', 'COMP']);
    // A-level subjects (forms 5/6) are scheduled as doubles (2 consecutive periods) so that
    // teachers meet each class multiple times per week. With 8 periods/week per subject this
    // yields 4 meetings per week per A-level subject.
    const mustQuad = (form: number | undefined) => false;
    const isALevelForm = (form: number | undefined) => form === 5 || form === 6;
    const mustDouble = (s: Subject, form: number | undefined) =>
      isALevelForm(form) || ALWAYS_DOUBLE_CODES.has((s.code || '').toUpperCase());
    // Per-day block size required when this subject appears on a day.
    const blockSize = (s: Subject, form: number | undefined) => {
      if (mustDouble(s, form)) return 2;
      return 1;
    };

    const classSubjectDayDoubled: Record<string, boolean> = {};
    // All compulsory (core) subjects should appear EVERY day for each class.
    const dailySubjectIds = new Set(subjects.filter(s => s.isCompulsory).map(s => s.id));
    const classSubjectDay: Record<string, Set<string>> = {};
    const classSubjectDayCount: Record<string, number> = {};
    const classSubjectDaySection: Record<string, Set<string>> = {};
    const classSubjectWeekDays: Record<string, Set<string>> = {};
    const classSubjectLastSlot: Record<string, number> = {};
    // Weekly count of placements per section for a (class, subject) — used to keep
    // subjects fairly distributed across morning / midday / afternoon over the week.
    const classSubjectSectionWeekCount: Record<string, number> = {};

    teachers.forEach(t => { teacherLoad[t.id] = 0; });

    // Stream alias map: friendly names used in teacher assignments are normalised
    // to the canonical class stream codes used by the timetable engine.
    // e.g. "4 Gold" / "4Gold" -> "4G1".
    const STREAM_ALIASES: Record<string, string> = {
      gold: 'G1', silver: 'G2', bronze: 'G22', platinum: 'Blue',
    };
    const canonicalClassId = (raw: string): string => {
      if (!raw) return raw;
      const m = String(raw).trim().match(/^(\d+)\s*(.+)$/);
      if (!m) return raw;
      const form = m[1];
      const stream = m[2].trim();
      const canonical = STREAM_ALIASES[stream.toLowerCase()] || stream;
      return `${form}${canonical}`;
    };
    const matchesClass = (assignedId: string, classId: string) =>
      assignedId === classId || canonicalClassId(assignedId) === classId;

    const normaliseSubjectKey = (value: string) => value.toUpperCase().replace(/&/g, 'AND').replace(/[^A-Z0-9]+/g, '');
    const subjectMatchesAnyKey = (subject: Subject, keys: Set<string>) => {
      const code = normaliseSubjectKey(subject.code || '');
      const name = normaliseSubjectKey(subject.name || '');
      return keys.has(code) || keys.has(name);
    };

    const A_LEVEL_ALL_STREAM_KEYS = new Set([
      'GEO', 'GEOGRAPHY', 'GEOALEVEL', 'GEOGRAPHYALEVEL',
      'COMP', 'COMPA', 'COMPUTING', 'COMPUTINGA', 'COMPUTERSCIENCE', 'COMPUTERSCIENCEA', 'CS', 'CSA',
    ]);
    const A_LEVEL_ARTS_ONLY_KEYS = new Set([
      'HIS', 'HISTORY',
      'LIT', 'LITERATURE', 'LITERATUREINENGLISH', 'ENGLISHLITERATURE',
      'SHO', 'SHON', 'SHONA',
      'BIB', 'BIBLE', 'BIBLEKNOWLEDGE', 'BIBLICALSTUDIES',
      'RS', 'RE', 'REL', 'RELIGION', 'RELIGIOUSSTUDIES', 'DIVINITY',
      'HER', 'HEL', 'HERITAGE', 'HERITAGESTUDIES',
      'FRS', 'FRE', 'FRENCH',
    ]);
    // Subjects that must NEVER appear in A-level (Forms 5 & 6) regardless of
    // class configuration or teacher assignments.
    const A_LEVEL_EXCLUDED_KEYS = new Set([
      'ENG', 'ENGLISH', 'ENGLISHLANGUAGE',
    ]);

    const aLevelAllowedAreas = (subject: Subject): SchoolClass['learningArea'][] | null => {
      if (subjectMatchesAnyKey(subject, A_LEVEL_ALL_STREAM_KEYS)) return ['Sciences', 'Commercials', 'Arts'];
      if (subject.learningAreas && subject.learningAreas.length > 0) return subject.learningAreas;
      if (subjectMatchesAnyKey(subject, A_LEVEL_ARTS_ONLY_KEYS)) return ['Arts'];
      return null;
    };
    const isExcludedFromALevel = (subject: Subject) => {
      if (subjectMatchesAnyKey(subject, A_LEVEL_EXCLUDED_KEYS)) return true;
      // Rule: A-level subject codes must end with "A" (e.g. MATA, PHYA, GEOA).
      // Any subject whose code doesn't end in A is not an A-level subject.
      const code = (subject.code || '').trim().toUpperCase();
      if (!code.endsWith('A')) return true;
      return false;
    };

    // Respect the class subject allocation exactly. Teacher assignments decide who can teach
    // a selected subject, but they must not silently re-add subjects removed from a class.
    // Build subject list per class from BOTH sources:
    //   (a) the class's own subjectIds (Admin → Classes)
    //   (b) any subject a teacher is explicitly assigned to teach for that class
    // This means if you set up teacher allocations for A-level (or any class) but
    // forgot to also tick the subject on the class row, the timetable still fills.
    const teacherAssignedByClass: Record<string, Set<string>> = {};
    classes.forEach(c => { teacherAssignedByClass[c.id] = new Set(); });
    teachers.forEach(t => {
      t.assignments.forEach(a => {
        if (!subjects.some(s => s.id === a.subjectId)) return;
        a.classIds.forEach(rawCid => {
          const cls = classes.find(c => matchesClass(rawCid, c.id));
          if (!cls) return;
          // Respect the subject's declared forms — don't force a subject onto a form it doesn't apply to.
          const subj = subjects.find(s => s.id === a.subjectId);
          if (subj && subj.forms.length && !subj.forms.includes(cls.form)) return;
          teacherAssignedByClass[cls.id].add(a.subjectId);
        });
      });
    });
    const classSubjectIds: Record<string, string[]> = {};
    // COMP A is a mandatory A-level subject for every stream (Sciences, Commercials, Arts).
    const compASubject = subjects.find(s => /^COMP.*A$/i.test((s.code || '').trim()));
    classes.forEach(c => {
      const fromClass = c.subjectIds.filter(sId => subjects.some(s => s.id === sId));
      let merged = Array.from(new Set([...fromClass, ...teacherAssignedByClass[c.id]]));
      // A-level (Forms 5 & 6) is strictly split by learning area. A Sciences stream
      // must never receive Arts/Commercials subjects (e.g. GEO A) even if a teacher
      // was mistakenly assigned or the class definition drifted.
      if (c.form === 5 || c.form === 6) {
        // Ensure every A-level stream offers COMP A.
        if (compASubject && !merged.includes(compASubject.id)) merged.push(compASubject.id);
        merged = merged.filter(sId => {
          const subj = subjects.find(s => s.id === sId);
          if (!subj) return false;
          if (isExcludedFromALevel(subj)) return false;
          if (!c.learningArea) return true;
          const allowedAreas = aLevelAllowedAreas(subj);
          if (!allowedAreas) return true;
          return allowedAreas.includes(c.learningArea);
        });
      }
      classSubjectIds[c.id] = merged;
      classSubjectCount[c.id] = {};
      merged.forEach(sId => { classSubjectCount[c.id][sId] = 0; });
    });

    // Pre-mark "free periods" evenly across days so empty slots aren't clustered.
    // For each class, compute total academic slots vs. total required subject periods,
    // then reserve the difference by marking the LAST academic slot of as many days as
    // needed (rotating through days for fairness when multiple frees per day are needed).
    const freeSlots: Record<string, Set<string>> = {}; // classId -> Set("day-slot")
    classes.forEach(c => {
      freeSlots[c.id] = new Set();
      const subs = classSubjectIds[c.id]
        .map(id => subjects.find(s => s.id === id))
        .filter(Boolean) as Subject[];
      const requiredPeriods = subs.reduce((sum, s) => sum + ppwFor(s, c), 0);
      // Build list of academic (day, slot) pairs in order
      const academicPairs: Array<{ day: DayOfWeek; slot: number }> = [];
      for (const day of DAYS) {
        for (let slot = 1; slot <= totalSlots; slot++) {
          if (slot === breakSlot || slot === lunchSlot) continue;
          // inline non-academic check (helpers below not yet in scope)
          let ap = 0;
          for (let i = 1; i <= slot; i++) if (i !== breakSlot && i !== lunchSlot) ap++;
          if (isSportsPeriod(day, ap)) continue;
          academicPairs.push({ day, slot });
        }
      }
      const totalAcademic = academicPairs.length;
      const freeNeeded = Math.max(0, totalAcademic - requiredPeriods);
      if (freeNeeded === 0) return;
      // Group academic pairs by day, then place frees per-day at evenly-spaced
      // positions so we never end up with 3+ consecutive free periods.
      const byDay: Record<string, number[]> = {};
      academicPairs.forEach(p => { (byDay[p.day] ||= []).push(p.slot); });

      // Decide how many frees to place per day (as even as possible across the week).
      const dayOrder = shuffle(DAYS as unknown as DayOfWeek[]);
      const perDay: Record<string, number> = {};
      dayOrder.forEach(d => { perDay[d] = 0; });
      for (let i = 0; i < freeNeeded; i++) {
        perDay[dayOrder[i % dayOrder.length]]++;
      }

      for (const day of dayOrder) {
        const slotsForDay = byDay[day] || [];
        const n = slotsForDay.length;
        let k = Math.min(perDay[day], n);
        if (k === 0) continue;
        // Cap k so we never need 3-in-a-row: with n slots, max non-adjacent-run-of-2 frees
        // is roughly ceil(2n/3). If exceeded, push the excess to other days later.
        const maxK = Math.ceil((2 * n) / 3);
        if (k > maxK) k = maxK;
        // Evenly-spaced indices into slotsForDay (avoids clustering, avoids long runs).
        const picked = new Set<number>();
        for (let i = 0; i < k; i++) {
          const idx = Math.min(n - 1, Math.round((i + 0.5) * n / k) - 1);
          // If collision (shouldn't happen with even spacing), nudge forward.
          let safe = Math.max(0, idx);
          while (picked.has(safe) && safe < n - 1) safe++;
          picked.add(safe);
          freeSlots[c.id].add(`${day}-${slotsForDay[safe]}`);
        }
      }
    });


    // Identify auto-combine groups: classes in the same form (Forms 5 & 6 only) that
    // share the SAME teacher for the SAME subject. They will be scheduled together
    // in the same period as a combined lesson.
    // Returns a map: classId -> { subjectId -> { teacherId, groupClassIds[] } }
    const combineGroups: Record<string, Record<string, { teacherId: string; groupClassIds: string[]; allowedDays?: Set<DayOfWeek>; strict?: boolean }>> = {};
    teachers.forEach(t => {
      t.assignments.forEach(a => {
        // Group this teacher's assigned classes by form (only Forms 5 & 6 combine here).
        // A-level subjects are stream-specific (Sciences/Commercials/Arts each offer
        // different subjects), so only combine streams that ACTUALLY list this subject
        // in their class offerings. This prevents e.g. GEO A appearing in Sciences
        // just because the same teacher also teaches it in Arts.
        const byForm: Record<number, string[]> = {};
        a.classIds.forEach(rawCid => {
          const cls = classes.find(c => matchesClass(rawCid, c.id));
          if (!cls || (cls.form !== 5 && cls.form !== 6)) return;
          const offered = (classSubjectIds[cls.id] || []).includes(a.subjectId);
          if (!offered) return;
          (byForm[cls.form] ||= []).push(cls.id);
        });
        Object.values(byForm).forEach(group => {
          if (group.length < 2) return;
          group.forEach(cid => {
            if (!combineGroups[cid]) combineGroups[cid] = {};
            combineGroups[cid][a.subjectId] = { teacherId: t.id, groupClassIds: group };
          });
        });
      });
    });

    // Per-subject `commonForms`: for each listed form, all streams of that form attend
    // this subject together as a single combined session (same period across streams).
    // Legacy `isCommon` is treated as commonForms = [3, 4].
    // AUTO-DETECT: source of truth is the Classes section (each class's subjectIds).
    // Any form where 2+ streams list the subject in their class definition is auto-combined
    // — so a missing entry on one stream (data-entry mistake) doesn't block combining the rest,
    // and only the classes that actually have the subject are placed together.
    subjects.forEach(subj => {
      const explicit: FormLevel[] = subj.commonForms && subj.commonForms.length > 0
        ? subj.commonForms
        : (subj.isCommon ? [3, 4] : []);
      // Auto-combine ONLY these subjects across streams within Form 3 and Form 4
      // (each form combined separately). Form 1 stays user-controlled via `commonForms`.
      // Forms 5-6 split by learning area.
      const AUTO_COMBINE_KEYS = new Set([
        'ENG', 'ENGLISH',
        'SHO', 'SHON', 'SHONA',
        'GEO', 'GEOGRAPHY',
        'HER', 'HEL', 'HERITAGE', 'HERITAGESTUDIES',
        'HIS', 'HISTORY',
        'RS', 'RE', 'REL', 'RELIGIOUSSTUDIES',
        'COMB', 'CLS', 'CS', 'COMBINEDSCIENCE',
        'MATH', 'MATHS', 'MATHEMATICS',
        'AGR', 'AGRI', 'AGRIC', 'AGRICULTURE',
        'BS', 'BUS', 'BUSINESS', 'BUSINESSSTUDIES',
      ]);
      const code = normaliseSubjectKey(subj.code || '');
      const name = normaliseSubjectKey(subj.name || '');
      const autoForms: FormLevel[] = [];
      if (AUTO_COMBINE_KEYS.has(code) || AUTO_COMBINE_KEYS.has(name)) {
        [3 as FormLevel, 4 as FormLevel].forEach(fl => {
          const formClasses = classes.filter(c => c.form === fl);
          if (formClasses.length < 2) return;
          const streamsWithSubject = formClasses.filter(c => (classSubjectIds[c.id] || []).includes(subj.id)).length;
          if (streamsWithSubject >= 2) autoForms.push(fl);
        });
      }
      const formsForCommon: FormLevel[] = Array.from(new Set([...explicit, ...autoForms])) as FormLevel[];
      if (formsForCommon.length === 0) return;




      formsForCommon.forEach(formLevel => {
        const formClasses = classes.filter(c => c.form === formLevel);
        if (formClasses.length < 2) return;
        const eligibleClasses = formClasses.filter(c => (classSubjectIds[c.id] || []).includes(subj.id));
        if (eligibleClasses.length < 2) return;
        const teacherCoverage = teachers
          .map(t => ({
            t,
            covered: eligibleClasses.filter(c =>
              t.assignments.some(a => a.subjectId === subj.id && a.classIds.some(cid => matchesClass(cid, c.id)))
            ).length,
          }))
          .filter(x => x.covered > 0)
          .sort((a, b) => b.covered - a.covered);
        const chosen = teacherCoverage[0]?.t;
        const groupIds = eligibleClasses.map(c => c.id);
        groupIds.forEach(cid => {
          if (!combineGroups[cid]) combineGroups[cid] = {};
          combineGroups[cid][subj.id] = { teacherId: chosen?.id || '', groupClassIds: groupIds, strict: true };
        });
      });
    });

    // Form 1 combining is fully user-controlled via each subject's `commonForms` setting.
    // No hardcoded Form 1 overrides — if the user unchecks Form 1 for a subject, it will
    // be scheduled per-stream separately.

    const isPreMarkedFree = (classId: string, day: DayOfWeek, slot: number) =>
      freeSlots[classId]?.has(`${day}-${slot}`);

    const hasPlacedSlot = (classId: string, day: DayOfWeek, slot: number) =>
      slots.some(s => s.classId === classId && s.day === day && s.period === slot);

    const EARLY_DAYS = new Set(['Monday', 'Tuesday', 'Wednesday']);

    const isNonAcademic = (day: DayOfWeek, s: number) => {
      if (s === breakSlot || s === lunchSlot) return true;
      let ap = 0;
      for (let i = 1; i <= s; i++) {
        if (i !== breakSlot && i !== lunchSlot) ap++;
      }
      return isSportsPeriod(day, ap);
    };

    const getDaySection = (s: number): string => {
      if (s < breakSlot) return 'before-break';
      if (s > breakSlot && s < lunchSlot) return 'after-break';
      return 'after-lunch';
    };

    const earlyDayCount = (classId: string, subjectId: string): number => {
      const key = `${classId}-${subjectId}`;
      if (!classSubjectWeekDays[key]) return 0;
      return [...classSubjectWeekDays[key]].filter(d => EARLY_DAYS.has(d)).length;
    };

    const violatesGapRule = (classId: string, day: string, subjectId: string, currentSlot: number): boolean => {
      const lastSlot = classSubjectLastSlot[`${classId}-${day}-${subjectId}`];
      if (lastSlot === undefined) return false;
      return currentSlot - lastSlot === 2;
    };

    const isConsecutive = (classId: string, day: string, subjectId: string, currentSlot: number): boolean => {
      const lastSlot = classSubjectLastSlot[`${classId}-${day}-${subjectId}`];
      return lastSlot !== undefined && currentSlot - lastSlot === 1;
    };

    const recordSubjectSlot = (
      classId: string, day: DayOfWeek, subjectId: string, slot: number,
      teacherId?: string, teacher?: Teacher
    ) => {
      classSubjectCount[classId][subjectId] = (classSubjectCount[classId][subjectId] || 0) + 1;
      const classDayKey = `${classId}-${day}`;
      if (!classSubjectDay[classDayKey]) classSubjectDay[classDayKey] = new Set();
      classSubjectDay[classDayKey].add(subjectId);
      classSubjectDayCount[`${classId}-${day}-${subjectId}`] = (classSubjectDayCount[`${classId}-${day}-${subjectId}`] || 0) + 1;
      const sectionKey = `${classId}-${day}-${subjectId}`;
      if (!classSubjectDaySection[sectionKey]) classSubjectDaySection[sectionKey] = new Set();
      const sec = getDaySection(slot);
      classSubjectDaySection[sectionKey].add(sec);
      classSubjectSectionWeekCount[`${classId}-${subjectId}-${sec}`] =
        (classSubjectSectionWeekCount[`${classId}-${subjectId}-${sec}`] || 0) + 1;
      classSubjectLastSlot[`${classId}-${day}-${subjectId}`] = slot;
      const weekKey = `${classId}-${subjectId}`;
      if (!classSubjectWeekDays[weekKey]) classSubjectWeekDays[weekKey] = new Set();
      classSubjectWeekDays[weekKey].add(day);
      if (teacherId && teacher) {
        if (!teacherSchedule[teacherId]) teacherSchedule[teacherId] = {};
        teacherSchedule[teacherId][`${day}-${slot}`] = classId;
        teacherLoad[teacherId] = (teacherLoad[teacherId] || 0) + 1;
      }
    };

    // Elective pairing: Agriculture and Computer Science are taught in parallel — same
    // class slot, two teachers, students split by elective choice. Display label = "AGR/CS".
    const PARTNER_CODES: Record<string, string> = { AGR: 'CS', CS: 'AGR', AGRI: 'COMP', COMP: 'AGRI' };
    const tryPairSlot = (
      slotObj: TimetableSlot, cls: SchoolClass, day: DayOfWeek, slotIdx: number, subject: Subject
    ) => {
      const code = (subject.code || '').toUpperCase();
      const partnerCode = PARTNER_CODES[code];
      if (!partnerCode) return;
      const partner = subjects.find(s => (s.code || '').toUpperCase() === partnerCode);
      if (!partner) return;
      if (!(classSubjectIds[cls.id] || []).includes(partner.id)) return;
      if ((classSubjectCount[cls.id][partner.id] || 0) >= ppwFor(partner, cls)) return;
      const partnerTeachers = teachers.filter(t =>
        t.assignments.some(a => a.subjectId === partner.id && a.classIds.some(cid => matchesClass(cid, cls.id)))
        && (teacherLoad[t.id] || 0) < t.maxPeriodsPerWeek
        && !teacherSchedule[t.id]?.[`${day}-${slotIdx}`]
      );
      if (partnerTeachers.length === 0) return;
      const pt = partnerTeachers.sort((a, b) => (teacherLoad[a.id] || 0) - (teacherLoad[b.id] || 0))[0];
      slotObj.pairedSubjectId = partner.id;
      slotObj.pairedTeacherId = pt.id;
      recordSubjectSlot(cls.id, day, partner.id, slotIdx, pt.id, pt);
    };


    for (const day of DAYS) {
      let academicPeriod = 0;
      for (let slot = 1; slot <= totalSlots; slot++) {
        if (slot === breakSlot) {
          classes.forEach(c => { slots.push({ id: v4(), day, period: slot, classId: c.id, type: 'break' }); });
          continue;
        }
        if (slot === lunchSlot) {
          classes.forEach(c => { slots.push({ id: v4(), day, period: slot, classId: c.id, type: 'lunch' }); });
          continue;
        }
        academicPeriod++;
        if (isSportsPeriod(day, academicPeriod)) {
          classes.forEach(c => { slots.push({ id: v4(), day, period: slot, classId: c.id, type: 'sports' }); });
          continue;
        }

        const shuffledClasses = shuffle(classes);
        for (const cls of shuffledClasses) {
          const preKey = `${cls.id}-${day}-${slot}`;
          if (preAssigned[preKey]) {
            const pa = preAssigned[preKey];
            slots.push({ id: v4(), day, period: slot, classId: cls.id, subjectId: pa.subjectId, teacherId: pa.teacherId, type: 'lesson', combinedClassIds: pa.combinedClassIds });
            markALevel(cls.form, pa.subjectId, day, slot);
            if (pa.skipTeacherLoad) {
              // Combined sibling — count subject toward this class but don't double-count teacher load
              classSubjectCount[cls.id][pa.subjectId] = (classSubjectCount[cls.id][pa.subjectId] || 0) + 1;
              const cdk = `${cls.id}-${day}`;
              if (!classSubjectDay[cdk]) classSubjectDay[cdk] = new Set();
              classSubjectDay[cdk].add(pa.subjectId);
              classSubjectDayCount[`${cls.id}-${day}-${pa.subjectId}`] = (classSubjectDayCount[`${cls.id}-${day}-${pa.subjectId}`] || 0) + 1;
              const sk = `${cls.id}-${day}-${pa.subjectId}`;
              if (!classSubjectDaySection[sk]) classSubjectDaySection[sk] = new Set();
              const sec2 = getDaySection(slot);
              classSubjectDaySection[sk].add(sec2);
              classSubjectSectionWeekCount[`${cls.id}-${pa.subjectId}-${sec2}`] =
                (classSubjectSectionWeekCount[`${cls.id}-${pa.subjectId}-${sec2}`] || 0) + 1;
              classSubjectLastSlot[`${cls.id}-${day}-${pa.subjectId}`] = slot;
              const wk = `${cls.id}-${pa.subjectId}`;
              if (!classSubjectWeekDays[wk]) classSubjectWeekDays[wk] = new Set();
              classSubjectWeekDays[wk].add(day);
            } else {
              const t = teachers.find(t => t.id === pa.teacherId);
              recordSubjectSlot(cls.id, day, pa.subjectId, slot, pa.teacherId, t);
            }
            continue;
          }

          // Reserved free period — keep slot empty so frees are spread across the week
          if (isPreMarkedFree(cls.id, day, slot)) {
            slots.push({ id: v4(), day, period: slot, classId: cls.id, type: 'lesson' });
            continue;
          }

          const classDayKey = `${cls.id}-${day}`;
          if (!classSubjectDay[classDayKey]) classSubjectDay[classDayKey] = new Set();
          const scheduledToday = classSubjectDay[classDayKey];
          const currentSection = getDaySection(slot);
          const isEarlyDay = EARLY_DAYS.has(day);

          const preFilteredSubjects = shuffle(
            (classSubjectIds[cls.id] || cls.subjectIds)
              .map(sId => subjects.find(s => s.id === sId)!)
              .filter(s => s && (classSubjectCount[cls.id][s.id] || 0) < ppwFor(s, cls))
          )
            .filter(s => {
              const dayCount = classSubjectDayCount[`${cls.id}-${day}-${s.id}`] || 0;
              const maxBlock = blockSize(s, cls.form);
              if (dayCount >= maxBlock) return false;
              if (dayCount >= 1) return isConsecutive(cls.id, day, s.id, slot);
              return true;
            })
            .filter(s => {
              if (s.isCompulsory || dailySubjectIds.has(s.id)) return true;
              return !violatesGapRule(cls.id, day, s.id, slot);
            });
          // Soft cross-form preference: prefer subjects NOT already scheduled at
          // this (day, slot) in another form. Fall back to the full list if the
          // preferred set is empty so we never starve subjects of placements.
          const preferredSubjects = preFilteredSubjects.filter(s => !blockedByOtherForm(cls.form, s.id, day, slot));
          const availableSubjects = (preferredSubjects.length > 0 ? preferredSubjects : preFilteredSubjects)
            .sort((a, b) => {
              // Highest priority: core/daily subjects must be placed BEFORE LUNCH
              // (i.e., before-break or after-break sections) for every class.
              const isBeforeLunch = currentSection === 'before-break' || currentSection === 'after-break';
              const aDailyBeforeBreak = isBeforeLunch && dailySubjectIds.has(a.id) && !scheduledToday.has(a.id) ? 0 : 1;
              const bDailyBeforeBreak = isBeforeLunch && dailySubjectIds.has(b.id) && !scheduledToday.has(b.id) ? 0 : 1;
              if (aDailyBeforeBreak !== bDailyBeforeBreak) return aDailyBeforeBreak - bDailyBeforeBreak;
              const aDailyNeeded = dailySubjectIds.has(a.id) && !scheduledToday.has(a.id) ? 0 : 1;
              const bDailyNeeded = dailySubjectIds.has(b.id) && !scheduledToday.has(b.id) ? 0 : 1;
              if (aDailyNeeded !== bDailyNeeded) return aDailyNeeded - bDailyNeeded;
              const aToday = scheduledToday.has(a.id) ? 1 : 0;
              const bToday = scheduledToday.has(b.id) ? 1 : 0;
              if (aToday !== bToday) return aToday - bToday;
              if (!a.isCompulsory && !b.isCompulsory && isEarlyDay) {
                const aEarly = earlyDayCount(cls.id, a.id);
                const bEarly = earlyDayCount(cls.id, b.id);
                if (aEarly !== bEarly) return aEarly - bEarly;
              }
              // Fairness: avoid concentrating a subject in only one section of the day
              // (e.g., always in the afternoon). Prefer the subject whose count in the
              // CURRENT section is lowest across the week so far.
              const aSecCount = classSubjectSectionWeekCount[`${cls.id}-${a.id}-${currentSection}`] || 0;
              const bSecCount = classSubjectSectionWeekCount[`${cls.id}-${b.id}-${currentSection}`] || 0;
              if (aSecCount !== bSecCount) return aSecCount - bSecCount;
              const aDays = classSubjectWeekDays[`${cls.id}-${a.id}`]?.size || 0;
              const bDays = classSubjectWeekDays[`${cls.id}-${b.id}`]?.size || 0;
              if (aDays !== bDays) return aDays - bDays;
              const aSectionKey = `${cls.id}-${day}-${a.id}`;
              const bSectionKey = `${cls.id}-${day}-${b.id}`;
              const aInSection = classSubjectDaySection[aSectionKey]?.has(currentSection) ? 1 : 0;
              const bInSection = classSubjectDaySection[bSectionKey]?.has(currentSection) ? 1 : 0;
              if (aInSection !== bInSection) return aInSection - bInSection;
              const aCore = a.isCompulsory ? 0 : 1;
              const bCore = b.isCompulsory ? 0 : 1;
              if (aCore !== bCore) return aCore - bCore;
              const aRemain = ppwFor(a, cls) - (classSubjectCount[cls.id][a.id] || 0);
              const bRemain = ppwFor(b, cls) - (classSubjectCount[cls.id][b.id] || 0);
              return bRemain - aRemain;
            });

          // Core/compulsory subjects must be done before lunch. After lunch,
          // strip core subjects from candidates; only fall back to them if no
          // electives remain (so we don't leave the slot empty unnecessarily).
          let candidateSubjects = availableSubjects;
          if (currentSection === 'after-lunch') {
            const noCore = availableSubjects.filter(s => !s.isCompulsory);
            if (noCore.length > 0) candidateSubjects = noCore;
            // Fairness: prefer subjects that have already appeared in a morning/midday
            // section this week so nothing ends up scheduled only in the afternoon.
            // A subject with no morning placement yet AND more than 1 period still to
            // place is deferred so it can still land in a morning slot on another day.
            const hasMorning = (sId: string) =>
              (classSubjectSectionWeekCount[`${cls.id}-${sId}-before-break`] || 0) +
              (classSubjectSectionWeekCount[`${cls.id}-${sId}-after-break`] || 0) > 0;
            const balanced = candidateSubjects.filter(s => {
              if (hasMorning(s.id)) return true;
              const remaining = ppwFor(s, cls) - (classSubjectCount[cls.id][s.id] || 0);
              return remaining <= 1;
            });
            if (balanced.length > 0) candidateSubjects = balanced;
          }

          let assigned = false;
          for (const subject of candidateSubjects) {
            const strictGroup = combineGroups[cls.id]?.[subject.id]?.strict ? combineGroups[cls.id][subject.id] : undefined;
            const availableTeachers = teachers.filter(t => {
              if (strictGroup) {
                return t.id === strictGroup.teacherId
                  && (teacherLoad[t.id] || 0) < t.maxPeriodsPerWeek
                  && !teacherSchedule[t.id]?.[`${day}-${slot}`];
              }
              const hasAssignment = t.assignments.some(a => a.subjectId === subject.id && a.classIds.some(cid => matchesClass(cid, cls.id)));
              return hasAssignment && (teacherLoad[t.id] || 0) < t.maxPeriodsPerWeek && !teacherSchedule[t.id]?.[`${day}-${slot}`];
            });

            if (availableTeachers.length > 0) {
              const teacher = availableTeachers.sort((a, b) => (teacherLoad[a.id] || 0) - (teacherLoad[b.id] || 0))[0];

              const remainingThisSubject = ppwFor(subject, cls) - (classSubjectCount[cls.id][subject.id] || 0);
              const block = blockSize(subject, cls.form);
              const requireBlock = block > 1 && remainingThisSubject >= block;
              if (requireBlock) {
                const alreadyTodayChk = classSubjectDayCount[`${cls.id}-${day}-${subject.id}`] || 0;
                const dayDoubledChk = classSubjectDayDoubled[`${cls.id}-${subject.id}-${day}`];
                if (alreadyTodayChk !== 0 || dayDoubledChk) { continue; }
                let canBlock = true;
                for (let k = 1; k < block; k++) {
                  const ns = slot + k;
                  if (ns > totalSlots
                    || isNonAcademic(day, ns)
                    || preAssigned[`${cls.id}-${day}-${ns}`]
                    || isPreMarkedFree(cls.id, day, ns)
                    || teacherSchedule[teacher.id]?.[`${day}-${ns}`]
                    || (teacherLoad[teacher.id] || 0) + k >= teacher.maxPeriodsPerWeek
                    || blockedByOtherForm(cls.form, subject.id, day, ns)
                  ) { canBlock = false; break; }
                }
                if (!canBlock) continue;
              }

              const grp = combineGroups[cls.id]?.[subject.id];
              const grpActive = !!grp && grp.teacherId === teacher.id && (!grp.allowedDays || grp.allowedDays.has(day));
              const groupMembers = grpActive
                ? grp!.groupClassIds.filter(cid => {
                    if (cid === cls.id) return true;
                    if (hasPlacedSlot(cid, day, slot)) return false;
                    if (preAssigned[`${cid}-${day}-${slot}`]) return false;
                    if (isPreMarkedFree(cid, day, slot)) return false;
                    if ((classSubjectCount[cid]?.[subject.id] || 0) >= ppwFor(subject, classes.find(c => c.id === cid))) return false;
                    const dayCount = classSubjectDayCount[`${cid}-${day}-${subject.id}`] || 0;
                    if (dayCount >= blockSize(subject, classes.find(c => c.id === cid)?.form)) return false;
                    return (classSubjectIds[cid] || []).includes(subject.id);
                  })
                : [cls.id];

              if (grp?.strict) {
                if (!grpActive) continue;
                if (groupMembers.length !== grp.groupClassIds.length) continue;
                if (requireBlock) {
                  let canGroupBlock = true;
                  for (const cid of groupMembers) {
                    const memberClass = classes.find(c => c.id === cid);
                    for (let k = 1; k < block; k++) {
                      const ns = slot + k;
                      if (blockedByOtherForm(cls.form, subject.id, day, ns)) { canGroupBlock = false; break; }
                      if (cid !== cls.id && (
                        hasPlacedSlot(cid, day, ns)
                        || preAssigned[`${cid}-${day}-${ns}`]
                        || isPreMarkedFree(cid, day, ns)
                        || (classSubjectCount[cid]?.[subject.id] || 0) + k >= ppwFor(subject, memberClass)
                      )) { canGroupBlock = false; break; }
                    }
                    if (!canGroupBlock) break;
                  }
                  if (!canGroupBlock) continue;
                }
              }

              const others = groupMembers.filter(id => id !== cls.id);
              const newSlot: TimetableSlot = { id: v4(), day, period: slot, classId: cls.id, subjectId: subject.id, teacherId: teacher.id, type: 'lesson', combinedClassIds: others };
              slots.push(newSlot);
              recordSubjectSlot(cls.id, day, subject.id, slot, teacher.id, teacher);
              tryPairSlot(newSlot, cls, day, slot, subject);
              markALevel(cls.form, subject.id, day, slot);

              others.forEach(cid => {
                const otherCombined = [cls.id, ...others.filter(o => o !== cid)];
                preAssigned[`${cid}-${day}-${slot}`] = {
                  subjectId: subject.id,
                  teacherId: teacher.id,
                  combinedClassIds: otherCombined,
                  skipTeacherLoad: true,
                };
              });

              assigned = true;

              const doubleKey = `${cls.id}-${subject.id}-${day}`;
              const targetBlock = blockSize(subject, cls.form);
              const wantsBlock = targetBlock > 1 || isDoubleEligible(subject.id, cls.id);
              if (wantsBlock && !classSubjectDayDoubled[doubleKey]) {
                const extra = Math.max(1, targetBlock - 1);
                let placed = 0;
                for (let k = 1; k <= extra; k++) {
                  const ns = slot + k;
                  if (ns > totalSlots) break;
                  if (isNonAcademic(day, ns)) break;
                  if (preAssigned[`${cls.id}-${day}-${ns}`]) break;
                  if ((classSubjectCount[cls.id][subject.id] || 0) + placed + 1 > ppwFor(subject, cls)) break;
                  if (teacherSchedule[teacher.id]?.[`${day}-${ns}`]) break;
                  if ((teacherLoad[teacher.id] || 0) + placed + 1 > teacher.maxPeriodsPerWeek) break;
                  if (blockedByOtherForm(cls.form, subject.id, day, ns)) break;
                  preAssigned[`${cls.id}-${day}-${ns}`] = { subjectId: subject.id, teacherId: teacher.id, combinedClassIds: others };
                  markALevel(cls.form, subject.id, day, ns);
                  others.forEach(cid => {
                    if (!preAssigned[`${cid}-${day}-${ns}`] &&
                        (classSubjectCount[cid]?.[subject.id] || 0) < ppwFor(subject, classes.find(c => c.id === cid))) {
                      const otherCombined = [cls.id, ...others.filter(o => o !== cid)];
                      preAssigned[`${cid}-${day}-${ns}`] = {
                        subjectId: subject.id,
                        teacherId: teacher.id,
                        combinedClassIds: otherCombined,
                        skipTeacherLoad: true,
                      };
                    }
                  });
                  if (!teacherSchedule[teacher.id]) teacherSchedule[teacher.id] = {};
                  teacherSchedule[teacher.id][`${day}-${ns}`] = cls.id;
                  placed++;
                  if (targetBlock <= 1 && isDoubleEligible(subject.id, cls.id)) break;
                }
                if (placed > 0) classSubjectDayDoubled[doubleKey] = true;
              }
              break;
            }
          }

          // Teacher-less placement: if no teacher is assigned to any candidate subject
          // for this class, still place the subject on the timetable (without a teacher)
          // so the slot isn't left blank. Honour block-size constraints where possible.
          if (!assigned && candidateSubjects.length > 0) {
            for (const subject of candidateSubjects) {
              const grp = combineGroups[cls.id]?.[subject.id];
              if (!grp?.strict || grp.teacherId) continue;
              const groupMembers = grp.groupClassIds.filter(cid => {
                if (cid === cls.id) return true;
                if (hasPlacedSlot(cid, day, slot)) return false;
                if (preAssigned[`${cid}-${day}-${slot}`]) return false;
                if (isPreMarkedFree(cid, day, slot)) return false;
                if ((classSubjectCount[cid]?.[subject.id] || 0) >= ppwFor(subject, classes.find(c => c.id === cid))) return false;
                const dayCount = classSubjectDayCount[`${cid}-${day}-${subject.id}`] || 0;
                if (dayCount >= blockSize(subject, classes.find(c => c.id === cid)?.form)) return false;
                return (classSubjectIds[cid] || []).includes(subject.id);
              });
              if (groupMembers.length !== grp.groupClassIds.length) continue;

              const remainingThisSubject = ppwFor(subject, cls) - (classSubjectCount[cls.id][subject.id] || 0);
              const block = blockSize(subject, cls.form);
              const requireBlock = block > 1 && remainingThisSubject >= block;
              if (requireBlock) {
                const alreadyTodayChk = classSubjectDayCount[`${cls.id}-${day}-${subject.id}`] || 0;
                const dayDoubledChk = classSubjectDayDoubled[`${cls.id}-${subject.id}-${day}`];
                if (alreadyTodayChk !== 0 || dayDoubledChk) continue;
                let canGroupBlock = true;
                for (const cid of groupMembers) {
                  const memberClass = classes.find(c => c.id === cid);
                  for (let k = 1; k < block; k++) {
                    const ns = slot + k;
                    if (ns > totalSlots || isNonAcademic(day, ns)) { canGroupBlock = false; break; }
                    if (blockedByOtherForm(cls.form, subject.id, day, ns)) { canGroupBlock = false; break; }
                    if (cid !== cls.id && (
                      hasPlacedSlot(cid, day, ns)
                      || preAssigned[`${cid}-${day}-${ns}`]
                      || isPreMarkedFree(cid, day, ns)
                      || (classSubjectCount[cid]?.[subject.id] || 0) + k >= ppwFor(subject, memberClass)
                    )) { canGroupBlock = false; break; }
                  }
                  if (!canGroupBlock) break;
                }
                if (!canGroupBlock) continue;
              }

              const others = groupMembers.filter(id => id !== cls.id);
              slots.push({ id: v4(), day, period: slot, classId: cls.id, subjectId: subject.id, type: 'lesson', combinedClassIds: others });
              recordSubjectSlot(cls.id, day, subject.id, slot);
              markALevel(cls.form, subject.id, day, slot);
              others.forEach(cid => {
                const otherCombined = [cls.id, ...others.filter(o => o !== cid)];
                preAssigned[`${cid}-${day}-${slot}`] = {
                  subjectId: subject.id,
                  teacherId: '',
                  combinedClassIds: otherCombined,
                  skipTeacherLoad: true,
                };
              });
              assigned = true;

              const doubleKey = `${cls.id}-${subject.id}-${day}`;
              const targetBlock = blockSize(subject, cls.form);
              const wantsBlock = targetBlock > 1 || isDoubleEligible(subject.id, cls.id);
              if (wantsBlock && !classSubjectDayDoubled[doubleKey]) {
                const extra = Math.max(1, targetBlock - 1);
                let placed = 0;
                for (let k = 1; k <= extra; k++) {
                  const ns = slot + k;
                  if (ns > totalSlots) break;
                  if (isNonAcademic(day, ns)) break;
                  if (preAssigned[`${cls.id}-${day}-${ns}`]) break;
                  if ((classSubjectCount[cls.id][subject.id] || 0) + placed + 1 > ppwFor(subject, cls)) break;
                  if (blockedByOtherForm(cls.form, subject.id, day, ns)) break;
                  preAssigned[`${cls.id}-${day}-${ns}`] = { subjectId: subject.id, teacherId: '', combinedClassIds: others };
                  markALevel(cls.form, subject.id, day, ns);
                  others.forEach(cid => {
                    if (!preAssigned[`${cid}-${day}-${ns}`] &&
                        (classSubjectCount[cid]?.[subject.id] || 0) < ppwFor(subject, classes.find(c => c.id === cid))) {
                      const otherCombined = [cls.id, ...others.filter(o => o !== cid)];
                      preAssigned[`${cid}-${day}-${ns}`] = {
                        subjectId: subject.id,
                        teacherId: '',
                        combinedClassIds: otherCombined,
                        skipTeacherLoad: true,
                      };
                    }
                  });
                  placed++;
                  if (targetBlock <= 1 && isDoubleEligible(subject.id, cls.id)) break;
                }
                if (placed > 0) classSubjectDayDoubled[doubleKey] = true;
              }
              break;
            }
          }

          if (!assigned && candidateSubjects.length > 0) {
            for (const subject of candidateSubjects) {
              if (combineGroups[cls.id]?.[subject.id]?.strict) continue;
              const remainingThisSubject = ppwFor(subject, cls) - (classSubjectCount[cls.id][subject.id] || 0);
              const block = blockSize(subject, cls.form);
              const requireBlock = block > 1 && remainingThisSubject >= block;
              if (requireBlock) {
                const alreadyTodayChk = classSubjectDayCount[`${cls.id}-${day}-${subject.id}`] || 0;
                const dayDoubledChk = classSubjectDayDoubled[`${cls.id}-${subject.id}-${day}`];
                if (alreadyTodayChk !== 0 || dayDoubledChk) continue;
                let canBlock = true;
                for (let k = 1; k < block; k++) {
                  const ns = slot + k;
                  if (ns > totalSlots
                    || isNonAcademic(day, ns)
                    || preAssigned[`${cls.id}-${day}-${ns}`]
                    || isPreMarkedFree(cls.id, day, ns)
                    || blockedByOtherForm(cls.form, subject.id, day, ns)
                  ) { canBlock = false; break; }
                }
                if (!canBlock) continue;
              }

              slots.push({ id: v4(), day, period: slot, classId: cls.id, subjectId: subject.id, type: 'lesson' });
              recordSubjectSlot(cls.id, day, subject.id, slot);
              markALevel(cls.form, subject.id, day, slot);
              assigned = true;

              const doubleKey = `${cls.id}-${subject.id}-${day}`;
              const targetBlock = blockSize(subject, cls.form);
              const wantsBlock = targetBlock > 1 || isDoubleEligible(subject.id, cls.id);
              if (wantsBlock && !classSubjectDayDoubled[doubleKey]) {
                const extra = Math.max(1, targetBlock - 1);
                let placed = 0;
                for (let k = 1; k <= extra; k++) {
                  const ns = slot + k;
                  if (ns > totalSlots) break;
                  if (isNonAcademic(day, ns)) break;
                  if (preAssigned[`${cls.id}-${day}-${ns}`]) break;
                  if ((classSubjectCount[cls.id][subject.id] || 0) + placed + 1 > ppwFor(subject, cls)) break;
                  if (blockedByOtherForm(cls.form, subject.id, day, ns)) break;
                  preAssigned[`${cls.id}-${day}-${ns}`] = { subjectId: subject.id, teacherId: '', combinedClassIds: [] };
                  markALevel(cls.form, subject.id, day, ns);
                  placed++;
                  if (targetBlock <= 1 && isDoubleEligible(subject.id, cls.id)) break;
                }
                if (placed > 0) classSubjectDayDoubled[doubleKey] = true;
              }
              break;
            }
          }

          if (!assigned) {
            slots.push({ id: v4(), day, period: slot, classId: cls.id, type: 'lesson' });
          }
        }
      }
    }

    const newTimetable: Timetable = { id: v4(), slots, conflicts: [], generatedAt: new Date().toISOString() };
    newTimetable.conflicts = detectConflicts(slots);
    // Auto-rebalance A-level: shift any excess periods on over-allocated
    // subjects into under-allocated subjects in the same class.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { rebalance } = require('@/lib/timetableBalancer');
      let current = newTimetable;
      for (let i = 0; i < 3; i++) {
        const { nextTimetable, report } = rebalance(current, classes, subjects, teachers);
        if (!report.changes.length) break;
        current = { ...nextTimetable, conflicts: detectConflicts(nextTimetable.slots) };
      }
      persistTimetable(current);
    } catch {
      persistTimetable(newTimetable);
    }
  }, [config, subjects, teachers, classes, isSportsPeriod]);


  const detectConflicts = (slots: TimetableSlot[]): TimetableConflict[] => {
    const conflicts: TimetableConflict[] = [];
    const lessonSlots = slots.filter(s => s.type === 'lesson' && s.teacherId);
    const teacherMap: Record<string, TimetableSlot[]> = {};
    lessonSlots.forEach(s => {
      const key = `${s.teacherId}-${s.day}-${s.period}`;
      if (!teacherMap[key]) teacherMap[key] = [];
      teacherMap[key].push(s);
    });
    Object.entries(teacherMap).forEach(([_, slotGroup]) => {
      if (slotGroup.length > 1) {
        // Skip clash if all slots are intentionally combined together (same group)
        const allCombined = slotGroup.every(s => {
          const others = slotGroup.filter(o => o.id !== s.id).map(o => o.classId);
          return others.every(cid => s.combinedClassIds?.includes(cid));
        });
        if (allCombined) return;
        const teacher = teachers.find(t => t.id === slotGroup[0].teacherId);
        conflicts.push({
          type: 'teacher-clash',
          message: `${teacher?.name || 'Unknown'} is double-booked on ${slotGroup[0].day} period ${slotGroup[0].period}`,
          slots: slotGroup.map(s => s.id),
        });
      }
    });
    return conflicts;
  };

  const updateSlot = useCallback((slotId: string, updates: Partial<TimetableSlot>, combinedClassIds?: string[]) => {
    if (!timetable) return;
    const original = timetable.slots.find(s => s.id === slotId);
    if (!original) return;
    const combined = combinedClassIds || updates.combinedClassIds || [];
    let newSlots = timetable.slots.map(s => s.id === slotId ? { ...s, ...updates, combinedClassIds: combined } : s);
    if (combined.length > 0 && updates.subjectId !== undefined) {
      // Mirror subject/teacher to combined classes' slots at same day/period.
      // Each combined slot records the full group (excluding itself) so the conflict
      // detector recognizes it as an intentional joint period.
      const groupAll = [original.classId, ...combined];
      newSlots = newSlots.map(s => {
        if (s.day !== original.day || s.period !== original.period) return s;
        if (!combined.includes(s.classId)) return s;
        return {
          ...s,
          subjectId: updates.subjectId,
          teacherId: updates.teacherId,
          combinedClassIds: groupAll.filter(id => id !== s.classId),
        };
      });
    } else if (combined.length === 0 && original.combinedClassIds && original.combinedClassIds.length > 0) {
      // Un-combine: clear sibling slots' combined flag
      const siblings = original.combinedClassIds;
      newSlots = newSlots.map(s => {
        if (s.day !== original.day || s.period !== original.period) return s;
        if (!siblings.includes(s.classId)) return s;
        return { ...s, combinedClassIds: [] };
      });
    }
    persistTimetable({ ...timetable, slots: newSlots, conflicts: detectConflicts(newSlots) });
  }, [timetable, teachers]);

  const replaceTimetable = useCallback((next: Timetable) => {
    persistTimetable({ ...next, conflicts: detectConflicts(next.slots) });
  }, [teachers]);

  return (
    <TimetableContext.Provider value={{
      config, setConfig, subjects, setSubjects, teachers, setTeachers,
      classes, setClasses, timetable, generateTimetable, updateSlot, replaceTimetable,
    }}>
      {children}
    </TimetableContext.Provider>
  );
}

export function useTimetable() {
  const ctx = useContext(TimetableContext);
  if (!ctx) throw new Error('useTimetable must be used within TimetableProvider');
  return ctx;
}
