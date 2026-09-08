import { Subject } from '@/types/school';

/**
 * Format a subject name for display, appending "A Level" when the subject
 * is an A-level subject. A-level detection uses the code suffix "A"
 * (e.g. CHEA, MATA) or the supplied class form (5/6) as a fallback.
 */
export function formatSubjectName(subject: Subject | undefined, classForm?: number): string {
  if (!subject) return '';
  const code = (subject.code || '').trim().toUpperCase();
  const isALevelByCode = code.length > 1 && code.endsWith('A');
  const isALevelByForm = classForm === 5 || classForm === 6;
  const isALevelOnly = subject.forms.length > 0 && subject.forms.every(f => f === 5 || f === 6);
  const isALevel = isALevelByCode || isALevelByForm || isALevelOnly;
  if (!isALevel) return subject.name;
  if (/\ba\s*level\b/i.test(subject.name)) return subject.name;
  return `${subject.name} A Level`;
}

/**
 * Format a pair of subject names for display in combined/parallel slots.
 */
export function formatPairedSubjectNames(
  a: Subject | undefined,
  b: Subject | undefined,
  classForm?: number,
  separator = ' / '
): string {
  if (!a && !b) return '';
  if (!b) return formatSubjectName(a, classForm);
  if (!a) return formatSubjectName(b, classForm);
  return `${formatSubjectName(a, classForm)}${separator}${formatSubjectName(b, classForm)}`;
}

/* ------------------------------------------------------------------ *
 * A-Level stream rules (shared by the generator and the slot editor)
 * ------------------------------------------------------------------ */

const normKey = (v: string) => v.toUpperCase().replace(/&/g, 'AND').replace(/[^A-Z0-9]+/g, '');
const stripA = (v: string) => {
  const n = normKey(v);
  return n.endsWith('A') && n.length > 1 ? n.slice(0, -1) : n;
};

const SCIENCES_KEYS = new Set(['MATH','MATHS','MATHEMATICS','PHY','PHYSICS','CHE','CHEM','CHEMISTRY','BIO','BIOLOGY','COMP','COMPUTING','COMPUTERSCIENCE','CS','GEO','GEOG','GEOGRAPHY']);
const COMMERCIALS_KEYS = new Set(['MATH','MATHS','MATHEMATICS','ACC','ACCT','ACCOUNTING','ACCOUNTS','BS','BUS','BUSINESS','BUSINESSSTUDIES','ECO','ECON','ECONOMICS','COMP','COMPUTING','COMPUTERSCIENCE','CS','GEO','GEOG','GEOGRAPHY']);
// HARD RULE: Arts does NOT do Geography at A-level.
const ARTS_KEYS = new Set(['LIT','LITERATURE','LITERATUREINENGLISH','ENGLISHLITERATURE','HIS','HIST','HISTORY','SHO','SHON','SHONA','NDE','NDEBELE','BIB','BIBLE','BIBLEKNOWLEDGE','BIBLICALSTUDIES','RS','RE','REL','RELIGION','RELIGIOUSSTUDIES','DIVINITY','HER','HEL','HERITAGE','HERITAGESTUDIES','FRS','FRE','FRENCH']);
const EXCLUDED_KEYS = new Set(['ENG','ENGLISH','ENGLISHLANGUAGE']);
const COMPUTER_KEYS = new Set(['COMP','COMPUTING','COMPUTERSCIENCE','CS']);
const GEO_KEYS = new Set(['GEO','GEOG','GEOGRAPHY']);

/**
 * Hard-coded A-level rules that override any admin configuration:
 * - Computer Science is taken in Form 5 only (never Form 6, never Arts).
 * - Geography is never taken by an Arts stream.
 */
export function isHardBlockedALevel(subject: Subject, area?: string, form?: number): boolean {
  const keys = [stripA(subject.code || ''), stripA(subject.name || ''), normKey(subject.code || ''), normKey(subject.name || '')];
  const isComp = keys.some(k => COMPUTER_KEYS.has(k));
  const isGeo = keys.some(k => GEO_KEYS.has(k));
  if (isComp && (form === 6 || area === 'Arts')) return true;
  if (isGeo && area === 'Arts') return true;
  return false;
}


/** Infer a class learning area from its explicit field or its stream label. */
export function resolveLearningArea(cls: { learningArea?: string; stream?: string } | undefined) {
  if (!cls) return undefined;
  if (cls.learningArea) return cls.learningArea as 'Sciences' | 'Commercials' | 'Arts';
  const s = normKey(cls.stream || '');
  if (!s) return undefined;
  if (s.startsWith('SCI')) return 'Sciences' as const;
  if (s.startsWith('COM')) return 'Commercials' as const;
  if (s.startsWith('ART')) return 'Arts' as const;
  return undefined;
}

/** True when the subject may be taught in the given A-level learning area. */
export function isSubjectAllowedInALevelArea(subject: Subject, area?: string, form?: number): boolean {
  const code = (subject.code || '').trim().toUpperCase();
  if (!code.endsWith('A')) return false;
  if (EXCLUDED_KEYS.has(normKey(subject.code || '')) || EXCLUDED_KEYS.has(normKey(subject.name || ''))) return false;
  if (isHardBlockedALevel(subject, area, form)) return false;
  if (!area) return true;
  const match = (keys: Set<string>) =>
    keys.has(stripA(subject.code || '')) || keys.has(stripA(subject.name || '')) ||
    keys.has(normKey(subject.code || '')) || keys.has(normKey(subject.name || ''));
  const areas: string[] = [];
  if (match(SCIENCES_KEYS)) areas.push('Sciences');
  if (match(COMMERCIALS_KEYS)) areas.push('Commercials');
  if (match(ARTS_KEYS)) areas.push('Arts');
  if (!areas.length) {
    if (subject.learningAreas?.length) return subject.learningAreas.includes(area as never);
    return false;
  }
  return areas.includes(area);
}
