import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Printer, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formToLevel, computePoints, isPass } from "@/lib/grading";
import pccLogo from "@/assets/pcc-logo.png";

const SCHOOL_NAME = "PROGRESS CHRISTIAN COLLEGE";
const SCHOOL_ADDRESS = "LOT E Bonnyvale, Shurugwi Road";
const SCHOOL_TEL = "Tel: 2255629";

type Exam = { id: string; name: string; exam_type: string; term: number; year: number; form_levels: number[] };
type Profile = { id: string; first_name: string; last_name: string; registration_number: string | null; form: string | null; stream: string | null };
type Result = { student_profile_id: string; exam_id: string; subject_code: string; mark: number | null };

type Ranked = {
  profile: Profile;
  subjectsCount: number;
  passes: number;
  points: number;
  average: number;
};

const AdminPerformance = () => {
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<Exam[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [form, setForm] = useState<string>("");
  const [stream, setStream] = useState<string>("");
  const [mode, setMode] = useState<"exam" | "term">("exam");
  const [examId, setExamId] = useState<string>("");
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [term, setTerm] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [ranking, setRanking] = useState<Ranked[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: ex }, { data: pf }] = await Promise.all([
        supabase.from("exams").select("id,name,exam_type,term,year,form_levels").order("year", { ascending: false }).order("term", { ascending: false }),
        supabase.from("profiles").select("id,first_name,last_name,registration_number,form,stream").not("form", "is", null),
      ]);
      setExams((ex || []) as Exam[]);
      setProfiles((pf || []) as Profile[]);
      setLoading(false);
    })();
  }, []);

  const forms = useMemo(() => Array.from(new Set(profiles.map(p => p.form).filter(Boolean) as string[])).sort(), [profiles]);

  // Resolve which form codes are active (supports "5+6" combined A-Level)
  const activeForms = useMemo(() => form === "5+6" ? ["5", "6"] : (form ? [form] : []), [form]);

  const streams = useMemo(() => {
    if (!activeForms.length) return [];
    return Array.from(new Set(profiles.filter(p => activeForms.includes(p.form || "")).map(p => p.stream || "").filter(Boolean))).sort();
  }, [profiles, activeForms]);

  const years = useMemo(() => Array.from(new Set(exams.map(e => e.year))).sort((a, b) => b - a), [exams]);
  const terms = useMemo(() => {
    if (!year) return [];
    return Array.from(new Set(exams.filter(e => e.year === Number(year)).map(e => e.term))).sort();
  }, [exams, year]);

  const compute = async () => {
    if (!activeForms.length) return;
    setBusy(true);
    setRanking([]);

    const classProfiles = profiles.filter(p => activeForms.includes(p.form || "") && (!stream || (p.stream || "") === stream));
    if (!classProfiles.length) { setBusy(false); return; }
    const ids = classProfiles.map(p => p.id);

    let query = supabase.from("exam_results").select("student_profile_id,exam_id,subject_code,mark").in("student_profile_id", ids);
    let scopeExams: Exam[] = [];
    if (mode === "exam") {
      if (!examId) { setBusy(false); return; }
      query = query.eq("exam_id", examId);
      scopeExams = exams.filter(e => e.id === examId);
    } else {
      if (!year || !term) { setBusy(false); return; }
      scopeExams = exams.filter(e => e.year === Number(year) && e.term === Number(term));
      if (!scopeExams.length) { setBusy(false); return; }
      query = query.in("exam_id", scopeExams.map(e => e.id));
    }

    const { data: rs } = await query;
    const results = (rs || []) as Result[];

    const level = formToLevel(form);

    const byStudent = new Map<string, Result[]>();
    for (const r of results) {
      if (r.mark == null) continue;
      const arr = byStudent.get(r.student_profile_id) || [];
      arr.push(r);
      byStudent.set(r.student_profile_id, arr);
    }

    const ranked: Ranked[] = classProfiles.map(p => {
      const arr = byStudent.get(p.id) || [];
      const marks = arr.map(r => Number(r.mark));
      const subjectsCount = arr.length;
      const passes = arr.filter(r => isPass(Number(r.mark))).length;
      const points = arr.reduce((a, r) => a + computePoints(Number(r.mark), level, r.subject_code), 0);
      const average = marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : 0;
      return { profile: p, subjectsCount, passes, points, average };
    });

    ranked.sort((a, b) => {
      if (level === "alevel") {
        if (b.points !== a.points) return b.points - a.points;
      } else {
        if (b.passes !== a.passes) return b.passes - a.passes;
      }
      return b.average - a.average;
    });

    setRanking(ranked);
    setBusy(false);
  };

  const scopeLabel = () => {
    if (mode === "exam") {
      const e = exams.find(x => x.id === examId);
      return e ? `${e.name} (Term ${e.term} ${e.year})` : "";
    }
    return `Term ${term} ${year} – Aggregate`;
  };

  const formLabel = form === "5+6" ? "Forms 5 & 6 (A-Level)" : (form ? `Form ${form}` : "");

  const printPDF = () => {
    if (!ranking.length) return;
    const level = formToLevel(activeForms[0] || form);
    const logoUrl = `${window.location.origin}${pccLogo}`;
    const metricHeader = level === "alevel" ? "Total Points" : "Passes (C+)";
    const classLine = `${formLabel}${stream ? " · " + stream : ""}`;

    const rows = ranking.map((r, i) => {
      const pos = i + 1;
      const metric = level === "alevel" ? r.points : `${r.passes}/${r.subjectsCount}`;
      const nameWithForm = activeForms.length > 1
        ? `${r.profile.first_name} ${r.profile.last_name} <span style="color:#6b7280">(F${r.profile.form}${r.profile.stream ? " " + r.profile.stream : ""})</span>`
        : `${r.profile.first_name} ${r.profile.last_name}`;
      return `
        <tr>
          <td style="text-align:center;padding:8px 10px;border-bottom:1px solid #e5e7eb;font-weight:700">${pos}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">${nameWithForm}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">${r.profile.registration_number || ""}</td>
          <td style="text-align:center;padding:8px 10px;border-bottom:1px solid #e5e7eb">${r.subjectsCount}</td>
          <td style="text-align:center;padding:8px 10px;border-bottom:1px solid #e5e7eb;font-weight:800">${metric}</td>
          <td style="text-align:center;padding:8px 10px;border-bottom:1px solid #e5e7eb;font-weight:700">${r.average.toFixed(1)}%</td>
        </tr>`;
    }).join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Class Performance – ${classLine}</title>
      <style>
        @page { size: A4; margin: 18mm; }
        body { font-family: 'Helvetica Neue', Arial, sans-serif; color:#111827; margin:0; padding:0; position:relative; }
        .watermark { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; opacity:.06; z-index:0; }
        .watermark img { width:60%; max-width:520px; }
        .wrap { position:relative; z-index:1; }
        .header { display:flex; align-items:center; gap:16px; border-bottom:3px double #001f4d; padding-bottom:12px; margin-bottom:14px; }
        .header img { width:70px; height:70px; object-fit:contain; }
        .school { font-size:20px; font-weight:800; color:#001f4d; letter-spacing:.5px; }
        .addr { font-size:11px; color:#374151; }
        .title { text-align:center; font-size:16px; font-weight:800; color:#001f4d; margin:14px 0 4px; text-transform:uppercase; letter-spacing:1px; }
        .sub { text-align:center; font-size:12px; color:#374151; margin-bottom:14px; }
        table { width:100%; border-collapse:collapse; font-size:12px; }
        thead th { background:#001f4d; color:#fff; padding:10px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.05em; }
        thead th.c { text-align:center; }
        tfoot td { padding:8px 10px; font-size:11px; color:#6b7280; }
        .meta { display:flex; justify-content:space-between; font-size:12px; margin-bottom:8px; color:#111827; }
        .footer { margin-top:24px; font-size:10px; color:#6b7280; text-align:center; border-top:1px solid #e5e7eb; padding-top:8px; }
      </style></head>
      <body>
        <div class="watermark"><img src="${logoUrl}"/></div>
        <div class="wrap">
          <div class="header">
            <img src="${logoUrl}"/>
            <div>
              <div class="school">${SCHOOL_NAME}</div>
              <div class="addr">${SCHOOL_ADDRESS} • ${SCHOOL_TEL}</div>
            </div>
          </div>
          <div class="title">Class Performance Ranking</div>
          <div class="sub">${classLine} &nbsp;•&nbsp; ${scopeLabel()}</div>
          <div class="meta"><div><strong>Students:</strong> ${ranking.length}</div><div><strong>Printed:</strong> ${new Date().toLocaleString()}</div></div>
          <table>
            <thead><tr>
              <th class="c">Pos</th><th>Student</th><th>Reg #</th>
              <th class="c">Subjects</th><th class="c">${metricHeader}</th><th class="c">Average</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="footer">Generated by ${SCHOOL_NAME} Management System</div>
        </div>
        <script>window.onload=()=>{setTimeout(()=>window.print(),250)}</script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html); w.document.close();
  };

  const level = formToLevel(activeForms[0] || form);
  const metricLabel = level === "alevel" ? "Total Points" : "Passes (C+)";

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Trophy className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Student Performance</h1>
            <p className="text-sm text-muted-foreground">Rank students best to last within a class.</p>
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Class & Scope</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Form</label>
                    <Select value={form} onValueChange={(v) => { setForm(v); setStream(""); setExamId(""); }}>
                      <SelectTrigger><SelectValue placeholder="Select form" /></SelectTrigger>
                      <SelectContent>
                        {forms.map(f => <SelectItem key={f} value={f}>Form {f}</SelectItem>)}
                        {forms.includes("5") && forms.includes("6") && (
                          <SelectItem value="5+6">Forms 5 &amp; 6 (A-Level Combined)</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Stream (optional)</label>
                    <Select value={stream || "__all"} onValueChange={(v) => setStream(v === "__all" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="All streams" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all">All streams</SelectItem>
                        {streams.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
                  <TabsList>
                    <TabsTrigger value="exam">Per Exam</TabsTrigger>
                    <TabsTrigger value="term">Term Aggregate</TabsTrigger>
                  </TabsList>
                  <TabsContent value="exam" className="pt-3">
                    <label className="text-xs font-medium text-muted-foreground">Exam</label>
                    <Select value={examId} onValueChange={setExamId}>
                      <SelectTrigger><SelectValue placeholder="Select exam" /></SelectTrigger>
                      <SelectContent>
                        {exams.filter(e => !activeForms.length || e.form_levels?.some(fl => activeForms.includes(String(fl)))).map(e => (
                          <SelectItem key={e.id} value={e.id}>{e.name} — T{e.term} {e.year} (F{(e.form_levels||[]).join("/")})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TabsContent>
                  <TabsContent value="term" className="pt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Year</label>
                      <Select value={year} onValueChange={(v) => { setYear(v); setTerm(""); }}>
                        <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                        <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Term</label>
                      <Select value={term} onValueChange={setTerm}>
                        <SelectTrigger><SelectValue placeholder="Term" /></SelectTrigger>
                        <SelectContent>{terms.map(t => <SelectItem key={t} value={String(t)}>Term {t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="flex gap-2">
                  <Button onClick={compute} disabled={busy || !activeForms.length || (mode === "exam" ? !examId : (!year || !term))}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Generate Ranking
                  </Button>
                  <Button variant="outline" onClick={printPDF} disabled={!ranking.length}>
                    <Printer className="h-4 w-4 mr-2" /> Print PDF
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {ranking.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Ranking — Form {form}{stream ? ` ${stream}` : ""} · {scopeLabel()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16 text-center">Pos</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Reg #</TableHead>
                    <TableHead className="text-center">Subjects</TableHead>
                    <TableHead className="text-center">{metricLabel}</TableHead>
                    <TableHead className="text-center">Average</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranking.map((r, i) => (
                    <TableRow key={r.profile.id}>
                      <TableCell className="text-center font-bold">{i + 1}</TableCell>
                      <TableCell>{r.profile.first_name} {r.profile.last_name}</TableCell>
                      <TableCell className="font-mono text-xs">{r.profile.registration_number}</TableCell>
                      <TableCell className="text-center">{r.subjectsCount}</TableCell>
                      <TableCell className="text-center font-bold">
                        {level === "alevel" ? r.points : `${r.passes}/${r.subjectsCount}`}
                      </TableCell>
                      <TableCell className="text-center font-bold">{r.average.toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AdminPerformance;
