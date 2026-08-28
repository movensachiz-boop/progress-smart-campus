export interface DoubleSettings {
  /** Force every A-level (Form 5/6) lesson to be a double period. */
  aLevelDoubles: boolean;
  /** Max number of days per week a given A-level subject may have a double (0 = unlimited). */
  aLevelDoubleDays: number;
  /** Allow O-level (Forms 1-4) subjects to have double periods. */
  oLevelDoubles: boolean;
  /** Max number of days per week a given O-level subject may have a double (0 = unlimited). */
  oLevelDoubleDays: number;
}

export const DEFAULT_DOUBLE_SETTINGS: DoubleSettings = {
  aLevelDoubles: true,
  aLevelDoubleDays: 0,
  oLevelDoubles: true,
  oLevelDoubleDays: 2,
};

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
