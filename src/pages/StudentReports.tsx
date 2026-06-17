import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, QrCode, Printer, Trophy, Users, TrendingUp } from "lucide-react";
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
        .select("id, first_name, last_name, form, stream, registration_number").eq("id", user.id).maybeSingle();
      setProfile(p as any);

      const { data: rs } = await supabase.from("exam_results")
        .select("*, exams!inner(id, name, exam_type, term, year, published)")
        .eq("student_profile_id", user.id);
      const examMap: Record<string, Exam> = {};
      const resMap: Record<string, Result[]> = {};
      for (const r of (rs || []) as any[]) {
        examMap[r.exam_id] = r.exams;
        resMap[r.exam_id] = resMap[r.exam_id] || [];
        resMap[r.exam_id].push(r);
      }
      const examList = Object.values(examMap);
      setExams(examList);
      setResults(resMap);

      // Load analytics for each exam in parallel
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
    return <DashboardLayout role="student"><div className="p-8 text-center"><Loader2 className="inline animate-spin mr-2" size={16}/>Loading…</div></DashboardLayout>;
  }

  return (
    <DashboardLayout role="student">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Exam Results</h2>
          <p className="text-sm text-muted-foreground">Your results, grades and class analytics. Tap Verify for the QR code.</p>
        </div>

        {exams.length === 0 && (
          <Card><CardContent className="p-8 text-center text-muted-foreground">No results yet. Check back later.</CardContent></Card>
        )}

        {exams.map((e) => {
          const rs = results[e.id] || [];
          const level = formToLevel(profile?.form);
          const totalPts = rs.reduce((a, r) => a + (r.mark != null ? computePoints(Number(r.mark), level, r.subject_code) : 0), 0);
          const avg = rs.length ? (rs.reduce((a, r) => a + (Number(r.mark) || 0), 0) / rs.length) : 0;
          const passedCount = rs.filter(r => Number(r.mark) >= 50).length;
          const a = analytics[e.id];
          return (
            <Card key={e.id}>
              <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle>{e.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">{e.exam_type} · Term {e.term} · {e.year}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">Avg {avg.toFixed(1)}%</Badge>
                  <Badge variant="outline">{passedCount}/{rs.length} passed</Badge>
                  {level === "alevel" && <Badge className="bg-primary">Points: {totalPts}</Badge>}
                  <Button variant="outline" size="sm" onClick={() => showQR(e)} className="gap-1"><QrCode size={14}/> Verify</Button>
                </div>
              </CardHeader>

              {a && (
                <CardContent className="pb-0">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="rounded-lg border p-3">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground"><Users size={12}/> Class size</div>
                      <div className="text-lg font-semibold">{a.total_students}</div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground"><TrendingUp size={12}/> Pass rate</div>
                      <div className="text-lg font-semibold">{Number(a.pass_rate).toFixed(1)}%</div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground"><Trophy size={12}/> Top student</div>
                      <div className="text-sm font-semibold truncate">{a.top_student_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{a.top_student_avg != null ? `${Number(a.top_student_avg).toFixed(1)}%` : ""}</div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">Your position</div>
                      <div className="text-lg font-semibold">{a.my_rank ? `#${a.my_rank}` : "—"}</div>
                      <div className="text-xs text-muted-foreground">{a.my_avg != null ? `Avg ${Number(a.my_avg).toFixed(1)}%` : ""}</div>
                    </div>
                  </div>
                </CardContent>
              )}

              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subject</TableHead>
                      <TableHead className="text-center">Mark</TableHead>
                      <TableHead className="text-center">Grade</TableHead>
                      {level === "alevel" && <TableHead className="text-center">Points</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rs.map(r => {
                      const liveGrade = r.mark != null ? computeGrade(Number(r.mark), level, r.subject_code) : (r.grade || "");
                      const livePts = r.mark != null ? computePoints(Number(r.mark), level, r.subject_code) : (r.points ?? 0);
                      const failed = liveGrade === "U" || liveGrade === "G" || liveGrade === "F";
                      return (
                        <TableRow key={r.id}>
                          <TableCell>{r.subject_name || r.subject_code} <span className="text-xs text-muted-foreground">({r.subject_code})</span></TableCell>
                          <TableCell className="text-center font-medium">{r.mark}</TableCell>
                          <TableCell className="text-center"><Badge variant={failed ? "destructive" : "outline"}>{liveGrade}</Badge></TableCell>
                          {level === "alevel" && <TableCell className="text-center">{livePts}</TableCell>}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!qr} onOpenChange={(o) => { if (!o) setQr(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{qr?.title}</DialogTitle></DialogHeader>
          {qr && <div className="flex flex-col items-center gap-3 py-2">
            <img src={qr.url} alt="QR" className="w-72 h-72"/>
            <p className="text-xs text-muted-foreground text-center">Scan this QR (or share the link in it) to verify these results from anyone's phone.</p>
            <Button onClick={() => window.print()} variant="outline" className="gap-2"><Printer size={14}/> Print</Button>
          </div>}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default StudentReports;
