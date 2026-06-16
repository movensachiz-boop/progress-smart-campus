// Grade & point computation helpers
// O-level (Form 1-4): A 75+, B 65+, C 50+, D 40+, E 30+, U <30
// A-level (Form 5-6): A 80+, B 70+, C 60+, D 50+, E 40+, U <40 → points A=5 .. E=1 U=0

export type Level = "olevel" | "alevel";

export const formToLevel = (form: number | string | null | undefined): Level => {
  const f = typeof form === "string" ? parseInt(form, 10) : form ?? 0;
  return f >= 5 ? "alevel" : "olevel";
};

export const computeGrade = (mark: number | null | undefined, level: Level): string => {
  if (mark == null || isNaN(mark as number)) return "";
  const m = Number(mark);
  if (level === "alevel") {
    if (m >= 80) return "A";
    if (m >= 70) return "B";
    if (m >= 60) return "C";
    if (m >= 50) return "D";
    if (m >= 40) return "E";
    return "U";
  }
  if (m >= 75) return "A";
  if (m >= 65) return "B";
  if (m >= 50) return "C";
  if (m >= 40) return "D";
  if (m >= 30) return "E";
  return "U";
};

export const gradeToPoints = (grade: string, level: Level): number => {
  if (level !== "alevel") return 0;
  switch (grade) {
    case "A": return 5;
    case "B": return 4;
    case "C": return 3;
    case "D": return 2;
    case "E": return 1;
    default: return 0;
  }
};

export const computePoints = (mark: number | null | undefined, level: Level): number => {
  return gradeToPoints(computeGrade(mark, level), level);
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
  BS: "Building Studies",
  SCI: "Science",
  MUS: "Music",
};

export const normalizeSubjectCode = (raw: string): string => {
  const c = raw.trim().toUpperCase().replace(/\s+/g, "");
  // Strip slashes/dots/dashes for variants like C/SC, R/S, C.S, F-N
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
    BS: "BS", BUILDING: "BS", BUILDINGSTUDIES: "BS",
    SCI: "SCI", SCIENCE: "SCI",
    MUS: "MUS", MUSIC: "MUS",
  };
  return map[stripped] || stripped;
};
