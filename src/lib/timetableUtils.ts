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
