export interface DoubleSettings {
  /** Force every A-level (Form 5/6) lesson to be a double period. */
  aLevelDoubles: boolean;
  /** Max number of days per week a given A-level subject may have a double (0 = unlimited). */
  aLevelDoubleDays: number;
  /** Allow O-level (Forms 1-4) subjects to have double periods. */
  oLevelDoubles: boolean;
  /** Max number of days per week a given O-level subject may have a double (0 = unlimited). */
  oLevelDoubleDays: number;
  /** Specific subject ids that must always be scheduled as doubles. */
  subjectDoubleIds: string[];
  /** Optional per-subject cap on double days per week (0/absent = use level default). */
  subjectDoubleDays: Record<string, number>;
  /** How many consecutive periods make one A-level "double" block (2-4). */
  aLevelDoubleLength: number;
  /** How many consecutive periods make one O-level "double" block (2-4). */
  oLevelDoubleLength: number;
  /** Optional per-subject block length (0/absent = use level default). */
  subjectDoubleLength: Record<string, number>;
  /**
   * Per-class / per-form double period rules.
   * Key is either a class id (e.g. "4G1") or a form key (e.g. "form:4").
   * A class rule wins over a form rule, which wins over the level defaults.
   */
  classRules: Record<string, ClassDoubleRule>;
}

export interface ClassDoubleRule {
  /** Turn doubles on/off for this class or form. */
  enabled: boolean;
  /** Max doubles per week per subject (0 = unlimited). */
  maxPerWeek: number;
  /** Periods per double block (0 = use level default). */
  length: number;
  /** If non-empty, only these subjects are doubled in this class/form. */
  subjectIds: string[];
}

export const DEFAULT_CLASS_DOUBLE_RULE: ClassDoubleRule = {
  enabled: true,
  maxPerWeek: 0,
  length: 0,
  subjectIds: [],
};

export const DEFAULT_DOUBLE_SETTINGS: DoubleSettings = {
  aLevelDoubles: true,
  aLevelDoubleDays: 0,
  oLevelDoubles: true,
  oLevelDoubleDays: 2,
  subjectDoubleIds: [],
  subjectDoubleDays: {},
  aLevelDoubleLength: 2,
  oLevelDoubleLength: 2,
  subjectDoubleLength: {},
  classRules: {},
};

export const formRuleKey = (form: number | string) => `form:${form}`;

/** Resolve the effective rule for a class (class rule > form rule > none). */
export function resolveClassRule(
  s: DoubleSettings,
  classId?: string,
  form?: number,
): ClassDoubleRule | undefined {
  const rules = s.classRules || {};
  if (classId && rules[classId]) return { ...DEFAULT_CLASS_DOUBLE_RULE, ...rules[classId] };
  if (form != null && rules[formRuleKey(form)]) return { ...DEFAULT_CLASS_DOUBLE_RULE, ...rules[formRuleKey(form)] };
  return undefined;
}




const KEY = 'tt_double_settings';

export function loadDoubleSettings(): DoubleSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_DOUBLE_SETTINGS };
    return { ...DEFAULT_DOUBLE_SETTINGS, ...(JSON.parse(raw) as Partial<DoubleSettings>) };
  } catch {
    return { ...DEFAULT_DOUBLE_SETTINGS };
  }
}

export function saveDoubleSettings(s: DoubleSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
