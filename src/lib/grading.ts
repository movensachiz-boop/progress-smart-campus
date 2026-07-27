// Grade & point computation helpers
//
// UNIFIED PCC grading scale (applied to ALL subjects and ALL forms):
//   A+ 90-100 → 5 pts
//   A  80-89  → 5 pts
//   B  70-79  → 4 pts
//   C  60-69  → 3 pts
//   D  50-59  → 2 pts
//   E  40-49  → 1 pt
//   U  0-39   → 0 pts

export type Level = "olevel" | "alevel";

export const formToLevel = (form: number | string | null | undefined): Level => {
  const f = typeof form === "string" ? parseInt(form, 10) : form ?? 0;
  return f >= 5 ? "alevel" : "olevel";
};

// Subjects that use a distinct grading scale (Shona & Heritage):
//   A 70-100, B 60-69, C 50-59, D 45-49, E 40-44, U 0-39
const CUSTOM_SCALE_CODES = new Set(["SHO", "HERI"]);

export const computeGrade = (
  mark: number | null | undefined,
  _level?: Level,
  subjectCode?: string | null,
): string => {
  if (mark == null || isNaN(mark as number)) return "";
  const m = Number(mark);
  const code = (subjectCode || "").toUpperCase();
  if (CUSTOM_SCALE_CODES.has(code)) {
    if (m >= 70) return "A";
    if (m >= 60) return "B";
    if (m >= 50) return "C";
    if (m >= 45) return "D";
    if (m >= 40) return "E";
    return "U";
  }
  if (m >= 90) return "A+";
  if (m >= 80) return "A";
  if (m >= 70) return "B";
  if (m >= 60) return "C";
  if (m >= 50) return "D";
  if (m >= 40) return "E";
  return "U";
};


export const gradeToPoints = (grade: string, _level?: Level): number => {
  switch (grade) {
    case "A+": return 5;
    case "A":  return 5;
    case "B":  return 4;
    case "C":  return 3;
    case "D":  return 2;
    case "E":  return 1;
    default:   return 0;
  }
};

export const computePoints = (
  mark: number | null | undefined,
  level?: Level,
  subjectCode?: string | null,
): number => {
  return gradeToPoints(computeGrade(mark, level, subjectCode), level);
};

// A pass = E or better (mark ≥ 40) under the unified scale.
export const isPass = (
  mark: number | null | undefined,
  _level: Level = "olevel",
  _subjectCode?: string | null,
): boolean => {
  if (mark == null || isNaN(mark as number)) return false;
  return Number(mark) >= 40;
};



// IGCSE / O-level performance comments per mark band
export const getMarkComment = (mark: number | null | undefined): string => {
  if (mark == null || isNaN(mark as number)) return "";
  const m = Number(mark);
  if (m >= 90) return "Exceptional Performance";
  if (m >= 80) return "Excellent Performance";
  if (m >= 70) return "Good Performance";
  if (m >= 60) return "Satisfactory Performance";
  if (m >= 40) return "Sufficient Performance";
  if (m >= 30) return "Poor Performance";
  if (m >= 20) return "Very Poor Performance";
  return "Ungraded";
};

// Canonical subject codes used on mark sheets
export const SUBJECT_CODES: Record<string, string> = {
  LIT: "Literature in English",
  RS: "Religious Studies",
  HIS: "History",
  CSC: "Computer Science",
  "C/SC": "Computer Science",
  BIO: "Biology",
  CHE: "Chemistry",
  MAT: "Mathematics",
  ACC: "Accounts",
  PHY: "Physics",
  GEO: "Geography",
  BUS: "Business Studies",
  ECO: "Economics",
  ENG: "English Language",
  SHO: "Shona",
  AGR: "Agriculture",
  FN: "Food & Nutrition",
  ART: "Art",
  FRE: "French",
  HERI: "Heritage",
  BS: "Business Studies",
  SCI: "Science",
  MUS: "Music",
  ICT: "ICT",
  COMB: "Combined Science",
};

export const normalizeSubjectCode = (raw: string): string => {
  const c = raw.trim().toUpperCase().replace(/\s+/g, "");
  const stripped = c.replace(/[\/\.\-]/g, "");
  const map: Record<string, string> = {
    CSC: "CSC", CCS: "CSC", COMP: "CSC", COMPSC: "CSC", COMPUTER: "CSC", COMPSCI: "CSC", CS: "CSC", SCS: "CSC",
    RS: "RS", RE: "RS", RELIGIOUS: "RS", RELIGION: "RS",
    LIT: "LIT", LITERATURE: "LIT",
    BIO: "BIO", BIOLOGY: "BIO",
    CHE: "CHE", CHEM: "CHE", CHEMISTRY: "CHE",
    MAT: "MAT", MATH: "MAT", MATHS: "MAT", MATHEMATICS: "MAT",
    ACC: "ACC", ACCOUNTS: "ACC", ACCOUNTING: "ACC",
    PHY: "PHY", PHYSICS: "PHY",
    GEO: "GEO", GEOGRAPHY: "GEO",
    BUS: "BUS", BUSINESS: "BUS",
    ECO: "ECO", ECONOMICS: "ECO",
    ENG: "ENG", ENGLISH: "ENG",
    SHO: "SHO", SHONA: "SHO",
    HIS: "HIS", HISTORY: "HIS",
    AGR: "AGR", AGRIC: "AGR", AGRICULTURE: "AGR", AGRI: "AGR",
    FN: "FN", FOOD: "FN", FOODNUTRITION: "FN",
    ART: "ART",
    FRE: "FRE", FRENCH: "FRE",
    HERI: "HERI", HERITAGE: "HERI",
    BS: "BS", BUSINESSSTUDIES: "BS",
    SCI: "SCI", SCIENCE: "SCI",
    MUS: "MUS", MUSIC: "MUS",
    ICT: "ICT", INFORMATION: "ICT", INFORMATIONTECHNOLOGY: "ICT", COMPUTERSTUDIES: "ICT",
    COMB: "COMB", COMBINED: "COMB", COMBINEDSCIENCE: "COMB", CLS: "COMB",
  };
  return map[stripped] || stripped;
};
