import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Save, Camera } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import CameraCaptureDialog from "@/components/CameraCaptureDialog";
import {
  SUBJECT_CODES, normalizeSubjectCode, formToLevel, computeGrade, computePoints,
} from "@/lib/grading";

type Exam = { id: string; name: string; form_levels: number[]; published: boolean };
type Profile = { id: string; first_name: string; last_name: string; form: string | null; stream: string | null };

const TeacherMarks = () => {
  const { toast } = useToast();
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [students, setStudents] = useState<Profile[]>([]);
  const [marks, setMarks] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("exams").select("id, name, form_levels, published").order("created_at", { ascending: false });
      setExams((data || []) as Exam[]);
    })();
  }, []);

  const activeExam = exams.find(e => e.id === examId);

  useEffect(() => {
    if (!activeExam || !subjectCode) { setStudents([]); setMarks({}); return; }
    (async () => {
      setLoading(true);
      const code = normalizeSubjectCode(subjectCode);
      const [{ data: profs }, { data: rows }] = await Promise.all([
        supabase.from("profiles").select("id, first_name, last_name, form, stream")
          .in("form", activeExam.form_levels.map(String)).order("last_name"),
        supabase.from("exam_results").select("student_profile_id, mark").eq("exam_id", examId).eq("subject_code", code),
      ]);
      setStudents((profs || []) as Profile[]);
      const m: Record<string, number | null> = {};
      for (const r of (rows || []) as any[]) m[r.student_profile_id] = r.mark != null ? Number(r.mark) : null;
      setMarks(m);
      setLoading(false);
    })();
  }, [examId, subjectCode, activeExam]);

  const save = async () => {
    if (!activeExam || !subjectCode) return;
    const code = normalizeSubjectCode(subjectCode);
    setSaving(true);
    const payload = students
      .filter(s => marks[s.id] != null && !isNaN(marks[s.id] as number))
      .map(s => {
        const level = formToLevel(s.form);
        const mark = marks[s.id] as number;
        const grade = computeGrade(mark, level);
        return {
          exam_id: examId, student_profile_id: s.id, subject_code: code,
          subject_name: SUBJECT_CODES[code] || code, mark, grade, points: computePoints(mark, level),
        };
      });
    const { error } = await supabase.from("exam_results")
      .upsert(payload, { onConflict: "exam_id,student_profile_id,subject_code" });
    setSaving(false);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: `Saved ${payload.length} marks` });
  };

  const handleCapture = async (dataUrl: string) => {
    setScanOpen(false);
    if (!activeExam || !subjectCode) {
      toast({ title: "Choose exam & subject first", variant: "destructive" });
      return;
    }
    setOcrLoading(true);
    try {
      const code = normalizeSubjectCode(subjectCode);
      const { data, error } = await supabase.functions.invoke("extract-marks", { body: { imageBase64: dataUrl } });
      if (error) throw error;
      const { students: rows } = data as { students: { name: string; marks: Record<string, number> }[] };
      const next = { ...marks };
      let matched = 0;
      for (const r of rows) {
        const target = r.name.toLowerCase().replace(/[^a-z\s]/g, "").trim();
        const s = students.find(p => {
          const full = `${p.first_name} ${p.last_name}`.toLowerCase();
          const rev = `${p.last_name} ${p.first_name}`.toLowerCase();
          return full === target || rev === target || full.includes(target) || target.includes(full);
        });
        if (!s) continue;
        const mark = r.marks?.[code] ?? r.marks?.[normalizeSubjectCode(subjectCode)] ?? Object.values(r.marks || {})[0];
        if (mark == null) continue;
        next[s.id] = Number(mark);
        matched++;
      }
      setMarks(next);
      toast({ title: "OCR complete", description: `Matched ${matched} students. Review then save.` });
    } catch (err: any) {
      toast({ title: "OCR failed", description: err.message, variant: "destructive" });
    } finally {
      setOcrLoading(false);
    }
  };

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Enter Marks</h2>
        <Card>
          <CardContent className="p-4 flex flex-wrap gap-3 items-end">
            <div className="min-w-[240px]">
              <Label>Exam</Label>
              <Select value={examId} onValueChange={setExamId}>
                <SelectTrigger><SelectValue placeholder="Select exam"/></SelectTrigger>
                <SelectContent>{exams.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="w-44">
              <Label>Subject Code</Label>
              <Input value={subjectCode} onChange={(e) => setSubjectCode(e.target.value)} placeholder="e.g. MAT, BUS"/>
            </div>
            <Button onClick={() => setScanOpen(true)} variant="outline" className="gap-2" disabled={!activeExam || !subjectCode || ocrLoading}>
              {ocrLoading ? <Loader2 className="animate-spin" size={14}/> : <Camera size={14}/>} Scan
            </Button>
            <Button onClick={save} className="gap-2" disabled={!activeExam || !subjectCode || saving}>
              {saving ? <Loader2 className="animate-spin" size={14}/> : <Save size={14}/>} Save
            </Button>
          </CardContent>
        </Card>

        {loading ? <div className="p-8 text-center"><Loader2 className="inline animate-spin mr-2" size={16}/>Loading…</div>
          : students.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead className="w-32 text-center">Mark</TableHead>
                    <TableHead className="w-24 text-center">Grade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map(s => {
                    const level = formToLevel(s.form);
                    const m = marks[s.id];
                    return (
                      <TableRow key={s.id}>
                        <TableCell>{s.last_name} {s.first_name} <span className="text-xs text-muted-foreground">F{s.form} {s.stream}</span></TableCell>
                        <TableCell className="p-1">
                          <Input type="number" min={0} max={100} className="h-8 text-center"
                            value={m ?? ""} onChange={(e) => setMarks({ ...marks, [s.id]: e.target.value === "" ? null : Number(e.target.value) })}/>
                        </TableCell>
                        <TableCell className="text-center">{m != null ? computeGrade(m, level) : ""}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <CameraCaptureDialog open={scanOpen} onOpenChange={setScanOpen} onCapture={handleCapture}
        title="Scan Mark Sheet" description="Capture the column for this subject; we'll match each student row."/>
    </DashboardLayout>
  );
};

export default TeacherMarks;
