import { useEffect, useState, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, QrCode, Printer, Trophy, Users, TrendingUp, Award, Sparkles, GraduationCap, Target, BookOpen, Calendar, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import QRCode from "qrcode";
import { formToLevel, computeGrade, computePoints } from "@/lib/grading";

type Exam = { id: string; name: string; exam_type: string; term: number; year: number; published: boolean };
type Result = { id: string; exam_id: string; subject_code: string; subject_name: string | null; mark: number | null; grade: string | null; points: number | null };
type Analytics = {
  total_students: number;
  pass_rate: number;
  top_student_name: string | null;
  top_student_avg: number | null;
  my_avg: number | null;
  my_rank: number | null;
};

const gradeStyle = (g: string) => {
  if (g === "A*" || g === "A") return "bg-gradient-to-br from-emerald-500 to-emerald-700 text-white border-0 shadow-md shadow-emerald-500/30";
  if (g === "B") return "bg-gradient-to-br from-sky-500 to-sky-700 text-white border-0 shadow-md shadow-sky-500/30";
  if (g === "C") return "bg-gradient-to-br from-indigo-500 to-indigo-700 text-white border-0 shadow-md shadow-indigo-500/30";
  if (g === "D") return "bg-gradient-to-br from-amber-500 to-amber-600 text-white border-0 shadow-md shadow-amber-500/30";
  if (g === "E") return "bg-gradient-to-br from-orange-500 to-orange-600 text-white border-0 shadow-md shadow-orange-500/30";
  return "bg-gradient-to-br from-rose-500 to-rose-700 text-white border-0 shadow-md shadow-rose-500/30";
};

const markBarColor = (m: number) => {
  if (m >= 80) return "from-emerald-400 to-emerald-600";
  if (m >= 70) return "from-sky-400 to-sky-600";
  if (m >= 60) return "from-indigo-400 to-indigo-600";
  if (m >= 50) return "from-amber-400 to-amber-600";
  if (m >= 40) return "from-orange-400 to-orange-600";
  return "from-rose-400 to-rose-600";
};

const StudentReports = () => {
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<Exam[]>([]);
  const [results, setResults] = useState<Record<string, Result[]>>({});
  const [analytics, setAnalytics] = useState<Record<string, Analytics>>({});
  const [profile, setProfile] = useState<{ id: string; first_name: string; last_name: string; form: string | null; stream: string | null; registration_number: string | null } | null>(null);
  const [qr, setQr] = useState<{ url: string; title: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setLoading(false);
      const { data: p } = await supabase.from("profiles")
        .select("id, first_name, last_name, form, stream, registration_number").eq("user_id", user.id).maybeSingle();
      setProfile(p as any);
      if (!p) return setLoading(false);

      const { data: rs } = await supabase.from("exam_results")
        .select("*, exams!inner(id, name, exam_type, term, year, published)")
        .eq("student_profile_id", p.id);
      const examMap: Record<string, Exam> = {};
      const resMap: Record<string, Result[]> = {};
      for (const r of (rs || []) as any[]) {
        examMap[r.exam_id] = r.exams;
        resMap[r.exam_id] = resMap[r.exam_id] || [];
        resMap[r.exam_id].push(r);
      }
      const examList = Object.values(examMap).sort((a, b) => (b.year - a.year) || (b.term - a.term));
      setExams(examList);
      setResults(resMap);

      const analyticsEntries = await Promise.all(
        examList.map(async (e) => {
          const { data } = await supabase.rpc("get_exam_analytics", { p_exam_id: e.id });
          const row = Array.isArray(data) && data[0] ? data[0] : null;
          return [e.id, row as Analytics | null] as const;
        })
      );
      const aMap: Record<string, Analytics> = {};
      for (const [id, a] of analyticsEntries) if (a) aMap[id] = a;
      setAnalytics(aMap);

      setLoading(false);
    })();
  }, []);

  const showQR = async (exam: Exam) => {
    if (!profile) return;
    const url = `${window.location.origin}/verify-report/${exam.id}/${profile.id}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 320, margin: 2 });
    setQr({ url: dataUrl, title: `${exam.name} – Verification QR` });
  };

  if (loading) {
    return <DashboardLayout role="student"><div className="p-12 text-center"><Loader2 className="inline animate-spin mr-2" size={18}/>Loading your results…</div></DashboardLayout>;
  }

  // Overall best across all exams
  const allExamAverages = exams.map(e => {
    const rs = results[e.id] || [];
    return rs.length ? rs.reduce((s, r) => s + (Number(r.mark) || 0), 0) / rs.length : 0;
  });
  const bestAvg = allExamAverages.length ? Math.max(...allExamAverages) : 0;

  return (
    <DashboardLayout role="student">
      <div className="space-y-6">
        {/* Hero header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-[hsl(217_91%_22%)] text-primary-foreground p-6 md:p-8 shadow-xl">
          <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-accent/20 blur-3xl" />
          <div className="absolute -left-10 -bottom-10 w-48 h-48 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 text-accent text-sm font-medium mb-2">
                <Sparkles size={16}/> Academic Report Centre
              </div>
              <h1 className="text-2xl md:text-3xl font-bold">
                {profile ? `${profile.first_name} ${profile.last_name}` : "Your Results"}
              </h1>
              <p className="text-primary-foreground/80 text-sm mt-1 flex items-center gap-3 flex-wrap">
                {profile?.registration_number && <span className="inline-flex items-center gap-1"><GraduationCap size={14}/> {profile.registration_number}</span>}
                {profile?.form && <span className="inline-flex items-center gap-1"><BookOpen size={14}/> Form {profile.form}{profile?.stream ? ` · ${profile.stream}` : ""}</span>}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 px-4 py-3 min-w-[120px]">
                <div className="text-xs text-primary-foreground/70">Exams</div>
                <div className="text-2xl font-bold">{exams.length}</div>
              </div>
              <div className="rounded-xl bg-accent text-accent-foreground px-4 py-3 min-w-[120px] shadow-lg">
                <div className="text-xs opacity-80">Best Avg</div>
                <div className="text-2xl font-bold">{bestAvg ? `${bestAvg.toFixed(1)}%` : "—"}</div>
              </div>
            </div>
          </div>
        </div>

        {exams.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <BookOpen className="text-muted-foreground" size={28}/>
              </div>
              <h3 className="font-semibold text-lg">No results yet</h3>
              <p className="text-muted-foreground text-sm mt-1">Your exam results will appear here as soon as they are recorded.</p>
            </CardContent>
          </Card>
        )}

        {exams.map((e, idx) => {
          const rs = results[e.id] || [];
          const level = formToLevel(profile?.form);
          const totalPts = rs.reduce((a, r) => a + (r.mark != null ? computePoints(Number(r.mark), level, r.subject_code) : 0), 0);
          const avg = rs.length ? (rs.reduce((a, r) => a + (Number(r.mark) || 0), 0) / rs.length) : 0;
          const passedCount = rs.filter(r => Number(r.mark) >= 50).length;
          const a = analytics[e.id];
          const isBest = avg === bestAvg && avg > 0;

          return (
            <Card key={e.id} className="overflow-hidden border-0 shadow-lg hover:shadow-xl transition-shadow">
              {/* Exam header strip */}
              <div className="relative bg-gradient-to-r from-secondary via-secondary to-background border-b p-5 md:p-6">
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-gradient-to-br from-primary to-[hsl(217_91%_22%)] text-primary-foreground w-12 h-12 flex items-center justify-center shadow-md">
                      <Award size={22}/>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg md:text-xl font-bold text-foreground">{e.name}</h2>
                        {isBest && <Badge className="bg-accent text-accent-foreground border-0 gap-1"><Sparkles size={12}/> Best</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1"><Calendar size={12}/> Term {e.term} · {e.year}</span>
                        <span className="text-muted-foreground/50">•</span>
                        <span className="uppercase tracking-wide">{e.exam_type}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="px-3 py-1.5 rounded-lg bg-background border shadow-sm">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Average</div>
                      <div className="text-base font-bold text-foreground">{avg.toFixed(1)}%</div>
                    </div>
                    <div className="px-3 py-1.5 rounded-lg bg-background border shadow-sm">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Passed</div>
                      <div className="text-base font-bold text-foreground">{passedCount}/{rs.length}</div>
                    </div>
                    {level === "alevel" && (
                      <div className="px-3 py-1.5 rounded-lg bg-gradient-to-br from-primary to-[hsl(217_91%_22%)] text-primary-foreground shadow-md">
                        <div className="text-[10px] uppercase tracking-wide opacity-80">Points</div>
                        <div className="text-base font-bold">{totalPts}</div>
                      </div>
                    )}
                    <Button variant="outline" size="sm" onClick={() => showQR(e)} className="gap-1.5 bg-background"><QrCode size={14}/> Verify</Button>
                  </div>
                </div>
              </div>

              {/* Analytics cards */}
              {a && (
                <div className="px-5 md:px-6 pt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-xl border bg-gradient-to-br from-background to-secondary/50 p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <div className="w-7 h-7 rounded-md bg-sky-100 text-sky-700 flex items-center justify-center"><Users size={14}/></div>
                      Class size
                    </div>
                    <div className="text-xl font-bold text-foreground">{a.total_students}</div>
                  </div>
                  <div className="rounded-xl border bg-gradient-to-br from-background to-secondary/50 p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <div className="w-7 h-7 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center"><TrendingUp size={14}/></div>
                      Pass rate
                    </div>
                    <div className="text-xl font-bold text-foreground">{Number(a.pass_rate).toFixed(1)}%</div>
                    <Progress value={Number(a.pass_rate)} className="h-1.5 mt-2" />
                  </div>
                  <div className="rounded-xl border bg-gradient-to-br from-background to-amber-50/50 p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <div className="w-7 h-7 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center"><Trophy size={14}/></div>
                      Top student
                    </div>
                    <div className="text-sm font-bold text-foreground truncate">{a.top_student_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{a.top_student_avg != null ? `${Number(a.top_student_avg).toFixed(1)}% avg` : ""}</div>
                  </div>
                  <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-accent/10 p-4 relative overflow-hidden">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <div className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center"><Target size={14}/></div>
                      Your position
                    </div>
                    <div className="text-xl font-bold text-primary">{a.my_rank ? `#${a.my_rank}` : "—"}</div>
                    <div className="text-xs text-muted-foreground">{a.my_avg != null ? `Avg ${Number(a.my_avg).toFixed(1)}%` : ""}</div>
                  </div>
                </div>
              )}

              {/* Results table */}
              <CardContent className="pt-5">
                <div className="rounded-xl border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-secondary/60 hover:bg-secondary/60">
                        <TableHead className="font-semibold">Subject</TableHead>
                        <TableHead className="text-center font-semibold w-[40%]">Mark</TableHead>
                        <TableHead className="text-center font-semibold">Grade</TableHead>
                        {level === "alevel" && <TableHead className="text-center font-semibold">Points</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rs.map(r => {
                        const mark = Number(r.mark) || 0;
                        const liveGrade = r.mark != null ? computeGrade(mark, level, r.subject_code) : (r.grade || "");
                        const livePts = r.mark != null ? computePoints(mark, level, r.subject_code) : (r.points ?? 0);
                        return (
                          <TableRow key={r.id} className="hover:bg-secondary/30">
                            <TableCell>
                              <div className="font-medium text-foreground">{r.subject_name || r.subject_code}</div>
                              <div className="text-xs text-muted-foreground">{r.subject_code}</div>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center gap-3">
                                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                  <div className={`h-full bg-gradient-to-r ${markBarColor(mark)} transition-all`} style={{ width: `${Math.min(100, mark)}%` }} />
                                </div>
                                <span className="font-semibold text-foreground w-10 text-right">{r.mark}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className={`inline-flex items-center justify-center min-w-[2.5rem] px-2.5 py-1 rounded-md text-xs font-bold ${gradeStyle(liveGrade)}`}>
                                {liveGrade}
                              </span>
                            </TableCell>
                            {level === "alevel" && <TableCell className="text-center font-semibold">{livePts}</TableCell>}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!qr} onOpenChange={(o) => { if (!o) setQr(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{qr?.title}</DialogTitle></DialogHeader>
          {qr && <div className="flex flex-col items-center gap-3 py-2">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-secondary to-background border shadow-inner">
              <img src={qr.url} alt="QR" className="w-72 h-72"/>
            </div>
            <p className="text-xs text-muted-foreground text-center max-w-sm">Scan this QR (or share the link inside it) to verify these results from anyone's phone.</p>
            <Button onClick={() => window.print()} variant="outline" className="gap-2"><Printer size={14}/> Print</Button>
          </div>}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default StudentReports;
