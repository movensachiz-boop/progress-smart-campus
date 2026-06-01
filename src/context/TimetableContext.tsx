import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { SchoolConfig, Subject, Teacher, SchoolClass, Timetable, TimetableSlot, TimetableConflict, DayOfWeek } from '@/types/school';
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
  const [classes, _setClasses] = useState<SchoolClass[]>(() => loadLS('tt_classes', generateDefaultClasses()));
  const [timetable, setTimetable] = useState<Timetable | null>(() => loadLS<Timetable | null>('tt_timetable', null));

  const setConfig = (v: SchoolConfig) => { _setConfig(v); try { localStorage.setItem('tt_config', JSON.stringify(v)); } catch {} };
  const setSubjects = (v: Subject[]) => { _setSubjects(v); try { localStorage.setItem('tt_subjects', JSON.stringify(v)); } catch {} };
  const setTeachers = (v: Teacher[]) => { _setTeachers(v); try { localStorage.setItem('tt_teachers', JSON.stringify(v)); } catch {} };
  const setClasses = (v: SchoolClass[]) => { _setClasses(v); try { localStorage.setItem('tt_classes', JSON.stringify(v)); } catch {} };

  // Strict sync: each class's subjectIds = exactly the subjects that have a teacher
  // registered to teach that class. Subjects with no assigned teacher are removed.
  useEffect(() => {
    const STREAM_ALIASES: Record<string, string> = {
      gold: 'G1', silver: 'G2', bronze: 'G22', platinum: 'Blue',
    };
    const canonicalClassId = (raw: string): string => {
      if (!raw) return raw;
      const m = String(raw).trim().match(/^(\d+)\s*(.+)$/);
      if (!m) return raw;
      const canonical = STREAM_ALIASES[m[2].trim().toLowerCase()] || m[2].trim();
      return `${m[1]}${canonical}`;
    };
    let changed = false;
    const next = classes.map(c => {
      const fromTeachers = new Set<string>();
      teachers.forEach(t => {
        t.assignments.forEach(a => {
          if (a.classIds.some(cid => cid === c.id || canonicalClassId(cid) === c.id)
              && subjects.some(s => s.id === a.subjectId)) {
            fromTeachers.add(a.subjectId);
          }
        });
      });
      const replaced = [...fromTeachers];
      const same = replaced.length === c.subjectIds.length && replaced.every(id => c.subjectIds.includes(id));
      if (same) return c;
      changed = true;
      return { ...c, subjectIds: replaced };
    });
    if (changed) {
      _setClasses(next);
      try { localStorage.setItem('tt_classes', JSON.stringify(next)); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teachers, subjects]);

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

    const totalSlots = config.periodsPerDay + 2;
    const breakSlot = config.morningBreakAfterPeriod + 1;
    const lunchSlot = config.lunchAfterPeriod + 2;

    // Core/compulsory subjects should NOT be auto-doubled — they should appear as
    // single periods spread across days. Only heavy electives qualify for doubles.
    const doubleEligible = new Set(subjects.filter(s => s.periodsPerWeek >= 5 && !s.isCompulsory).map(s => s.id));
    const classSubjectDayDoubled: Record<string, boolean> = {};
    // All compulsory (core) subjects should appear EVERY day for each class.
    const dailySubjectIds = new Set(subjects.filter(s => s.isCompulsory).map(s => s.id));
    const classSubjectDay: Record<string, Set<string>> = {};
    const classSubjectDayCount: Record<string, number> = {};
    const classSubjectDaySection: Record<string, Set<string>> = {};
    const classSubjectWeekDays: Record<string, Set<string>> = {};
    const classSubjectLastSlot: Record<string, number> = {};

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

    // Auto-derive each class's subjects from teacher assignments.
    // A class only gets a subject scheduled if at least one teacher is assigned to teach
    // that subject to that class. Falls back to the class's configured subjectIds when no
    // teacher assignments exist for the class (keeps legacy behavior).
    const classSubjectIds: Record<string, string[]> = {};
    classes.forEach(c => {
      const fromTeachers = new Set<string>();
      teachers.forEach(t => {
        t.assignments.forEach(a => {
          if (a.classIds.some(cid => matchesClass(cid, c.id)) && subjects.some(s => s.id === a.subjectId)) {
            fromTeachers.add(a.subjectId);
          }
        });
      });
      classSubjectIds[c.id] = fromTeachers.size > 0 ? [...fromTeachers] : [...c.subjectIds];
      classSubjectCount[c.id] = {};
      classSubjectIds[c.id].forEach(sId => { classSubjectCount[c.id][sId] = 0; });
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
      const requiredPeriods = subs.reduce((sum, s) => sum + s.periodsPerWeek, 0);
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
      // Group by day and SHUFFLE within each day so frees aren't always last-period.
      // Then round-robin across days so every class spreads its frees evenly across the week.
      const byDay: Record<string, number[]> = {};
      academicPairs.forEach(p => { (byDay[p.day] ||= []).push(p.slot); });
      Object.values(byDay).forEach(arr => {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
      });
      let assigned = 0;
      let round = 0;
      const dayOrder = shuffle(DAYS as unknown as DayOfWeek[]);
      while (assigned < freeNeeded) {
        let placedThisRound = 0;
        for (const day of dayOrder) {
          if (assigned >= freeNeeded) break;
          const arr = byDay[day] || [];
          if (arr.length > round) {
            freeSlots[c.id].add(`${day}-${arr[round]}`);
            assigned++;
            placedThisRound++;
          }
        }
        if (placedThisRound === 0) break;
        round++;
      }
    });

    // Identify auto-combine groups: classes in the same form (Forms 5 & 6 only) that
    // share the SAME teacher for the SAME subject. They will be scheduled together
    // in the same period as a combined lesson.
    // Returns a map: classId -> { subjectId -> { teacherId, groupClassIds[] } }
    const combineGroups: Record<string, Record<string, { teacherId: string; groupClassIds: string[] }>> = {};
    teachers.forEach(t => {
      t.assignments.forEach(a => {
        // Group this teacher's assigned classes by form (only Forms 5 & 6 combine)
        const byForm: Record<number, string[]> = {};
        a.classIds.forEach(rawCid => {
          const cls = classes.find(c => matchesClass(rawCid, c.id));
          if (!cls || (cls.form !== 5 && cls.form !== 6)) return;
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

    const isPreMarkedFree = (classId: string, day: DayOfWeek, slot: number) =>
      freeSlots[classId]?.has(`${day}-${slot}`);

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
      classSubjectDaySection[sectionKey].add(getDaySection(slot));
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
            if (pa.skipTeacherLoad) {
              // Combined sibling — count subject toward this class but don't double-count teacher load
              classSubjectCount[cls.id][pa.subjectId] = (classSubjectCount[cls.id][pa.subjectId] || 0) + 1;
              const cdk = `${cls.id}-${day}`;
              if (!classSubjectDay[cdk]) classSubjectDay[cdk] = new Set();
              classSubjectDay[cdk].add(pa.subjectId);
              classSubjectDayCount[`${cls.id}-${day}-${pa.subjectId}`] = (classSubjectDayCount[`${cls.id}-${day}-${pa.subjectId}`] || 0) + 1;
              const sk = `${cls.id}-${day}-${pa.subjectId}`;
              if (!classSubjectDaySection[sk]) classSubjectDaySection[sk] = new Set();
              classSubjectDaySection[sk].add(getDaySection(slot));
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

          const availableSubjects = shuffle(
            (classSubjectIds[cls.id] || cls.subjectIds)
              .map(sId => subjects.find(s => s.id === sId)!)
              .filter(s => s && (classSubjectCount[cls.id][s.id] || 0) < s.periodsPerWeek)
          )
            .filter(s => {
              const dayCount = classSubjectDayCount[`${cls.id}-${day}-${s.id}`] || 0;
              if (dayCount >= 2) return false;
              if (dayCount === 1) return isConsecutive(cls.id, day, s.id, slot);
              return true;
            })
            .filter(s => {
              if (s.isCompulsory || dailySubjectIds.has(s.id)) return true;
              return !violatesGapRule(cls.id, day, s.id, slot);
            })
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
              const aRemain = a.periodsPerWeek - (classSubjectCount[cls.id][a.id] || 0);
              const bRemain = b.periodsPerWeek - (classSubjectCount[cls.id][b.id] || 0);
              return bRemain - aRemain;
            });

          // Core/compulsory subjects must be done before lunch. After lunch,
          // strip core subjects from candidates; only fall back to them if no
          // electives remain (so we don't leave the slot empty unnecessarily).
          let candidateSubjects = availableSubjects;
          if (currentSection === 'after-lunch') {
            const noCore = availableSubjects.filter(s => !s.isCompulsory);
            if (noCore.length > 0) candidateSubjects = noCore;
          }

          let assigned = false;
          for (const subject of candidateSubjects) {
            const availableTeachers = teachers.filter(t => {
              const hasAssignment = t.assignments.some(a => a.subjectId === subject.id && a.classIds.some(cid => matchesClass(cid, cls.id)));
              return hasAssignment && (teacherLoad[t.id] || 0) < t.maxPeriodsPerWeek && !teacherSchedule[t.id]?.[`${day}-${slot}`];
            });

            if (availableTeachers.length > 0) {
              const teacher = availableTeachers.sort((a, b) => (teacherLoad[a.id] || 0) - (teacherLoad[b.id] || 0))[0];

              // Auto-combine: if this class is in a combine-group for this subject with this
              // teacher, schedule all sibling classes in the same period as a combined lesson.
              const grp = combineGroups[cls.id]?.[subject.id];
              const groupMembers = (grp && grp.teacherId === teacher.id)
                ? grp.groupClassIds.filter(cid => {
                    if (cid === cls.id) return true;
                    if (preAssigned[`${cid}-${day}-${slot}`]) return false;
                    if (isPreMarkedFree(cid, day, slot)) return false;
                    if ((classSubjectCount[cid]?.[subject.id] || 0) >= subject.periodsPerWeek) return false;
                    const dayCount = classSubjectDayCount[`${cid}-${day}-${subject.id}`] || 0;
                    if (dayCount >= 2) return false;
                    return (classSubjectIds[cid] || []).includes(subject.id);
                  })
                : [cls.id];

              const others = groupMembers.filter(id => id !== cls.id);
              slots.push({ id: v4(), day, period: slot, classId: cls.id, subjectId: subject.id, teacherId: teacher.id, type: 'lesson', combinedClassIds: others });
              recordSubjectSlot(cls.id, day, subject.id, slot, teacher.id, teacher);

              // Pre-assign sibling classes for this same period (so the outer per-class loop
              // for this slot will emit them as combined). Their teacherLoad is NOT incremented
              // again since the teacher physically teaches one combined session.
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

              const nextSlot = slot + 1;
              const doubleKey = `${cls.id}-${subject.id}-${day}`;
              const alreadyTodayCount = classSubjectDayCount[`${cls.id}-${day}-${subject.id}`] || 0;
              if (
                doubleEligible.has(subject.id) && !classSubjectDayDoubled[doubleKey] &&
                alreadyTodayCount < 2 && nextSlot <= totalSlots &&
                !isNonAcademic(day, nextSlot) && !preAssigned[`${cls.id}-${day}-${nextSlot}`] &&
                (classSubjectCount[cls.id][subject.id] || 0) < subject.periodsPerWeek &&
                !teacherSchedule[teacher.id]?.[`${day}-${nextSlot}`] &&
                (teacherLoad[teacher.id] || 0) < teacher.maxPeriodsPerWeek
              ) {
                preAssigned[`${cls.id}-${day}-${nextSlot}`] = { subjectId: subject.id, teacherId: teacher.id, combinedClassIds: others };
                // Also pre-assign double for sibling combined classes
                others.forEach(cid => {
                  if (!preAssigned[`${cid}-${day}-${nextSlot}`] &&
                      (classSubjectCount[cid]?.[subject.id] || 0) < subject.periodsPerWeek) {
                    const otherCombined = [cls.id, ...others.filter(o => o !== cid)];
                    preAssigned[`${cid}-${day}-${nextSlot}`] = {
                      subjectId: subject.id,
                      teacherId: teacher.id,
                      combinedClassIds: otherCombined,
                      skipTeacherLoad: true,
                    };
                  }
                });
                if (!teacherSchedule[teacher.id]) teacherSchedule[teacher.id] = {};
                teacherSchedule[teacher.id][`${day}-${nextSlot}`] = cls.id;
                classSubjectDayDoubled[doubleKey] = true;
              }
              break;
            }
          }

          if (!assigned && candidateSubjects.length > 0) {
            const subject = candidateSubjects[0];
            slots.push({ id: v4(), day, period: slot, classId: cls.id, subjectId: subject.id, type: 'lesson' });
            recordSubjectSlot(cls.id, day, subject.id, slot);
            assigned = true;
          }
          if (!assigned) {
            slots.push({ id: v4(), day, period: slot, classId: cls.id, type: 'lesson' });
          }
        }
      }
    }

    const newTimetable: Timetable = { id: v4(), slots, conflicts: [], generatedAt: new Date().toISOString() };
    newTimetable.conflicts = detectConflicts(slots);
    setTimetable(newTimetable);
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
    setTimetable({ ...timetable, slots: newSlots, conflicts: detectConflicts(newSlots) });
  }, [timetable, teachers]);

  return (
    <TimetableContext.Provider value={{
      config, setConfig, subjects, setSubjects, teachers, setTeachers,
      classes, setClasses, timetable, generateTimetable, updateSlot,
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
