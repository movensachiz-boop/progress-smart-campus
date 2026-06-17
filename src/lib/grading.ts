// Grade & point computation helpers
//
// Unified PCC grading scale (Cambridge A-Level & IGCSE O-Level):
//   A* 90-100 → 5 pts (A-level) / O-level A*
//   A  80-89  → 5 pts            / O-level A
//   B  70-79  → 4 pts            / O-level B
//   C  60-69  → 3 pts            / O-level C
//   D  50-59  → 2 pts            / O-level D
//   E  40-49  → 1 pt             / O-level E
//   F  0-39 (A-level) → 0 pts
// O-level only (extends below F):
//   F  30-39, G 20-29, U 0-19
// Shona (SHO) and Heritage (HERI) ALWAYS use ZIMSEC O-level bands regardless of form.

export type Level = "olevel" | "alevel";

export const formToLevel = (form: number | string | null | undefined): Level => {
  const f = typeof form === "string" ? parseInt(form, 10) : form ?? 0;
  return f >= 5 ? "alevel" : "olevel";
};

// Subjects that always grade on the ZIMSEC O-level scale
const ZIMSEC_OLEVEL_SUBJECTS = new Set(["SHO", "HERI"]);

const effectiveLevel = (level: Level, subjectCode?: string | null): Level => {
  if (subjectCode && ZIMSEC_OLEVEL_SUBJECTS.has(subjectCode.toUpperCase())) return "olevel";
  return level;
};

export const computeGrade = (
  mark: number | null | undefined,
  level: Level,
  subjectCode?: string | null,
): string => {
  if (mark == null || isNaN(mark as number)) return "";
  const m = Number(mark);
  const lvl = effectiveLevel(level, subjectCode);

  if (m >= 90) return "A*";
  if (m >= 80) return "A";
  if (m >= 70) return "B";
  if (m >= 60) return "C";
  if (m >= 50) return "D";
  if (m >= 40) return "E";

  if (lvl === "alevel") return "F";

  // O-level extended bands
  if (m >= 30) return "F";
  if (m >= 20) return "G";
  return "U";
};

export const gradeToPoints = (grade: string, level: Level): number => {
  if (level !== "alevel") return 0;
  switch (grade) {
    case "A*": return 5;
    case "A":  return 5;
    case "B":  return 4;
    case "C":  return 3;
    case "D":  return 2;
    case "E":  return 1;
    default:   return 0; // F / U / blank
  }
};

export const computePoints = (
  mark: number | null | undefined,
  level: Level,
  subjectCode?: string | null,
): number => {
  // Shona/Heritage are O-level subjects → 0 A-level points
  if (subjectCode && ZIMSEC_OLEVEL_SUBJECTS.has(subjectCode.toUpperCase())) return 0;
  return gradeToPoints(computeGrade(mark, level, subjectCode), level);
};

// A "pass" at PCC = C or above (mark ≥ 60). A/B/C are passes; D and below are fails.
export const isPass = (mark: number | null | undefined): boolean => {
  if (mark == null || isNaN(mark as number)) return false;
  return Number(mark) >= 60;
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
