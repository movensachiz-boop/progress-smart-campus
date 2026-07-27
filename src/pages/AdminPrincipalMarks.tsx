import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableHeader, TableBody, TableCell, TableHead, TableRow, Table } from "@/components/ui/table";
import { Loader2, FileDown, Save, CheckCircle2, EyeOff } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { SUBJECT_CODES, normalizeSubjectCode, formToLevel, computeGrade, getMarkComment } from "@/lib/grading";

type Exam = { id: string; name: string; form_levels: number[]; published: boolean };
type Profile = { id: string; first_name: string; last_name: string; form: string | null; stream: string | null };
type MarksMap = Record<string, Record<string, number | null>>;
type CommentRow = { student_profile_id: string; comment_type: string; author_user_id: string; comment: string };

const studentClassId = (s: { form: string | null; stream: string | null }): string | null => {
  const fn = Number(s.form);
  if (!fn) return null;
  const stream = (s.stream || "").trim();
  if (!stream) return null;
  if (fn >= 5) return `${fn}${stream.charAt(0).toUpperCase()}`;
  return `${fn}${stream}`;
};

const AdminPrincipalMarks = () => {
  const { toast } = useToast();
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState("");
  const [students, setStudents] = useState<Profile[]>([]);
  const [marks, setMarks] = useState<MarksMap>({});
  const [subjectsByClass, setSubjectsByClass] = useState<Record<string, string[]>>({});
  const [activeClass, setActiveClass] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState("");
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [principalComments, setPrincipalComments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || "");
      const { data } = await supabase.from("exams")
        .select("id, name, form_levels, published")
        .order("created_at", { ascending: false });
      const list = (data || []) as Exam[];
      setExams(list);
      if (list.length && !examId) setExamId(list[0].id);
    })();
  }, []);

  const activeExam = exams.find(e => e.id === examId);

  useEffect(() => {
    if (!activeExam) { setStudents([]); setMarks({}); setSubjectsByClass({}); setActiveClass(""); setComments([]); setPrincipalComments({}); return; }
    (async () => {
      setLoading(true);
      const termId = typeof window !== "undefined" ? localStorage.getItem("pcc.selectedTermId") : null;
      const [{ data: profs }, { data: snaps }, { data: rows }, { data: cm }] = await Promise.all([
        supabase.from("profiles").select("id, first_name, last_name, form, stream").order("last_name"),
        termId
          ? supabase.from("student_class_terms").select("student_profile_id, form, stream").eq("term_id", termId)
          : Promise.resolve({ data: [] as any[] }) as any,
        supabase.from("exam_results").select("student_profile_id, subject_code, mark").eq("exam_id", examId),
        (supabase as any).from("exam_comments")
          .select("student_profile_id, comment_type, author_user_id, comment")
          .eq("exam_id", examId),
      ]);
      const snapMap = new Map<string, { form: string | null; stream: string | null }>();
      (snaps || []).forEach((r: any) => snapMap.set(r.student_profile_id, { form: r.form, stream: r.stream }));
      const formLevels = activeExam.form_levels.map(String);
      const profList = ((profs || []) as Profile[]).map(p => {
        const t = snapMap.get(p.id);
        return t ? { ...p, form: t.form ?? p.form, stream: t.stream ?? p.stream } : p;
      }).filter(p => p.form && formLevels.includes(String(p.form)));
      setStudents(profList);
      const m: MarksMap = {};
      const byClass: Record<string, Set<string>> = {};
      const studentClass = new Map<string, string>();
      profList.forEach(p => { const c = studentClassId(p); if (c) studentClass.set(p.id, c); });
      for (const r of (rows || []) as any[]) {
        const sid = r.student_profile_id;
        const code = normalizeSubjectCode(r.subject_code);
        if (r.mark == null) continue;
        if (!m[sid]) m[sid] = {};
        m[sid][code] = Number(r.mark);
        const cls = studentClass.get(sid);
        if (cls) {
          if (!byClass[cls]) byClass[cls] = new Set();
          byClass[cls].add(code);
        }
      }
      setMarks(m);
      const out: Record<string, string[]> = {};
      Object.keys(byClass).sort().forEach(c => { out[c] = Array.from(byClass[c]).sort(); });
      setSubjectsByClass(out);
      const classes = Object.keys(out);
      setActiveClass(classes[0] || "");
      const cmRows = (cm || []) as CommentRow[];
      setComments(cmRows);
      const pmap: Record<string, string> = {};
      cmRows.filter(r => r.comment_type === "principal").forEach(r => { pmap[r.student_profile_id] = r.comment || ""; });
      setPrincipalComments(pmap);
      setLoading(false);
    })();
  }, [examId, activeExam]);

  const classList = useMemo(() => Object.keys(subjectsByClass), [subjectsByClass]);
  const classStudents = useMemo(
    () => {
      const base = students.filter(s => studentClassId(s) === activeClass);
      const q = searchQuery.trim().toLowerCase();
      if (!q) return base;
      return base.filter(s =>
        `${s.last_name} ${s.first_name}`.toLowerCase().includes(q) ||
        `${s.first_name} ${s.last_name}`.toLowerCase().includes(q));
    },
    [students, activeClass, searchQuery],
  );
  const classSubjects = subjectsByClass[activeClass] || [];

  // Comments grouped for each student
  const commentsByStudent = useMemo(() => {
    const map: Record<string, { subject: string[]; classTeacher: string[]; principal: string[] }> = {};
    comments.forEach(r => {
      const bucket = map[r.student_profile_id] ||= { subject: [], classTeacher: [], principal: [] };
      const txt = (r.comment || "").trim();
      if (!txt) return;
      if (r.comment_type === "subject_teacher") bucket.subject.push(txt);
      else if (r.comment_type === "class_teacher") bucket.classTeacher.push(txt);
      else if (r.comment_type === "principal") bucket.principal.push(txt);
    });
    return map;
  }, [comments]);

  const savePrincipalComments = async () => {
    if (!activeExam || !userId || !classStudents.length) return;
    setSaving(true);
    const payload = classStudents.map(s => ({
      exam_id: activeExam.id,
      student_profile_id: s.id,
      comment_type: "principal",
      author_user_id: userId,
      comment: principalComments[s.id] || "",
    }));
    const { error } = await (supabase as any).from("exam_comments")
      .upsert(payload, { onConflict: "exam_id,student_profile_id,comment_type,author_user_id" });
    setSaving(false);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: `Saved ${payload.length} principal comment(s)` });
  };

  const downloadPdf = () => {
    if (!activeExam || !activeClass) return toast({ title: "Choose exam and class", variant: "destructive" });
    if (!classSubjects.length || !classStudents.length) return toast({ title: "Nothing to export", variant: "destructive" });
    const doc = new jsPDF({ orientation: classSubjects.length > 4 ? "landscape" : "portrait", unit: "pt", format: "a4" });
    doc.setFontSize(14); doc.text(`${activeExam.name} — Combined Mark Schedule`, 40, 40);
    doc.setFontSize(10); doc.text(`Class: ${activeClass}`, 40, 58);
    const head = [["#", "Student", ...classSubjects.flatMap(c => [c, "Gr"])]];
    const body = classStudents.map((s, i) => {
      const level = formToLevel(s.form);
      const row = marks[s.id] || {};
      const cells: (string | number)[] = [i + 1, `${s.last_name} ${s.first_name}`];
      for (const c of classSubjects) {
        const mk = row[c];
        cells.push(mk == null ? "" : String(mk));
        cells.push(mk == null ? "" : computeGrade(mk, level, c));
      }
      return cells;
    });
    autoTable(doc, {
      head, body, startY: 72,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [0, 51, 102], textColor: 255 },
      columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 140 } },
    });

    // Per-student comments page(s)
    for (const s of classStudents) {
      const level = formToLevel(s.form);
      const row = marks[s.id] || {};
      const buckets = commentsByStudent[s.id] || { subject: [], classTeacher: [], principal: [] };
      doc.addPage();
      doc.setFontSize(14);
      doc.text(`${s.last_name} ${s.first_name} — ${activeExam.name}`, 40, 40);
      doc.setFontSize(10);
      doc.text(`Class: ${activeClass}`, 40, 58);

      // Per-subject automatic remarks
      const subjectRows = classSubjects.map(c => {
        const mk = row[c];
        return [
          SUBJECT_CODES[c] || c,
          mk == null ? "—" : String(mk),
          mk == null ? "" : computeGrade(mk, level, c),
          mk == null ? "" : getMarkComment(mk, c),
        ];
      });
      autoTable(doc, {
        head: [["Subject", "Mark", "Grade", "Auto Remark"]],
        body: subjectRows,
        startY: 72,
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [0, 51, 102], textColor: 255 },
      });
      let y = (doc as any).lastAutoTable.finalY + 12;

      const writeBlock = (title: string, lines: string[]) => {
        if (y > 760) { doc.addPage(); y = 40; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(0, 51, 102);
        doc.text(title, 40, y);
        y += 4;
        doc.setDrawColor(200);
        doc.line(40, y, 555, y);
        y += 8;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(30);
        const body = lines.length ? lines : ["—"];
        for (const t of body) {
          const wrapped = doc.splitTextToSize(`• ${t}`, 500);
          doc.text(wrapped, 46, y);
          y += wrapped.length * 12 + 2;
          if (y > 780) { doc.addPage(); y = 40; }
        }
        y += 8;
      };

      writeBlock("Subject Teacher Comments", buckets.subject);
      writeBlock("Class Teacher Comment", buckets.classTeacher);
      writeBlock("Principal's Comment", buckets.principal);
    }

    doc.save(`${activeExam.name.replace(/\s+/g, "_")}_${activeClass}_combined.pdf`);
  };

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Principal — Combined Mark Schedules</h1>
          <p className="text-muted-foreground text-sm">
            One consolidated mark schedule per class, auto-combined from every teacher's submitted marks. Write your overall comment for each student — it appears on the printed report alongside the class-teacher and subject-teacher comments.
          </p>
        </div>

        <Card>
          <CardContent className="p-4 flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[220px]">
              <Label>Exam {activeExam && (
                <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full ${activeExam.published ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                  {activeExam.published ? "APPROVED" : "PENDING APPROVAL"}
                </span>
              )}</Label>
              <Select value={examId} onValueChange={setExamId}>
                <SelectTrigger><SelectValue placeholder="Select exam" /></SelectTrigger>
                <SelectContent>
                  {exams.map(e => <SelectItem key={e.id} value={e.id}>{e.name}{e.published ? "" : " (pending)"}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <Label>Class</Label>
              <Select value={activeClass} onValueChange={setActiveClass} disabled={!classList.length}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {classList.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label>Search student</Label>
              <Input placeholder="Type name…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <Button onClick={savePrincipalComments} variant="outline" disabled={saving || !classStudents.length} className="gap-2">
              {saving ? <Loader2 className="animate-spin w-4 h-4"/> : <Save className="w-4 h-4"/>} Save Comments
            </Button>
            {activeExam && (
              <Button
                onClick={async () => {
                  const next = !activeExam.published;
                  const { error } = await supabase.from("exams").update({ published: next }).eq("id", activeExam.id);
                  if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
                  setExams(prev => prev.map(e => e.id === activeExam.id ? { ...e, published: next } : e));
                  toast({ title: next ? "Approved — results now visible to students" : "Unapproved — results hidden from students" });
                }}
                variant={activeExam.published ? "secondary" : "default"}
                className="gap-2"
              >
                {activeExam.published ? <><EyeOff className="w-4 h-4"/> Unapprove</> : <><CheckCircle2 className="w-4 h-4"/> Approve & Release</>}
              </Button>
            )}
            <Button onClick={downloadPdf} disabled={!activeClass}>
              <FileDown className="w-4 h-4 mr-2" /> Download PDF
            </Button>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div>
        ) : !activeExam ? (
          <p className="text-muted-foreground">Select an exam to view combined schedules.</p>
        ) : !classList.length ? (
          <p className="text-muted-foreground">No marks captured yet for this exam.</p>
        ) : (
          <>
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead className="min-w-[180px]">Student</TableHead>
                      {classSubjects.map(c => (
                        <TableHead key={c} className="text-center min-w-[90px]">
                          <div className="font-semibold">{c}</div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {SUBJECT_CODES[c] || ""}
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {classStudents.map((s, i) => {
                      const level = formToLevel(s.form);
                      const row = marks[s.id] || {};
                      return (
                        <TableRow key={s.id}>
                          <TableCell>{i + 1}</TableCell>
                          <TableCell className="font-medium">{s.last_name} {s.first_name}</TableCell>
                          {classSubjects.map(c => {
                            const mk = row[c];
                            return (
                              <TableCell key={c} className="text-center">
                                {mk == null ? <span className="text-muted-foreground">—</span> : (
                                  <div>
                                    <div className="font-semibold">{mk}</div>
                                    <div className="text-[10px] text-muted-foreground">{computeGrade(mk, level, c)}</div>
                                  </div>
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold">Principal's Comments</h3>
                <p className="text-xs text-muted-foreground">One overall comment per student. Included on the downloaded PDF report.</p>
                <div className="grid gap-2">
                  {classStudents.map(s => {
                    const buckets = commentsByStudent[s.id] || { subject: [], classTeacher: [], principal: [] };
                    return (
                      <div key={s.id} className="flex items-start gap-3 border rounded-md p-2">
                        <div className="min-w-[200px] w-[200px]">
                          <div className="font-medium text-sm">{s.last_name} {s.first_name}</div>
                          <div className="text-xs text-muted-foreground">F{s.form} {s.stream}</div>
                        </div>
                        <div className="flex-1 space-y-2">
                          {buckets.classTeacher.length > 0 && (
                            <div className="text-xs bg-blue-50 border border-blue-200 rounded p-2">
                              <span className="font-semibold text-blue-900">Class teacher: </span>
                              <span className="text-blue-900">{buckets.classTeacher.join(" • ")}</span>
                            </div>
                          )}
                          {buckets.subject.length > 0 && (
                            <div className="text-xs bg-slate-50 border rounded p-2">
                              <span className="font-semibold">Subject teachers: </span>
                              <span>{buckets.subject.join(" • ")}</span>
                            </div>
                          )}
                          <Textarea
                            rows={2}
                            placeholder="Overall principal's comment for this student…"
                            value={principalComments[s.id] || ""}
                            onChange={(e) => setPrincipalComments(prev => ({ ...prev, [s.id]: e.target.value }))}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AdminPrincipalMarks;
