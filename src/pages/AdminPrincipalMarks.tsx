import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableHeader, TableBody, TableCell, TableHead, TableRow, Table } from "@/components/ui/table";
import { Loader2, FileDown } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { SUBJECT_CODES, normalizeSubjectCode, formToLevel, computeGrade } from "@/lib/grading";

type Exam = { id: string; name: string; form_levels: number[]; published: boolean };
type Profile = { id: string; first_name: string; last_name: string; form: string | null; stream: string | null };
type MarksMap = Record<string, Record<string, number | null>>;

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

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("exams")
        .select("id, name, form_levels, published")
        .order("created_at", { ascending: false });
      setExams((data || []) as Exam[]);
    })();
  }, []);

  const activeExam = exams.find(e => e.id === examId);

  useEffect(() => {
    if (!activeExam) { setStudents([]); setMarks({}); setSubjectsByClass({}); setActiveClass(""); return; }
    (async () => {
      setLoading(true);
      const [{ data: profs }, { data: rows }] = await Promise.all([
        supabase.from("profiles").select("id, first_name, last_name, form, stream")
          .in("form", activeExam.form_levels.map(String)).order("last_name"),
        supabase.from("exam_results").select("student_profile_id, subject_code, mark").eq("exam_id", examId),
      ]);
      const profList = (profs || []) as Profile[];
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
      setLoading(false);
    })();
  }, [examId, activeExam]);

  const classList = useMemo(() => Object.keys(subjectsByClass), [subjectsByClass]);
  const classStudents = useMemo(
    () => students.filter(s => studentClassId(s) === activeClass),
    [students, activeClass],
  );
  const classSubjects = subjectsByClass[activeClass] || [];

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
    doc.save(`${activeExam.name.replace(/\s+/g, "_")}_${activeClass}_combined.pdf`);
  };

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Principal — Combined Mark Schedules</h1>
          <p className="text-muted-foreground text-sm">
            One consolidated mark schedule per class, auto-combined from every teacher's submitted marks.
          </p>
        </div>

        <Card>
          <CardContent className="p-4 flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[220px]">
              <Label>Exam</Label>
              <Select value={examId} onValueChange={setExamId}>
                <SelectTrigger><SelectValue placeholder="Select exam" /></SelectTrigger>
                <SelectContent>
                  {exams.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
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
        )}
      </div>
    </DashboardLayout>
  );
};

export default AdminPrincipalMarks;
