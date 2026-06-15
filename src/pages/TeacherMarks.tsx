import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Save, Camera, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import CameraCaptureDialog from "@/components/CameraCaptureDialog";
import PhoneCameraPairDialog from "@/components/PhoneCameraPairDialog";
import {
  SUBJECT_CODES, normalizeSubjectCode, formToLevel, computeGrade, computePoints,
} from "@/lib/grading";
import { useTimetable } from "@/context/TimetableContext";

type Exam = { id: string; name: string; form_levels: number[]; published: boolean };
type Profile = { id: string; first_name: string; last_name: string; form: string | null; stream: string | null };
// marks[studentId][subjectCode] = mark
type MarksMap = Record<string, Record<string, number | null>>;

const TeacherMarks = () => {
  const { toast } = useToast();
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState("");
  const [students, setStudents] = useState<Profile[]>([]);
  const [marks, setMarks] = useState<MarksMap>({});
  const [subjects, setSubjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [phonePairOpen, setPhonePairOpen] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [lastMatched, setLastMatched] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("exams").select("id, name, form_levels, published").order("created_at", { ascending: false });
      setExams((data || []) as Exam[]);
    })();
  }, []);

  const activeExam = exams.find(e => e.id === examId);

  useEffect(() => {
    if (!activeExam) { setStudents([]); setMarks({}); setSubjects([]); return; }
    (async () => {
      setLoading(true);
      const [{ data: profs }, { data: rows }] = await Promise.all([
        supabase.from("profiles").select("id, first_name, last_name, form, stream")
          .in("form", activeExam.form_levels.map(String)).order("last_name"),
        supabase.from("exam_results").select("student_profile_id, subject_code, mark").eq("exam_id", examId),
      ]);
      setStudents((profs || []) as Profile[]);
      const m: MarksMap = {};
      const subjSet = new Set<string>();
      for (const r of (rows || []) as any[]) {
        const sid = r.student_profile_id;
        const code = normalizeSubjectCode(r.subject_code);
        if (!m[sid]) m[sid] = {};
        m[sid][code] = r.mark != null ? Number(r.mark) : null;
        subjSet.add(code);
      }
      setMarks(m);
      setSubjects([...subjSet].sort());
      setLastMatched(new Set());
      setLoading(false);
    })();
  }, [examId, activeExam]);

  const saveAll = async () => {
    if (!activeExam) return;
    setSaving(true);
    const payload: any[] = [];
    for (const s of students) {
      const level = formToLevel(s.form);
      const row = marks[s.id] || {};
      for (const code of Object.keys(row)) {
        const mark = row[code];
        if (mark == null || isNaN(mark as number)) continue;
        payload.push({
          exam_id: examId, student_profile_id: s.id, subject_code: code,
          subject_name: SUBJECT_CODES[code] || code, mark,
          grade: computeGrade(mark, level), points: computePoints(mark, level),
        });
      }
    }
    if (!payload.length) {
      setSaving(false);
      return toast({ title: "Nothing to save", variant: "destructive" });
    }
    const { error } = await supabase.from("exam_results")
      .upsert(payload, { onConflict: "exam_id,student_profile_id,subject_code" });
    setSaving(false);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: `Saved ${payload.length} marks` });
    setLastMatched(new Set());
  };

  const handleCapture = async (dataUrl: string) => {
    setScanOpen(false);
    if (!activeExam) {
      toast({ title: "Choose an exam first", variant: "destructive" });
      return;
    }
    setOcrLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-marks", { body: { imageBase64: dataUrl } });
      if (error) throw error;
      const { students: rows, subject_codes } = data as {
        students: { name: string; marks: Record<string, number> }[];
        subject_codes?: string[];
      };

      const nextMarks: MarksMap = JSON.parse(JSON.stringify(marks));
      const subjSet = new Set<string>(subjects);
      const matched = new Set<string>();
      let matchedCount = 0;
      let cellCount = 0;

      for (const r of rows) {
        const target = (r.name || "").toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
        if (!target) continue;
        const s = students.find(p => {
          const full = `${p.first_name} ${p.last_name}`.toLowerCase().trim();
          const rev = `${p.last_name} ${p.first_name}`.toLowerCase().trim();
          return full === target || rev === target ||
            full.includes(target) || target.includes(full) ||
            rev.includes(target) || target.includes(rev);
        });
        if (!s) continue;
        matched.add(s.id);
        matchedCount++;
        if (!nextMarks[s.id]) nextMarks[s.id] = {};
        for (const [rawCode, val] of Object.entries(r.marks || {})) {
          if (val == null) continue;
          const code = normalizeSubjectCode(rawCode);
          nextMarks[s.id][code] = Number(val);
          subjSet.add(code);
          cellCount++;
        }
      }

      (subject_codes || []).forEach(c => subjSet.add(normalizeSubjectCode(c)));

      setMarks(nextMarks);
      setSubjects([...subjSet].sort());
      setLastMatched(matched);
      toast({
        title: "Scan complete",
        description: `Matched ${matchedCount} students, ${cellCount} marks. Review highlighted rows then click Save All.`,
      });
    } catch (err: any) {
      toast({ title: "OCR failed", description: err.message, variant: "destructive" });
    } finally {
      setOcrLoading(false);
    }
  };

  const updateMark = (sid: string, code: string, val: string) => {
    setMarks(prev => ({
      ...prev,
      [sid]: { ...(prev[sid] || {}), [code]: val === "" ? null : Number(val) },
    }));
  };

  const addSubject = () => {
    const raw = prompt("Add subject code (e.g. MAT, CHE, PHY)");
    if (!raw) return;
    const code = normalizeSubjectCode(raw);
    if (!subjects.includes(code)) setSubjects([...subjects, code].sort());
  };

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Enter Marks</h2>

        <Card>
          <CardContent className="p-4 flex flex-wrap gap-3 items-end">
            <div className="min-w-[260px]">
              <Label>Exam</Label>
              <Select value={examId} onValueChange={setExamId}>
                <SelectTrigger><SelectValue placeholder="Select exam"/></SelectTrigger>
                <SelectContent>{exams.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button onClick={() => setScanOpen(true)} variant="outline" className="gap-2" disabled={!activeExam || ocrLoading}>
              {ocrLoading ? <Loader2 className="animate-spin" size={14}/> : <Camera size={14}/>} Scan Mark Sheet
            </Button>
            <Button onClick={() => setPhonePairOpen(true)} variant="outline" className="gap-2" disabled={!activeExam || ocrLoading} title="Scan QR with phone to capture from phone camera">
              <Camera size={14}/> Use Phone Camera
            </Button>
            <Button onClick={addSubject} variant="outline" disabled={!activeExam}>+ Subject Column</Button>
            <Button onClick={saveAll} className="gap-2" disabled={!activeExam || saving}>
              {saving ? <Loader2 className="animate-spin" size={14}/> : <Save size={14}/>} Save All
            </Button>
          </CardContent>
        </Card>

        {ocrLoading && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            <Loader2 className="inline animate-spin mr-2" size={14}/> Reading marks from the sheet…
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center"><Loader2 className="inline animate-spin mr-2" size={16}/>Loading…</div>
        ) : students.length > 0 && (
          <Card>
            <CardContent className="p-0 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background z-10 min-w-[200px]">Student</TableHead>
                    {subjects.map(code => (
                      <TableHead key={code} className="text-center w-20" title={SUBJECT_CODES[code] || code}>
                        {code}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map(s => {
                    const level = formToLevel(s.form);
                    const row = marks[s.id] || {};
                    const isMatched = lastMatched.has(s.id);
                    return (
                      <TableRow key={s.id} className={isMatched ? "bg-green-50 dark:bg-green-950/20" : ""}>
                        <TableCell className="sticky left-0 bg-background z-10">
                          {isMatched && <CheckCircle2 className="inline mr-1 text-green-600" size={12}/>}
                          {s.last_name} {s.first_name}{" "}
                          <span className="text-xs text-muted-foreground">F{s.form} {s.stream}</span>
                        </TableCell>
                        {subjects.map(code => {
                          const m = row[code];
                          const grade = m != null ? computeGrade(m, level) : "";
                          return (
                            <TableCell key={code} className="p-1 text-center">
                              <Input
                                type="number" min={0} max={100}
                                className="h-8 text-center text-sm"
                                value={m ?? ""}
                                onChange={(e) => updateMark(s.id, code, e.target.value)}
                              />
                              {grade && <div className="text-[10px] text-muted-foreground mt-0.5">{grade}</div>}
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

      <CameraCaptureDialog open={scanOpen} onOpenChange={setScanOpen} onCapture={handleCapture}
        title="Scan Mark Sheet" description="Capture the whole grid — names and all subject columns. Marks for every student & subject will auto-fill."/>
      <PhoneCameraPairDialog
        open={phonePairOpen}
        onOpenChange={setPhonePairOpen}
        onPhotos={async (photos) => { if (photos[0]) await handleCapture(photos[0]); }}
        title="Use Phone Camera for Mark Sheet"
      />
    </DashboardLayout>
  );
};

export default TeacherMarks;
