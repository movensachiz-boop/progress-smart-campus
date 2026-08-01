import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import StatCard from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { GraduationCap, Users, BookOpen, TrendingUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTimetable } from "@/context/TimetableContext";
import { SUBJECT_CODES, normalizeSubjectCode, formToLevel, computeGrade, isPass } from "@/lib/grading";

type Exam = { id: string; name: string; form_levels: number[] };
type Profile = { id: string; first_name: string; last_name: string; form: string | null; stream: string | null };
type Result = { student_profile_id: string; subject_code: string; mark: number | null };

const PASS_COLORS = ["hsl(142,72%,40%)", "hsl(0,72%,51%)"];

const studentClassId = (s: { form: string | null; stream: string | null }): string => {
  const fn = Number(s.form);
  if (!fn) return "—";
  const stream = (s.stream || "").trim();
  if (!stream) return `${fn}`;
  return fn >= 5 ? `${fn}${stream.charAt(0).toUpperCase()}` : `${fn}${stream}`;
};

const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);

const AdminPrincipalDashboard = () => {
  const { teachers: ttTeachers } = useTimetable();

  const [loading, setLoading] = useState(true);
  const [teacherAccounts, setTeacherAccounts] = useState(0);
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [resLoading, setResLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: roles }, { data: exs }, { data: profs }] = await Promise.all([
        supabase.from("user_roles").select("user_id, role").eq("role", "teacher"),
        supabase.from("exams").select("id, name, form_levels").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, first_name, last_name, form, stream"),
      ]);
      setTeacherAccounts(new Set((roles || []).map((r: any) => r.user_id)).size);
      const exams = (exs || []) as Exam[];
      setExams(exams);
      setExamId(prev => prev || exams[0]?.id || "");
      setProfiles((profs || []) as Profile[]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!examId) { setResults([]); return; }
    (async () => {
      setResLoading(true);
      const { data } = await supabase
        .from("exam_results")
        .select("student_profile_id, subject_code, mark")
        .eq("exam_id", examId);
      setResults((data || []) as Result[]);
      setResLoading(false);
    })();
  }, [examId]);

  const profMap = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);

  const scored = useMemo(
    () => results.filter(r => r.mark !== null && !Number.isNaN(Number(r.mark))),
    [results]
  );

  const overall = useMemo(() => {
    const marks = scored.map(r => Number(r.mark));
    const passes = scored.filter(r => {
      const p = profMap.get(r.student_profile_id);
      return isPass(Number(r.mark), formToLevel(p?.form ?? null), r.subject_code);
    }).length;
    return {
      entries: scored.length,
      average: avg(marks),
      passRate: scored.length ? (passes / scored.length) * 100 : 0,
      passes,
      fails: scored.length - passes,
      studentsAssessed: new Set(scored.map(r => r.student_profile_id)).size,
    };
  }, [scored, profMap]);

  const perClass = useMemo(() => {
    const map = new Map<string, { marks: number[]; pass: number; students: Set<string> }>();
    for (const r of scored) {
      const p = profMap.get(r.student_profile_id);
      if (!p) continue;
      const cls = studentClassId(p);
      const e = map.get(cls) || { marks: [], pass: 0, students: new Set<string>() };
      e.marks.push(Number(r.mark));
      if (isPass(Number(r.mark), formToLevel(p.form), r.subject_code)) e.pass++;
      e.students.add(p.id);
      map.set(cls, e);
    }
    return Array.from(map.entries())
      .map(([name, e]) => ({
        name,
        average: Math.round(avg(e.marks) * 10) / 10,
        passRate: Math.round((e.pass / e.marks.length) * 1000) / 10,
        students: e.students.size,
        entries: e.marks.length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [scored, profMap]);

  const perSubject = useMemo(() => {
    const map = new Map<string, { marks: number[]; pass: number; students: Set<string> }>();
    for (const r of scored) {
      const p = profMap.get(r.student_profile_id);
      const code = normalizeSubjectCode(r.subject_code) || r.subject_code;
      const e = map.get(code) || { marks: [], pass: 0, students: new Set<string>() };
      e.marks.push(Number(r.mark));
      if (isPass(Number(r.mark), formToLevel(p?.form ?? null), r.subject_code)) e.pass++;
      e.students.add(r.student_profile_id);
      map.set(code, e);
    }
    return Array.from(map.entries())
      .map(([code, e]) => ({
        code,
        name: SUBJECT_CODES[code] || code,
        average: Math.round(avg(e.marks) * 10) / 10,
        passRate: Math.round((e.pass / e.marks.length) * 1000) / 10,
        students: e.students.size,
        entries: e.marks.length,
      }))
      .sort((a, b) => b.average - a.average);
  }, [scored, profMap]);

  const perStudent = useMemo(() => {
    const map = new Map<string, { marks: number[]; pass: number }>();
    for (const r of scored) {
      const p = profMap.get(r.student_profile_id);
      const e = map.get(r.student_profile_id) || { marks: [], pass: 0 };
      e.marks.push(Number(r.mark));
      if (isPass(Number(r.mark), formToLevel(p?.form ?? null), r.subject_code)) e.pass++;
      map.set(r.student_profile_id, e);
    }
    return Array.from(map.entries())
      .map(([id, e]) => {
        const p = profMap.get(id);
        const average = Math.round(avg(e.marks) * 10) / 10;
        return {
          id,
          name: p ? `${p.first_name} ${p.last_name}` : "Unknown",
          classId: p ? studentClassId(p) : "—",
          subjects: e.marks.length,
          average,
          passRate: Math.round((e.pass / e.marks.length) * 1000) / 10,
          grade: computeGrade(average, formToLevel(p?.form ?? null)),
        };
      })
      .sort((a, b) => b.average - a.average);
  }, [scored, profMap]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return perStudent;
    return perStudent.filter(s => s.name.toLowerCase().includes(q) || s.classId.toLowerCase().includes(q));
  }, [perStudent, search]);

  const passPie = [
    { name: "Pass", value: overall.passes },
    { name: "Fail", value: overall.fails },
  ];

  const topSubjectsChart = perSubject.slice(0, 14);

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Principal's Dashboard</h2>
            <p className="text-sm text-muted-foreground">School-wide staffing and academic performance</p>
          </div>
          <div className="w-full sm:w-72">
            <Label className="text-xs">Exam</Label>
            <Select value={examId} onValueChange={setExamId}>
              <SelectTrigger><SelectValue placeholder="Select an exam" /></SelectTrigger>
              <SelectContent>
                {exams.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <StatCard title="Teaching Staff" value={String(ttTeachers.length)} subtitle="On staff register" icon={GraduationCap} variant="primary" />
            <StatCard title="Teacher Accounts" value={String(teacherAccounts)} subtitle="With portal logins" icon={Users} variant="accent" />
            <StatCard title="Students Assessed" value={String(overall.studentsAssessed)} subtitle="In selected exam" icon={Users} variant="primary" />
            <StatCard title="School Average" value={`${overall.average.toFixed(1)}%`} subtitle={`${overall.entries} marks recorded`} icon={TrendingUp} variant="success" />
            <StatCard title="Pass Rate" value={`${overall.passRate.toFixed(1)}%`} subtitle="All subjects" icon={BookOpen} variant={overall.passRate >= 50 ? "success" : "warning"} />
          </div>
        )}

        {resLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading results…
          </div>
        )}

        {!resLoading && scored.length === 0 ? (
          <Card className="shadow-card">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No marks recorded for this exam yet.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 shadow-card">
                <CardHeader className="pb-2"><CardTitle className="text-base">Average & Pass Rate by Class</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={perClass}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,90%)" />
                        <XAxis dataKey="name" fontSize={12} />
                        <YAxis fontSize={12} domain={[0, 100]} />
                        <Tooltip formatter={(v: number) => `${v}%`} />
                        <Legend />
                        <Bar dataKey="average" name="Average %" fill="hsl(210,100%,20%)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="passRate" name="Pass rate %" fill="hsl(51,100%,50%)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader className="pb-2"><CardTitle className="text-base">Whole-School Pass / Fail</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={passPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} label>
                          {passPie.map((_, i) => <Cell key={i} fill={PASS_COLORS[i]} />)}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="shadow-card">
              <CardHeader className="pb-2"><CardTitle className="text-base">Average by Subject</CardTitle></CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topSubjectsChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,90%)" />
                      <XAxis dataKey="code" fontSize={11} interval={0} angle={-30} textAnchor="end" height={60} />
                      <YAxis fontSize={12} domain={[0, 100]} />
                      <Tooltip formatter={(v: number) => `${v}%`} labelFormatter={(l) => SUBJECT_CODES[String(l)] || String(l)} />
                      <Legend />
                      <Bar dataKey="average" name="Average %" fill="hsl(210,100%,20%)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="passRate" name="Pass rate %" fill="hsl(142,72%,40%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="pb-2"><CardTitle className="text-base">Breakdown</CardTitle></CardHeader>
              <CardContent>
                <Tabs defaultValue="class">
                  <TabsList>
                    <TabsTrigger value="class">Per Class</TabsTrigger>
                    <TabsTrigger value="subject">Per Subject</TabsTrigger>
                    <TabsTrigger value="student">Per Student</TabsTrigger>
                  </TabsList>

                  <TabsContent value="class" className="mt-4">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-secondary">
                          <TableHead>Class</TableHead>
                          <TableHead>Students</TableHead>
                          <TableHead>Marks</TableHead>
                          <TableHead>Average</TableHead>
                          <TableHead>Pass rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {perClass.map(c => (
                          <TableRow key={c.name}>
                            <TableCell className="font-medium">{c.name}</TableCell>
                            <TableCell>{c.students}</TableCell>
                            <TableCell>{c.entries}</TableCell>
                            <TableCell>{c.average}%</TableCell>
                            <TableCell>
                              <Badge className={c.passRate >= 50 ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"}>
                                {c.passRate}%
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TabsContent>

                  <TabsContent value="subject" className="mt-4">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-secondary">
                          <TableHead>Subject</TableHead>
                          <TableHead>Students</TableHead>
                          <TableHead>Marks</TableHead>
                          <TableHead>Average</TableHead>
                          <TableHead>Pass rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {perSubject.map(s => (
                          <TableRow key={s.code}>
                            <TableCell className="font-medium">{s.name}</TableCell>
                            <TableCell>{s.students}</TableCell>
                            <TableCell>{s.entries}</TableCell>
                            <TableCell>{s.average}%</TableCell>
                            <TableCell>
                              <Badge className={s.passRate >= 50 ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"}>
                                {s.passRate}%
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TabsContent>

                  <TabsContent value="student" className="mt-4 space-y-3">
                    <Input
                      placeholder="Search student or class…"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="max-w-sm"
                    />
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-secondary">
                          <TableHead>#</TableHead>
                          <TableHead>Student</TableHead>
                          <TableHead>Class</TableHead>
                          <TableHead>Subjects</TableHead>
                          <TableHead>Average</TableHead>
                          <TableHead>Grade</TableHead>
                          <TableHead>Pass rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredStudents.map(s => (
                          <TableRow key={s.id}>
                            <TableCell>{perStudent.findIndex(p => p.id === s.id) + 1}</TableCell>
                            <TableCell className="font-medium">{s.name}</TableCell>
                            <TableCell>{s.classId}</TableCell>
                            <TableCell>{s.subjects}</TableCell>
                            <TableCell>{s.average}%</TableCell>
                            <TableCell>{s.grade}</TableCell>
                            <TableCell>{s.passRate}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AdminPrincipalDashboard;
