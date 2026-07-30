import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Loader2, Trophy, Medal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTimetable } from "@/context/TimetableContext";
import { useUserRole } from "@/hooks/useUserRole";
import { SUBJECT_CODES, normalizeSubjectCode, formToLevel, computeGrade, isPass } from "@/lib/grading";
import type { Teacher } from "@/types/school";

type Exam = { id: string; name: string; form_levels: number[] };
type Profile = { id: string; first_name: string; last_name: string; form: string | null; stream: string | null };
type Result = { student_profile_id: string; subject_code: string; mark: number | null };

const PASS_COLORS = ["hsl(142,72%,40%)", "hsl(0,72%,51%)"];

const slugifyName = (n: string) =>
  n.toLowerCase().trim().replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "");

const studentClassId = (s: { form: string | null; stream: string | null }): string | null => {
  const fn = Number(s.form);
  if (!fn) return null;
  const stream = (s.stream || "").trim();
  if (!stream) return null;
  if (fn >= 5) return `${fn}${stream.charAt(0).toUpperCase()}`;
  return `${fn}${stream}`;
};

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const PositionsAnalytics = () => {
  const { subjects: ttSubjects, teachers: ttTeachers, classes: ttClasses } = useTimetable();
  const { role, loading: roleLoading } = useUserRole();

  const [userId, setUserId] = useState("");
  const [privileged, setPrivileged] = useState(false);
  const [privLoading, setPrivLoading] = useState(true);
  const [teacherAccount, setTeacherAccount] = useState<Teacher | null>(null);
  const [assignedClasses, setAssignedClasses] = useState<string[]>([]);

  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [students, setStudents] = useState<Profile[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const fullAccess = privileged || role === "admin" || role === "owner" || role === "principal";

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setPrivLoading(false); return; }
      setUserId(user.id);
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const roles = (data || []).map((r: any) => String(r.role));
      setPrivileged(roles.some(r => ["admin", "owner", "principal"].includes(r)));
      setPrivLoading(false);
      const { data: cta } = await (supabase as any).from("class_teacher_assignments")
        .select("class_id").eq("teacher_user_id", user.id);
      setAssignedClasses(((cta || []) as any[]).map(r => r.class_id));
      const local = (user.email || "").split("@")[0]?.toLowerCase();
      const match = ttTeachers.find(t => slugifyName(t.name) === local);
      setTeacherAccount(match || null);
    })();
  }, [ttTeachers]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("exams").select("id, name, form_levels").order("created_at", { ascending: false });
      setExams((data || []) as Exam[]);
    })();
  }, []);

  // Subject codes -> classes this teacher teaches
  const teacherScope = useMemo(() => {
    const codeToClasses = new Map<string, Set<string>>();
    if (!teacherAccount) return codeToClasses;
    for (const a of teacherAccount.assignments || []) {
      const subj = ttSubjects.find(s => s.id === a.subjectId);
      if (!subj) continue;
      const code = normalizeSubjectCode(subj.code || subj.name);
      if (!code) continue;
      const set = codeToClasses.get(code) || new Set<string>();
      (a.classIds || []).forEach(c => set.add(c));
      codeToClasses.set(code, set);
    }
    return codeToClasses;
  }, [teacherAccount, ttSubjects]);

  const classOptions = useMemo(() => {
    if (fullAccess) return Array.from(new Set(ttClasses.map(c => c.id))).sort();
    const set = new Set<string>(assignedClasses);
    teacherScope.forEach(cls => cls.forEach(c => set.add(c)));
    return Array.from(set).sort();
  }, [fullAccess, ttClasses, assignedClasses, teacherScope]);

  const classTeacherClasses = useMemo(
    () => (fullAccess ? classOptions : assignedClasses.slice().sort()),
    [fullAccess, classOptions, assignedClasses]
  );

  const activeExam = exams.find(e => e.id === examId);

  useEffect(() => {
    if (!activeExam || !classId) { setStudents([]); setResults([]); return; }
    (async () => {
      setLoading(true);
      const termId = typeof window !== "undefined" ? localStorage.getItem("pcc.selectedTermId") : null;
      const [{ data: profs }, { data: snaps }, { data: rows }] = await Promise.all([
        supabase.from("profiles").select("id, first_name, last_name, form, stream").order("last_name"),
        termId
          ? supabase.from("student_class_terms").select("student_profile_id, form, stream").eq("term_id", termId)
          : (Promise.resolve({ data: [] as any[] }) as any),
        supabase.from("exam_results").select("student_profile_id, subject_code, mark").eq("exam_id", examId),
      ]);
      const snapMap = new Map<string, { form: string | null; stream: string | null }>();
      (snaps || []).forEach((r: any) => snapMap.set(r.student_profile_id, { form: r.form, stream: r.stream }));
      const formLevels = activeExam.form_levels.map(String);
      const overlaid = ((profs || []) as Profile[]).map(p => {
        const t = snapMap.get(p.id);
        return t ? { ...p, form: t.form ?? p.form, stream: t.stream ?? p.stream } : p;
      }).filter(p => p.form && formLevels.includes(String(p.form)));
      setStudents(overlaid.filter(p => studentClassId(p) === classId));
      setResults((rows || []) as Result[]);
      setLoading(false);
    })();
  }, [examId, classId, activeExam]);

  const resultsByStudent = useMemo(() => {
    const m: Record<string, Result[]> = {};
    const ids = new Set(students.map(s => s.id));
    results.forEach(r => { if (ids.has(r.student_profile_id)) (m[r.student_profile_id] ||= []).push(r); });
    return m;
  }, [results, students]);

  // ---------- Class positions ----------
  const classRows = useMemo(() => {
    const rows = students.map(s => {
      const rs = (resultsByStudent[s.id] || []).filter(r => r.mark != null);
      const total = rs.reduce((a, r) => a + Number(r.mark), 0);
      const count = rs.length;
      const avg = count ? total / count : 0;
      const passes = rs.filter(r => isPass(Number(r.mark))).length;
      return {
        id: s.id,
        name: `${s.last_name} ${s.first_name}`,
        form: s.form, stream: s.stream,
        total, count, avg, passes, fails: count - passes,
      };
    }).filter(r => r.count > 0);
    rows.sort((a, b) => b.avg - a.avg || b.total - a.total || a.name.localeCompare(b.name));
    let lastAvg: number | null = null, lastPos = 0;
    return rows.map((r, i) => {
      const pos = lastAvg !== null && Math.abs(r.avg - lastAvg) < 1e-9 ? lastPos : i + 1;
      lastAvg = r.avg; lastPos = pos;
      return { ...r, position: pos };
    });
  }, [students, resultsByStudent]);

  const classPie = useMemo(() => {
    const pass = classRows.reduce((a, r) => a + r.passes, 0);
    const fail = classRows.reduce((a, r) => a + r.fails, 0);
    return { pass, fail, total: pass + fail };
  }, [classRows]);

  // ---------- Subject positions ----------
  const subjectCodesAvailable = useMemo(() => {
    const inResults = Array.from(new Set(results.map(r => normalizeSubjectCode(r.subject_code))));
    if (fullAccess) return inResults.sort();
    const allowed = new Set(
      Array.from(teacherScope.entries())
        .filter(([, cls]) => cls.size === 0 || cls.has(classId))
        .map(([code]) => code)
    );
    return inResults.filter(c => allowed.has(c)).sort();
  }, [results, fullAccess, teacherScope, classId]);

  useEffect(() => {
    if (subjectCode && !subjectCodesAvailable.includes(subjectCode)) setSubjectCode("");
  }, [subjectCodesAvailable, subjectCode]);

  const subjectRows = useMemo(() => {
    if (!subjectCode) return [];
    const rows = students.map(s => {
      const r = (resultsByStudent[s.id] || []).find(x => normalizeSubjectCode(x.subject_code) === subjectCode);
      if (!r || r.mark == null) return null;
      const mark = Number(r.mark);
      return {
        id: s.id,
        name: `${s.last_name} ${s.first_name}`,
        mark,
        grade: computeGrade(mark, formToLevel(s.form), subjectCode),
        pass: isPass(mark),
      };
    }).filter(Boolean) as { id: string; name: string; mark: number; grade: string; pass: boolean }[];
    rows.sort((a, b) => b.mark - a.mark || a.name.localeCompare(b.name));
    let lastMark: number | null = null, lastPos = 0;
    return rows.map((r, i) => {
      const pos = lastMark !== null && r.mark === lastMark ? lastPos : i + 1;
      lastMark = r.mark; lastPos = pos;
      return { ...r, position: pos };
    });
  }, [subjectCode, students, resultsByStudent]);

  const subjectPie = useMemo(() => {
    const pass = subjectRows.filter(r => r.pass).length;
    const fail = subjectRows.length - pass;
    return { pass, fail, total: subjectRows.length };
  }, [subjectRows]);

  const filterBySearch = <T extends { name: string }>(rows: T[]) => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter(r => r.name.toLowerCase().includes(q)) : rows;
  };

  const PassFailChart = ({ pass, fail }: { pass: number; fail: number }) => {
    const total = pass + fail;
    if (!total) return <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">No marks recorded.</div>;
    const data = [
      { name: `Pass (${Math.round((pass / total) * 100)}%)`, value: pass },
      { name: `Fail (${Math.round((fail / total) * 100)}%)`, value: fail },
    ];
    return (
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={48} outerRadius={78} paddingAngle={3}>
              {data.map((_, i) => <Cell key={i} fill={PASS_COLORS[i]} />)}
            </Pie>
            <Tooltip formatter={(v: number) => [`${v} entr${v === 1 ? "y" : "ies"}`, ""]} />
            <Legend verticalAlign="bottom" height={28} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const PositionBadge = ({ pos, last }: { pos: number; last: boolean }) => (
    <Badge className={
      pos === 1 ? "bg-success text-success-foreground"
      : last ? "bg-destructive text-destructive-foreground"
      : "bg-secondary text-secondary-foreground"
    }>
      {ordinal(pos)}
    </Badge>
  );

  const canSeeClassTab = fullAccess || classTeacherClasses.length > 0;
  const canSeeSubjectTab = fullAccess || teacherScope.size > 0;

  if (roleLoading || privLoading) {
    return <div className="p-8 text-center"><Loader2 className="inline animate-spin mr-2" size={16} />Loading…</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Positions &amp; Analytics</h2>
        <p className="text-sm text-muted-foreground">
          Internal only — class and subject positions are never shown on student reports or student accounts.
        </p>
      </div>

      <Card><CardContent className="p-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-[220px]">
          <Label>Exam</Label>
          <Select value={examId} onValueChange={setExamId}>
            <SelectTrigger><SelectValue placeholder="Select exam" /></SelectTrigger>
            <SelectContent>{exams.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="min-w-[180px]">
          <Label>Class</Label>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger><SelectValue placeholder={classOptions.length ? "Select class" : "No classes"} /></SelectTrigger>
            <SelectContent>{classOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="min-w-[200px]">
          <Label>Search student</Label>
          <Input placeholder="Type name…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </CardContent></Card>

      {loading ? (
        <div className="p-8 text-center"><Loader2 className="inline animate-spin mr-2" size={16} />Loading results…</div>
      ) : !examId || !classId ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Select an exam and class to view positions.</CardContent></Card>
      ) : (
        <Tabs defaultValue={canSeeClassTab ? "class" : "subject"}>
          <TabsList>
            {canSeeClassTab && <TabsTrigger value="class">Class Positions</TabsTrigger>}
            {canSeeSubjectTab && <TabsTrigger value="subject">Subject Positions</TabsTrigger>}
          </TabsList>

          {canSeeClassTab && (
            <TabsContent value="class" className="space-y-4 pt-4">
              {!fullAccess && !classTeacherClasses.includes(classId) ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">
                  You are not the class teacher of {classId}. Class positions are only visible to that class's class teacher.
                </CardContent></Card>
              ) : (
                <>
                  <div className="grid gap-4 lg:grid-cols-3">
                    <Card className="lg:col-span-2">
                      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Trophy size={16} /> Top of the class</CardTitle></CardHeader>
                      <CardContent className="grid gap-3 sm:grid-cols-3">
                        {classRows.slice(0, 3).map((r, i) => (
                          <div key={r.id} className="rounded-lg border p-3">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Medal size={14} /> {ordinal(i + 1)} position
                            </div>
                            <div className="font-semibold mt-1">{r.name}</div>
                            <div className="text-xs text-muted-foreground">Avg {r.avg.toFixed(1)}% · {r.count} subject(s)</div>
                          </div>
                        ))}
                        {classRows.length === 0 && <div className="text-sm text-muted-foreground">No marks recorded for this class.</div>}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-base">Overall Pass / Fail</CardTitle></CardHeader>
                      <CardContent>
                        <PassFailChart pass={classPie.pass} fail={classPie.fail} />
                        <p className="text-xs text-muted-foreground text-center">
                          {classPie.total} mark entries · pass mark 40%
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">Class order — 1st to last</CardTitle></CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader><TableRow className="bg-secondary">
                          <TableHead>Pos</TableHead><TableHead>Student</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">Average</TableHead>
                          <TableHead className="text-right">Subjects</TableHead>
                          <TableHead className="text-right">Passed</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {filterBySearch(classRows).map(r => (
                            <TableRow key={r.id}>
                              <TableCell><PositionBadge pos={r.position} last={r.position === classRows[classRows.length - 1]?.position} /></TableCell>
                              <TableCell className="font-medium">{r.name}</TableCell>
                              <TableCell className="text-right">{r.total}</TableCell>
                              <TableCell className="text-right">{r.avg.toFixed(1)}%</TableCell>
                              <TableCell className="text-right">{r.count}</TableCell>
                              <TableCell className="text-right">{r.passes}/{r.count}</TableCell>
                            </TableRow>
                          ))}
                          {classRows.length === 0 && (
                            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No results.</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>
          )}

          {canSeeSubjectTab && (
            <TabsContent value="subject" className="space-y-4 pt-4">
              <Card><CardContent className="p-4">
                <div className="max-w-xs">
                  <Label>Subject</Label>
                  <Select value={subjectCode} onValueChange={setSubjectCode}>
                    <SelectTrigger><SelectValue placeholder={subjectCodesAvailable.length ? "Select subject" : "No subjects you teach in this class"} /></SelectTrigger>
                    <SelectContent>
                      {subjectCodesAvailable.map(c => (
                        <SelectItem key={c} value={c}>{SUBJECT_CODES[c] || c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent></Card>

              {!subjectCode ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">Select a subject to view positions.</CardContent></Card>
              ) : (
                <>
                  <div className="grid gap-4 lg:grid-cols-3">
                    <Card className="lg:col-span-2">
                      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Trophy size={16} /> Best in {SUBJECT_CODES[subjectCode] || subjectCode}</CardTitle></CardHeader>
                      <CardContent className="grid gap-3 sm:grid-cols-3">
                        {subjectRows.slice(0, 3).map((r, i) => (
                          <div key={r.id} className="rounded-lg border p-3">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Medal size={14} /> {ordinal(i + 1)} position</div>
                            <div className="font-semibold mt-1">{r.name}</div>
                            <div className="text-xs text-muted-foreground">{r.mark}% · Grade {r.grade}</div>
                          </div>
                        ))}
                        {subjectRows.length === 0 && <div className="text-sm text-muted-foreground">No marks recorded.</div>}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-base">Pass / Fail</CardTitle></CardHeader>
                      <CardContent>
                        <PassFailChart pass={subjectPie.pass} fail={subjectPie.fail} />
                        <p className="text-xs text-muted-foreground text-center">{subjectPie.total} student(s) · pass mark 40%</p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">Subject order — 1st to last</CardTitle></CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader><TableRow className="bg-secondary">
                          <TableHead>Pos</TableHead><TableHead>Student</TableHead>
                          <TableHead className="text-right">Mark</TableHead>
                          <TableHead className="text-right">Grade</TableHead>
                          <TableHead className="text-right">Outcome</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {filterBySearch(subjectRows).map(r => (
                            <TableRow key={r.id}>
                              <TableCell><PositionBadge pos={r.position} last={r.position === subjectRows[subjectRows.length - 1]?.position} /></TableCell>
                              <TableCell className="font-medium">{r.name}</TableCell>
                              <TableCell className="text-right">{r.mark}%</TableCell>
                              <TableCell className="text-right">{r.grade}</TableCell>
                              <TableCell className="text-right">
                                <Badge className={r.pass ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"}>
                                  {r.pass ? "Pass" : "Fail"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                          {subjectRows.length === 0 && (
                            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No results.</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
};

export default PositionsAnalytics;
