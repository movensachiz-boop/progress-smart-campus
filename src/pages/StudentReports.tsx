import { useEffect, useState, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, QrCode, Printer, Trophy, Users, TrendingUp, Award, GraduationCap, Target, BookOpen, Calendar, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import QRCode from "qrcode";
import { formToLevel, computeGrade, computePoints } from "@/lib/grading";
import pccLogo from "@/assets/pcc-logo.png";

const SCHOOL_NAME = "PROGRESS CHRISTIAN COLLEGE";
const SCHOOL_ADDRESS = "LOT E Bonnyvale, Shurugwi Road";
const SCHOOL_TEL = "Tel: 2255629";

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

const gradeStyle = (_g: string) => "bg-transparent text-foreground border border-border";


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

  const printExam = (exam: Exam) => {
    if (!profile) return;
    const rs = results[exam.id] || [];
    const level = formToLevel(profile.form);
    const avg = rs.length ? (rs.reduce((a, r) => a + (Number(r.mark) || 0), 0) / rs.length) : 0;
    const totalPts = rs.reduce((a, r) => a + (r.mark != null ? computePoints(Number(r.mark), level, r.subject_code) : 0), 0);
    const a = analytics[exam.id];

    const rows = rs.map(r => {
      const mark = Number(r.mark) || 0;
      const grade = r.mark != null ? computeGrade(mark, level, r.subject_code) : (r.grade || "");
      const pts = r.mark != null ? computePoints(mark, level, r.subject_code) : (r.points ?? 0);
      const ptsCell = level === "alevel" ? `<td style="text-align:center;font-weight:700">${pts}</td>` : "";
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb">
            <div style="font-weight:600;color:#111827">${r.subject_name || r.subject_code}</div>
            <div style="font-size:11px;color:#6b7280">${r.subject_code}</div>
          </td>
          <td style="text-align:center;padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:800;font-size:15px;color:#111827">${r.mark ?? "—"}</td>
          <td style="text-align:center;padding:10px 12px;border-bottom:1px solid #e5e7eb">
            <span style="display:inline-block;min-width:32px;padding:4px 10px;border-radius:6px;font-size:13px;font-weight:800;color:#111827;border:1px solid #d1d5db;background:#fff">${grade}</span>
          </td>
          ${ptsCell}
        </tr>
      `;
    }).join("");

    const ptsHeader = level === "alevel" ? `<th style="text-align:center;padding:12px;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;border-bottom:2px solid #e5e7eb">Points</th>` : "";

    const logoUrl = `${window.location.origin}${pccLogo}`;
    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Results – ${exam.name}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; background: #fff; margin: 0; padding: 0; }
  .certificate { max-width: 780px; margin: 0 auto; padding: 28px; border: 6px double #003366; position: relative; }
  .certificate::before { content: ""; position: absolute; inset: 10px; border: 1px solid #c9a227; pointer-events: none; }
  .header { text-align: center; padding: 8px 0 16px; border-bottom: 2px solid #003366; margin-bottom: 18px; position: relative; }
  .header img.logo { width: 78px; height: 78px; object-fit: contain; margin-bottom: 6px; }
  .header .school { font-family: Georgia, serif; font-size: 22px; font-weight: 700; color: #003366; letter-spacing: 0.08em; margin: 4px 0 2px; }
  .header .addr { font-size: 12px; color: #4b5563; margin: 0; letter-spacing: 0.02em; }
  .header h1 { font-family: Georgia, serif; margin: 14px 0 2px; font-size: 18px; color: #1a1a1a; letter-spacing: 0.14em; text-transform: uppercase; }
  .header .exam-line { font-size: 12px; color: #4b5563; margin-top: 4px; font-style: italic; }
  .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; font-size: 12px; }
  .meta .box { border: 1px solid #d1d5db; border-radius: 4px; padding: 8px 10px; background: #fafaf7; }
  .meta .box .label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; font-family: Georgia, serif; }
  .meta .box .value { font-size: 14px; font-weight: 700; color: #111827; font-family: Georgia, serif; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; font-family: Georgia, serif; }
  th { text-align: left; padding: 9px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #fff; background: #003366; border: 1px solid #003366; }
  td { padding: 9px 10px; border: 1px solid #e5e7eb; font-size: 13px; }
  .summary { margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap; }
  .summary .chip { background: #fafaf7; border: 1px solid #c9a227; border-radius: 3px; padding: 5px 12px; font-size: 11px; font-weight: 600; color: #1a1a1a; font-family: Georgia, serif; }
  .signatures { margin-top: 36px; display: flex; justify-content: space-between; gap: 40px; font-size: 12px; }
  .sig { flex: 1; text-align: center; }
  .sig .line { border-top: 1px solid #1a1a1a; margin-bottom: 4px; padding-top: 4px; }
  .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 10px; font-style: italic; }
  @media print { .no-print { display: none; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="certificate">
  <div class="header">
    <img class="logo" src="${logoUrl}" alt="${SCHOOL_NAME}"/>
    <div class="school">${SCHOOL_NAME}</div>
    <p class="addr">${SCHOOL_ADDRESS} &nbsp;•&nbsp; ${SCHOOL_TEL}</p>
    <h1>Student Academic Report</h1>
    <div class="exam-line">${exam.name} &nbsp;•&nbsp; Term ${exam.term}, ${exam.year} &nbsp;•&nbsp; ${level === "alevel" ? "Advanced Level (Cambridge)" : "IGCSE / O Level"}</div>
  </div>

  <div class="meta">
    <div class="box">
      <div class="label">Student</div>
      <div class="value">${profile.first_name} ${profile.last_name}</div>
    </div>
    <div class="box">
      <div class="label">Reg No</div>
      <div class="value">${profile.registration_number || "—"}</div>
    </div>
    <div class="box">
      <div class="label">Form / Stream</div>
      <div class="value">${profile.form || "—"}${profile.stream ? " / " + profile.stream : ""}</div>
    </div>
    <div class="box">
      <div class="label">Average</div>
      <div class="value">${avg.toFixed(1)}%</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Subject</th>
        <th style="text-align:center;width:90px">Mark</th>
        <th style="text-align:center;width:90px">Grade</th>
        ${ptsHeader}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="summary">
    ${level === "alevel" ? `<div class="chip">Total Points: ${totalPts}</div>` : ""}
    ${a ? `<div class="chip">Class size: ${a.total_students}</div>` : ""}
    ${a ? `<div class="chip">Pass rate: ${Number(a.pass_rate).toFixed(1)}%</div>` : ""}
    ${a ? `<div class="chip">Your rank: #${a.my_rank ?? "—"}</div>` : ""}
    ${a?.top_student_name ? `<div class="chip">Top: ${a.top_student_name}</div>` : ""}
  </div>

  <div class="signatures">
    <div class="sig"><div class="line">Class Teacher</div></div>
    <div class="sig"><div class="line">Principal</div></div>
    <div class="sig"><div class="line">Date</div></div>
  </div>

  <div class="footer">
    This is an official academic report issued by ${SCHOOL_NAME}. Verify authenticity at progresschristiansys.com &nbsp;•&nbsp; Issued ${new Date().toLocaleDateString()}
  </div>
</div>
<script>window.onload = () => { setTimeout(() => window.print(), 400); };</script>
</body>
</html>`;

    const w = window.open("", "_blank", "width=860,height=640");
    if (w) {
      w.document.open();
      w.document.write(html);
      w.document.close();
    }
  };

  if (loading) {
    return <DashboardLayout role="student"><div className="p-12 text-center"><Loader2 className="inline animate-spin mr-2" size={18}/>Loading your results…</div></DashboardLayout>;
  }

  return (
    <DashboardLayout role="student">
      <div className="space-y-6">
        {/* Hero header */}
        <div className="relative overflow-hidden rounded-2xl bg-primary text-primary-foreground p-6 md:p-8 shadow-xl">
          <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-accent/20 blur-3xl" />
          <div className="absolute -left-10 -bottom-10 w-48 h-48 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-xl bg-white/95 p-1.5 shadow-lg flex items-center justify-center shrink-0">
                <img src={pccLogo} alt="Progress Christian College" className="w-full h-full object-contain"/>
              </div>
              <div>
                <div className="text-accent text-[11px] font-semibold tracking-[0.18em] uppercase mb-1">{SCHOOL_NAME}</div>
                <div className="text-primary-foreground/70 text-xs mb-2">{SCHOOL_ADDRESS} · {SCHOOL_TEL}</div>
                <h1 className="text-2xl md:text-3xl font-bold font-serif">
                  {profile ? `${profile.first_name} ${profile.last_name}` : "Your Results"}
                </h1>
                <p className="text-primary-foreground/80 text-sm mt-1 flex items-center gap-3 flex-wrap">
                  {profile?.registration_number && <span className="inline-flex items-center gap-1"><GraduationCap size={14}/> {profile.registration_number}</span>}
                  {profile?.form && <span className="inline-flex items-center gap-1"><BookOpen size={14}/> Form {profile.form}{profile?.stream ? ` · ${profile.stream}` : ""}</span>}
                </p>
              </div>
            </div>
            <div className="rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 px-4 py-3 min-w-[120px]">
              <div className="text-xs text-primary-foreground/70">Exams</div>
              <div className="text-2xl font-bold">{exams.length}</div>
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
          return (
            <Card key={e.id} className="overflow-hidden border-0 shadow-lg hover:shadow-xl transition-shadow">
              {/* Exam header strip */}
              <div className="relative bg-secondary border-b p-5 md:p-6">
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-primary text-primary-foreground w-12 h-12 flex items-center justify-center shadow-md">
                      <Award size={22}/>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg md:text-xl font-bold text-foreground">{e.name}</h2>
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
                      <div className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground shadow-md">
                        <div className="text-[10px] uppercase tracking-wide opacity-80">Points</div>
                        <div className="text-base font-bold">{totalPts}</div>
                      </div>
                    )}
                    <Button variant="outline" size="sm" onClick={() => showQR(e)} className="gap-1.5 bg-background"><QrCode size={14}/> Verify</Button>
                    <Button variant="outline" size="sm" onClick={() => printExam(e)} className="gap-1.5 bg-background"><FileText size={14}/> Print</Button>
                  </div>
                </div>
              </div>

              {/* Analytics cards */}
              {a && (
                <div className="px-5 md:px-6 pt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-xl border bg-secondary/40 p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <div className="w-7 h-7 rounded-md bg-sky-100 text-sky-700 flex items-center justify-center"><Users size={14}/></div>
                      Class size
                    </div>
                    <div className="text-xl font-bold text-foreground">{a.total_students}</div>
                  </div>
                  <div className="rounded-xl border bg-secondary/40 p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <div className="w-7 h-7 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center"><TrendingUp size={14}/></div>
                      Pass rate
                    </div>
                    <div className="text-xl font-bold text-foreground">{Number(a.pass_rate).toFixed(1)}%</div>
                    <Progress value={Number(a.pass_rate)} className="h-1.5 mt-2" />
                  </div>
                  <div className="rounded-xl border bg-secondary/40 p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <div className="w-7 h-7 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center"><Trophy size={14}/></div>
                      Top student
                    </div>
                    <div className="text-sm font-bold text-foreground truncate">{a.top_student_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{a.top_student_avg != null ? `${Number(a.top_student_avg).toFixed(1)}% avg` : ""}</div>
                  </div>
                  <div className="rounded-xl border bg-primary/10 p-4 relative overflow-hidden">
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
                              <span className="font-bold text-foreground text-base">{r.mark ?? "—"}</span>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="inline-flex items-center justify-center min-w-[2.5rem] px-2.5 py-1 rounded-md text-xs font-bold border border-border text-foreground">
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
            <div className="p-4 rounded-2xl bg-secondary border shadow-inner">
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
