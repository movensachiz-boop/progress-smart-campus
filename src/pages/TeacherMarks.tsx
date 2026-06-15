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
import { bestFuzzyMatch, nameKey } from "@/lib/normalize";

type Exam = { id: string; name: string; form_levels: number[]; published: boolean };
type Profile = { id: string; first_name: string; last_name: string; form: string | null; stream: string | null };
// marks[studentId][subjectCode] = mark
type MarksMap = Record<string, Record<string, number | null>>;

const parseMarkValue = (value: unknown): number | null => {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.min(100, Math.round(value)));
  const match = String(value).match(/\d{1,3}/);
  if (!match) return null;
  const mark = Number(match[0]);
  if (!Number.isFinite(mark)) return null;
  return Math.max(0, Math.min(100, mark));
};

const TeacherMarks = () => {
  const { toast } = useToast();
  const { subjects: ttSubjects } = useTimetable();
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
      // Pre-populate columns from the Subjects module for this exam's form levels
      for (const sb of ttSubjects) {
        const inForm = (sb.forms || []).some((f: any) => activeExam.form_levels.includes(Number(f)));
        if (inForm && sb.code) subjSet.add(normalizeSubjectCode(sb.code));
      }
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
      const expectedSubjectCodes = Array.from(new Set([
        ...subjects,
        ...students.flatMap((s) => subjectsForStudent(s).map((sub) => sub.code)),
      ]));
      const expectedStudents = students.map((s) => ({
        name: `${s.last_name} ${s.first_name}`.trim(),
        form: s.form,
        stream: s.stream,
        subjects: subjectsForStudent(s).map((sub) => sub.code),
      }));
      const { data, error } = await supabase.functions.invoke("extract-marks", {
        body: { imageBase64: dataUrl, expectedStudents, expectedSubjectCodes },
      });
      if (error) throw error;
      const { students: rows, subject_codes, form_level } = data as {
        students: { name: string; marks: Record<string, number> }[];
        subject_codes?: string[];
        form_level?: number | null;
      };

      const nextMarks: MarksMap = JSON.parse(JSON.stringify(marks));
      const subjSet = new Set<string>(subjects);
      const matched = new Set<string>();
      let matchedCount = 0;
      let cellCount = 0;
      const scanCandidates = form_level
        ? students.filter((p) => Number(p.form) === Number(form_level))
        : students;
      const matchCandidates = scanCandidates.length ? scanCandidates : students;

      for (const r of rows) {
        const target = nameKey(r.name || "");
        if (!target) continue;
        const s = matchCandidates.find(p => {
          const full = nameKey(`${p.first_name} ${p.last_name}`);
          const rev = nameKey(`${p.last_name} ${p.first_name}`);
          return full === target || rev === target ||
            full.includes(target) || target.includes(full) ||
            rev.includes(target) || target.includes(rev);
        }) || bestFuzzyMatch(r.name || "", matchCandidates, (p) => `${p.last_name} ${p.first_name}`, 4);
        if (!s) continue;
        matched.add(s.id);
        matchedCount++;
        if (!nextMarks[s.id]) nextMarks[s.id] = {};
        for (const [rawCode, val] of Object.entries(r.marks || {})) {
          const mark = parseMarkValue(val);
          if (mark == null) continue;
          const code = normalizeSubjectCode(rawCode);
          nextMarks[s.id][code] = mark;
          subjSet.add(code);
          cellCount++;
        }
      }

      (subject_codes || []).forEach(c => subjSet.add(normalizeSubjectCode(c)));

      setMarks(nextMarks);
      setSubjects([...subjSet].sort());
      setLastMatched(matched);
      const formNote = form_level ? ` Detected Form ${form_level}${form_level === 5 ? " (Lower 6)" : form_level === 6 ? " (Upper 6)" : ""}.` : "";
      const formMismatch = form_level && activeExam && !activeExam.form_levels.includes(form_level)
        ? ` The scanned sheet is Form ${form_level}, but the selected exam is for Form ${activeExam.form_levels.join(", ")}.`
        : "";
      toast({
        title: "Scan complete",
        description: `Matched ${matchedCount} students, ${cellCount} marks.${formNote}${formMismatch} Review highlighted rows then click Save All.`,
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

  // Per-student subjects derived from the Subjects module (form + learning area/stream)
  const subjectsForStudent = (s: Profile): { code: string; name: string }[] => {
    const fn = Number(s.form);
    if (!fn) return [];
    const stream = (s.stream || "").trim().toLowerCase();
    const list = ttSubjects.filter((sb: any) => {
      if (!(sb.forms || []).map(Number).includes(fn)) return false;
      if (sb.learningAreas && sb.learningAreas.length > 0) {
        if (!stream) return false;
        return sb.learningAreas.some((la: string) => la.toLowerCase() === stream);
      }
      return true;
    });
    const map = new Map<string, string>();
    list.forEach((sb: any) => {
      const code = normalizeSubjectCode(sb.code || sb.name);
      if (code) map.set(code, sb.name || code);
    });
    // Include any extra codes already saved for this student
    Object.keys(marks[s.id] || {}).forEach(c => {
      if (!map.has(c)) map.set(c, SUBJECT_CODES[c] || c);
    });
    return [...map.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code));
  };

  const addSubjectForStudent = (sid: string) => {
    const raw = prompt("Add subject code (e.g. MAT, CHE, PHY)");
    if (!raw) return;
    const code = normalizeSubjectCode(raw);
    setMarks(prev => ({ ...prev, [sid]: { ...(prev[sid] || {}), [code]: prev[sid]?.[code] ?? null } }));
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
          <div className="space-y-3">
            {students.map(s => {
              const level = formToLevel(s.form);
              const row = marks[s.id] || {};
              const isMatched = lastMatched.has(s.id);
              const studentSubs = subjectsForStudent(s);
              return (
                <Card key={s.id} className={isMatched ? "border-green-500/50" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                      <div className="font-semibold">
                        {isMatched && <CheckCircle2 className="inline mr-1 text-green-600" size={14}/>}
                        {s.last_name} {s.first_name}
                        <span className="ml-2 text-xs text-muted-foreground">F{s.form} {s.stream}</span>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => addSubjectForStudent(s.id)}>+ Subject</Button>
                    </div>
                    {studentSubs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No subjects assigned for this student's form/stream. Click "+ Subject" to add one.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Subject</TableHead>
                            <TableHead className="w-28 text-center">Mark</TableHead>
                            <TableHead className="w-20 text-center">Grade</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {studentSubs.map(({ code, name }) => {
                            const m = row[code];
                            const grade = m != null ? computeGrade(m, level) : "";
                            return (
                              <TableRow key={code}>
                                <TableCell>
                                  <span className="font-medium">{code}</span>
                                  <span className="ml-2 text-xs text-muted-foreground">{name}</span>
                                </TableCell>
                                <TableCell className="p-1 text-center">
                                  <Input type="number" min={0} max={100} className="h-8 text-center"
                                    value={m ?? ""} onChange={(e) => updateMark(s.id, code, e.target.value)}/>
                                </TableCell>
                                <TableCell className="text-center text-sm font-medium">{grade || "—"}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
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
