import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, QrCode, Printer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import QRCode from "qrcode";
import { formToLevel, computeGrade, computePoints } from "@/lib/grading";

type Exam = { id: string; name: string; exam_type: string; term: number; year: number; published: boolean };
type Result = { id: string; exam_id: string; subject_code: string; subject_name: string | null; mark: number | null; grade: string | null; points: number | null };

const StudentReports = () => {
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<Exam[]>([]);
  const [results, setResults] = useState<Record<string, Result[]>>({});
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
      setExams(Object.values(examMap));
      setResults(resMap);
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
          <p className="text-sm text-muted-foreground">Your published exam results. Tap the QR to verify.</p>
        </div>

        {exams.length === 0 && (
          <Card><CardContent className="p-8 text-center text-muted-foreground">No published results yet. Check back later.</CardContent></Card>
        )}

        {exams.map((e) => {
          const rs = results[e.id] || [];
          const level = formToLevel(profile?.form);
          const totalPts = rs.reduce((a, r) => a + (r.mark != null ? computePoints(Number(r.mark), level) : 0), 0);
          const avg = rs.length ? (rs.reduce((a, r) => a + (Number(r.mark) || 0), 0) / rs.length) : 0;
          return (
            <Card key={e.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{e.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">{e.exam_type} · Term {e.term} · {e.year}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Avg {avg.toFixed(1)}%</Badge>
                  {level === "alevel" && <Badge className="bg-primary">Points: {totalPts}</Badge>}
                  <Button variant="outline" size="sm" onClick={() => showQR(e)} className="gap-1"><QrCode size={14}/> Verify</Button>
                </div>
              </CardHeader>
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
                    {rs.map(r => (
                      <TableRow key={r.id}>
                        <TableCell>{r.subject_name || r.subject_code} <span className="text-xs text-muted-foreground">({r.subject_code})</span></TableCell>
                        <TableCell className="text-center font-medium">{r.mark}</TableCell>
                        <TableCell className="text-center"><Badge variant={r.grade === "U" ? "destructive" : "outline"}>{r.grade}</Badge></TableCell>
                        {level === "alevel" && <TableCell className="text-center">{r.points}</TableCell>}
                      </TableRow>
                    ))}
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
