export type FormLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type LearningArea = 'Sciences' | 'Commercials' | 'Arts';
export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';

export interface SchoolConfig {
  schoolName: string;
  startTime: string;
  endTime: string;
  periodDuration: number;
  morningBreakAfterPeriod: number;
  morningBreakDuration: number;
  lunchAfterPeriod: number;
  lunchDuration: number;
  sportsDays: DayOfWeek[];
  sportsStartPeriod: number;
  periodsPerDay: number;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  forms: FormLevel[];
  learningAreas?: LearningArea[];
  periodsPerWeek: number;
  isCompulsory: boolean;
}

export interface TeacherClassAssignment {
  subjectId: string;
  classIds: string[];
}

export interface Teacher {
  id: string;
  name: string;
  title: string;
  subjectIds: string[];
  assignments: TeacherClassAssignment[];
  forms: FormLevel[];
  maxPeriodsPerWeek: number;
}

export interface SchoolClass {
  id: string;
  form: FormLevel;
  stream: string;
  learningArea?: LearningArea;
  subjectIds: string[];
}

export interface TimetableSlot {
  id: string;
  day: DayOfWeek;
  period: number;
  classId: string;
  subjectId?: string;
  teacherId?: string;
  type: 'lesson' | 'break' | 'lunch' | 'sports';
  combinedClassIds?: string[]; // other class IDs taught jointly in this period
}

export interface TimetableConflict {
  type: 'teacher-clash' | 'class-clash' | 'subject-repeat' | 'load-exceeded';
  message: string;
  slots: string[];
}

export interface Timetable {
  id: string;
  slots: TimetableSlot[];
  conflicts: TimetableConflict[];
  generatedAt: string;
}
