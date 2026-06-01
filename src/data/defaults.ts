import { SchoolConfig, Subject, SchoolClass, DayOfWeek, FormLevel, LearningArea } from '@/types/school';

export const DAYS: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export const defaultConfig: SchoolConfig = {
  schoolName: 'Progress Christian College',
  startTime: '07:30',
  endTime: '15:30',
  periodDuration: 40,
  morningBreakAfterPeriod: 4,
  morningBreakDuration: 15,
  lunchAfterPeriod: 8,
  lunchDuration: 60,
  sportsDays: ['Wednesday'],
  sportsStartPeriod: 7,
  periodsPerDay: 11,
};

export const defaultSubjects: Subject[] = [
  { id: 's1', name: 'Mathematics', code: 'MATH', forms: [1,2,3,4,5,6], periodsPerWeek: 6, isCompulsory: true },
  { id: 's2', name: 'English', code: 'ENG', forms: [1,2,3,4,5,6], periodsPerWeek: 6, isCompulsory: true },
  { id: 's3', name: 'Literature', code: 'LIT', forms: [1,2,3,4,5,6], periodsPerWeek: 4, isCompulsory: false, learningAreas: ['Arts'] },
  { id: 's4', name: 'History', code: 'HIS', forms: [1,2,3,4,5,6], periodsPerWeek: 3, isCompulsory: false, learningAreas: ['Arts'] },
  { id: 's5', name: 'Shona', code: 'SHO', forms: [1,2,3,4], periodsPerWeek: 4, isCompulsory: true },
  { id: 's6', name: 'Ndebele', code: 'NDE', forms: [1,2,3,4], periodsPerWeek: 4, isCompulsory: false },
  { id: 's7', name: 'Physics', code: 'PHY', forms: [3,4,5,6], periodsPerWeek: 5, isCompulsory: false, learningAreas: ['Sciences'] },
  { id: 's8', name: 'Chemistry', code: 'CHE', forms: [3,4,5,6], periodsPerWeek: 5, isCompulsory: false, learningAreas: ['Sciences'] },
  { id: 's9', name: 'Biology', code: 'BIO', forms: [1,2,3,4,5,6], periodsPerWeek: 5, isCompulsory: false, learningAreas: ['Sciences'] },
  { id: 's10', name: 'Crop Science', code: 'CROP', forms: [1,2,3,4], periodsPerWeek: 3, isCompulsory: false },
  { id: 's11', name: 'Computer Science', code: 'CS', forms: [1,2,3,4,5,6], periodsPerWeek: 3, isCompulsory: false },
  { id: 's12', name: 'Agriculture', code: 'AGR', forms: [1,2,3,4], periodsPerWeek: 3, isCompulsory: false },
  { id: 's13', name: 'Accounting', code: 'ACC', forms: [1,2,3,4,5,6], periodsPerWeek: 5, isCompulsory: false, learningAreas: ['Commercials'] },
  { id: 's14', name: 'Business Studies', code: 'BUS', forms: [1,2,3,4,5,6], periodsPerWeek: 5, isCompulsory: false, learningAreas: ['Commercials'] },
  { id: 's15', name: 'Economics', code: 'ECO', forms: [3,4,5,6], periodsPerWeek: 5, isCompulsory: false, learningAreas: ['Commercials'] },
  { id: 's16', name: 'Geography', code: 'GEO', forms: [1,2,3,4,5,6], periodsPerWeek: 3, isCompulsory: false },
  { id: 's17', name: 'Guidance & Counselling', code: 'G&C', forms: [1,2,3,4,5,6], periodsPerWeek: 1, isCompulsory: true },
  { id: 's18', name: 'Heritage Studies', code: 'HEL', forms: [1,2,3,4,5,6], periodsPerWeek: 5, isCompulsory: false, learningAreas: ['Arts'] },
  { id: 's19', name: 'French', code: 'FRS', forms: [1,2,3,4,5,6], periodsPerWeek: 6, isCompulsory: false, learningAreas: ['Arts'] },
  { id: 's20', name: 'Combined Science', code: 'CLS', forms: [1,2,3,4], periodsPerWeek: 6, isCompulsory: true },
];

export function generateDefaultClasses(): SchoolClass[] {
  const classes: SchoolClass[] = [];
  const streams = ['G1', 'G2', 'G22', 'Blue'];

  for (let form = 1; form <= 4; form++) {
    const allFormSubjects = defaultSubjects
      .filter(s => s.forms.includes(form as FormLevel))
      .map(s => s.id);
    for (const stream of streams) {
      classes.push({
        id: `${form}${stream}`,
        form: form as FormLevel,
        stream,
        subjectIds: allFormSubjects,
      });
    }
  }

  const learningAreas: LearningArea[] = ['Sciences', 'Commercials', 'Arts'];
  for (let form = 5; form <= 6; form++) {
    for (const area of learningAreas) {
      const areaSubjects = defaultSubjects
        .filter(s => s.forms.includes(form as FormLevel) && s.learningAreas?.includes(area))
        .map(s => s.id);
      const compulsory = defaultSubjects
        .filter(s => s.forms.includes(form as FormLevel) && s.isCompulsory)
        .map(s => s.id);
      classes.push({
        id: `${form}${area.charAt(0)}`,
        form: form as FormLevel,
        stream: area,
        learningArea: area,
        subjectIds: [...new Set([...compulsory, ...areaSubjects])],
      });
    }
  }

  return classes;
}

export function generateDefaultTeachers(): import('@/types/school').Teacher[] {
  return [
    { id: 't1', name: 'Mr. Moyo', title: 'Mr.', subjectIds: ['s1'], assignments: [{ subjectId: 's1', classIds: ['1G1','1G2','2G1','2G2'] }], forms: [1,2,3,4], maxPeriodsPerWeek: 30 },
    { id: 't6', name: 'Mrs. Mapfumo', title: 'Mrs.', subjectIds: ['s1'], assignments: [{ subjectId: 's1', classIds: ['1G22','1Blue','2G22','2Blue'] }], forms: [1,2,3,4], maxPeriodsPerWeek: 30 },
    { id: 't17', name: 'Mr. Zvobgo', title: 'Mr.', subjectIds: ['s1'], assignments: [{ subjectId: 's1', classIds: ['3G1','3G2','3G22','3Blue','4G1','4G2','4G22','4Blue'] }], forms: [3,4,5,6], maxPeriodsPerWeek: 30 },
    { id: 't2', name: 'Mrs. Ndlovu', title: 'Mrs.', subjectIds: ['s2'], assignments: [{ subjectId: 's2', classIds: ['1G1','1G2','1G22','1Blue'] }], forms: [1,2,3,4], maxPeriodsPerWeek: 30 },
    { id: 't18', name: 'Mr. Banda', title: 'Mr.', subjectIds: ['s2'], assignments: [{ subjectId: 's2', classIds: ['2G1','2G2','2G22','2Blue'] }], forms: [1,2,3,4], maxPeriodsPerWeek: 30 },
    { id: 't19', name: 'Mrs. Tshuma', title: 'Mrs.', subjectIds: ['s2'], assignments: [{ subjectId: 's2', classIds: ['3G1','3G2','3G22','3Blue','4G1','4G2','4G22','4Blue'] }], forms: [3,4,5,6], maxPeriodsPerWeek: 30 },
    { id: 't20', name: 'Ms. Hungwe', title: 'Ms.', subjectIds: ['s3'], assignments: [{ subjectId: 's3', classIds: ['1G1','1G2','1G22','1Blue','2G1','2G2','2G22','2Blue'] }], forms: [1,2,3,4,5,6], maxPeriodsPerWeek: 28 },
    { id: 't4', name: 'Ms. Sibanda', title: 'Ms.', subjectIds: ['s4','s16'], assignments: [{ subjectId: 's4', classIds: ['1G1','1G2','1G22','1Blue','2G1','2G2','2G22','2Blue'] }, { subjectId: 's16', classIds: ['1G1','1G2','1G22','1Blue'] }], forms: [1,2,3,4], maxPeriodsPerWeek: 30 },
    { id: 't21', name: 'Mr. Chirwa', title: 'Mr.', subjectIds: ['s4'], assignments: [{ subjectId: 's4', classIds: ['3G1','3G2','3G22','3Blue','4G1','4G2','4G22','4Blue'] }], forms: [3,4,5,6], maxPeriodsPerWeek: 28 },
    { id: 't5', name: 'Mr. Dube', title: 'Mr.', subjectIds: ['s5'], assignments: [{ subjectId: 's5', classIds: ['1G1','1G2','1G22','1Blue','2G1','2G2','2G22','2Blue'] }], forms: [1,2,3,4], maxPeriodsPerWeek: 30 },
    { id: 't22', name: 'Mrs. Mushore', title: 'Mrs.', subjectIds: ['s5'], assignments: [{ subjectId: 's5', classIds: ['3G1','3G2','3G22','3Blue','4G1','4G2','4G22','4Blue'] }], forms: [3,4], maxPeriodsPerWeek: 28 },
    { id: 't23', name: 'Ms. Ncube', title: 'Ms.', subjectIds: ['s6'], assignments: [{ subjectId: 's6', classIds: ['1G1','1G2','1G22','1Blue','2G1','2G2','2G22','2Blue','3G1','3G2','3G22','3Blue','4G1','4G2','4G22','4Blue'] }], forms: [1,2,3,4], maxPeriodsPerWeek: 30 },
    { id: 't7', name: 'Mr. Nyathi', title: 'Mr.', subjectIds: ['s7'], assignments: [{ subjectId: 's7', classIds: ['3G1','3G2','3G22','3Blue','4G1','4G2','4G22','4Blue'] }], forms: [3,4,5,6], maxPeriodsPerWeek: 30 },
    { id: 't8', name: 'Mrs. Gumede', title: 'Mrs.', subjectIds: ['s8'], assignments: [{ subjectId: 's8', classIds: ['3G1','3G2','3G22','3Blue','4G1','4G2','4G22','4Blue'] }], forms: [3,4,5,6], maxPeriodsPerWeek: 30 },
    { id: 't3', name: 'Mr. Chigumba', title: 'Mr.', subjectIds: ['s9'], assignments: [{ subjectId: 's9', classIds: ['1G1','1G2','1G22','1Blue','2G1','2G2','2G22','2Blue'] }], forms: [1,2,3,4], maxPeriodsPerWeek: 30 },
    { id: 't24', name: 'Mrs. Mhlanga', title: 'Mrs.', subjectIds: ['s9'], assignments: [{ subjectId: 's9', classIds: ['3G1','3G2','3G22','3Blue','4G1','4G2','4G22','4Blue'] }], forms: [3,4,5,6], maxPeriodsPerWeek: 30 },
    { id: 't9', name: 'Mr. Mugabe', title: 'Mr.', subjectIds: ['s10'], assignments: [{ subjectId: 's10', classIds: ['1G1','1G2','1G22','1Blue','2G1','2G2','2G22','2Blue','3G1','3G2','3G22','3Blue','4G1','4G2','4G22','4Blue'] }], forms: [1,2,3,4], maxPeriodsPerWeek: 30 },
    { id: 't10', name: 'Ms. Zhou', title: 'Ms.', subjectIds: ['s11'], assignments: [{ subjectId: 's11', classIds: ['1G1','1G2','1G22','1Blue','2G1','2G2','2G22','2Blue','3G1','3G2','3G22','3Blue','4G1','4G2','4G22','4Blue'] }], forms: [1,2,3,4,5,6], maxPeriodsPerWeek: 30 },
    { id: 't11', name: 'Mr. Sithole', title: 'Mr.', subjectIds: ['s12'], assignments: [{ subjectId: 's12', classIds: ['1G1','1G2','1G22','1Blue','2G1','2G2','2G22','2Blue','3G1','3G2','3G22','3Blue','4G1','4G2','4G22','4Blue'] }], forms: [1,2,3,4], maxPeriodsPerWeek: 30 },
    { id: 't12', name: 'Mrs. Pfende', title: 'Mrs.', subjectIds: ['s13'], assignments: [{ subjectId: 's13', classIds: ['3G1','3G2','3G22','3Blue','4G1','4G2','4G22','4Blue'] }], forms: [3,4,5,6], maxPeriodsPerWeek: 30 },
    { id: 't13', name: 'Mr. Makoni', title: 'Mr.', subjectIds: ['s14'], assignments: [{ subjectId: 's14', classIds: ['3G1','3G2','3G22','3Blue','4G1','4G2','4G22','4Blue'] }], forms: [3,4,5,6], maxPeriodsPerWeek: 30 },
    { id: 't14', name: 'Mrs. Chikara', title: 'Mrs.', subjectIds: ['s15'], assignments: [{ subjectId: 's15', classIds: ['3G1','3G2','3G22','3Blue','4G1','4G2','4G22','4Blue'] }], forms: [3,4,5,6], maxPeriodsPerWeek: 30 },
    { id: 't15', name: 'Mr. Madziro', title: 'Mr.', subjectIds: ['s16'], assignments: [{ subjectId: 's16', classIds: ['2G1','2G2','2G22','2Blue','3G1','3G2','3G22','3Blue','4G1','4G2','4G22','4Blue'] }], forms: [1,2,3,4,5,6], maxPeriodsPerWeek: 30 },
    { id: 't16', name: 'Mrs. Taruvinga', title: 'Mrs.', subjectIds: ['s17'], assignments: [{ subjectId: 's17', classIds: ['1G1','1G2','1G22','1Blue','2G1','2G2','2G22','2Blue','3G1','3G2','3G22','3Blue','4G1','4G2','4G22','4Blue'] }], forms: [1,2,3,4,5,6], maxPeriodsPerWeek: 20 },
  ];
}
