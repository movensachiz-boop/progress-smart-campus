import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableHeader, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
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
import type { Teacher } from "@/types/school";
import { useUserRole } from "@/hooks/useUserRole";

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

const slugifyName = (n: string) =>
  n.toLowerCase().trim().replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "");

// Class ID for a student, matching generateDefaultClasses().
// Forms 1-4: `${form}${stream}` (e.g. "3Blue"). Forms 5-6: `${form}${area[0]}` (e.g. "5S").
const studentClassId = (s: { form: string | null; stream: string | null }): string | null => {
  const fn = Number(s.form);
  if (!fn) return null;
  const stream = (s.stream || "").trim();
  if (!stream) return null;
  if (fn >= 5) return `${fn}${stream.charAt(0).toUpperCase()}`;
  return `${fn}${stream}`;
};

const TeacherMarks = () => {
  const { toast } = useToast();
  const { subjects: ttSubjects, teachers: ttTeachers } = useTimetable();
  const { role } = useUserRole();
  const [teacherAccount, setTeacherAccount] = useState<Teacher | null>(null);

  // Identify the signed-in teacher via their `firstname.lastname@pcc.local` email.
  useEffect(() => {
    (async () => {
      if (role !== "teacher") { setTeacherAccount(null); return; }
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email || "";
      const local = email.split("@")[0]?.toLowerCase();
      if (!local) return;
      const match = ttTeachers.find(t => slugifyName(t.name) === local);
      setTeacherAccount(match || null);
    })();
  }, [role, ttTeachers]);

  // Codes the teacher is authorised to enter, and (per code) which class IDs.
  const teacherScope = useMemo(() => {
    if (!teacherAccount) return null;
    const codeToClasses = new Map<string, Set<string>>();
    for (const a of teacherAccount.assignments || []) {
      const subj = ttSubjects.find(s => s.id === a.subjectId);
      if (!subj) continue;
      const code = normalizeSubjectCode(subj.code || subj.name);
      if (!code) continue;
      const set = codeToClasses.get(code) || new Set<string>();
      (a.classIds || []).forEach(c => set.add(c));
      codeToClasses.set(code, set);
    }
    // Fallback: subjects listed on the teacher's profile with no explicit class list.
    for (const sid of teacherAccount.subjectIds || []) {
      const subj = ttSubjects.find(s => s.id === sid);
      if (!subj) continue;
      const code = normalizeSubjectCode(subj.code || subj.name);
      if (code && !codeToClasses.has(code)) codeToClasses.set(code, new Set());
    }
    const allClasses = new Set<string>();
    codeToClasses.forEach(set => set.forEach(c => allClasses.add(c)));
    return { codeToClasses, allowedCodes: new Set(codeToClasses.keys()), allClasses };
  }, [teacherAccount, ttSubjects]);
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
  // Order of subject codes as they appeared on the scanned sheet (left→right)
  const [scanOrder, setScanOrder] = useState<string[]>([]);
  // Order of students as they appeared on the scanned sheet (top→bottom)
  const [scanStudentOrder, setScanStudentOrder] = useState<string[]>([]);

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
      let profList = (profs || []) as Profile[];
      // If a teacher is signed in, restrict to students in classes they teach.
      if (teacherScope && teacherScope.allClasses.size > 0) {
        profList = profList.filter(p => {
          const cid = studentClassId(p);
          return cid ? teacherScope.allClasses.has(cid) : false;
        });
      }
      setStudents(profList);
      const m: MarksMap = {};
      const subjSet = new Set<string>();
      // Pre-populate columns from the Subjects module for this exam's form levels
      for (const sb of ttSubjects) {
        const inForm = (sb.forms || []).some((f: any) => activeExam.form_levels.includes(Number(f)));
        if (!inForm || !sb.code) continue;
        const code = normalizeSubjectCode(sb.code);
        if (teacherScope && !teacherScope.allowedCodes.has(code)) continue;
        subjSet.add(code);
      }
      for (const r of (rows || []) as any[]) {
        const sid = r.student_profile_id;
        const code = normalizeSubjectCode(r.subject_code);
        if (teacherScope && !teacherScope.allowedCodes.has(code)) continue;
        if (!m[sid]) m[sid] = {};
        m[sid][code] = r.mark != null ? Number(r.mark) : null;
        subjSet.add(code);
      }
      setMarks(m);
      setSubjects([...subjSet].sort());
      setLastMatched(new Set());
      setScanOrder([]);
      setScanStudentOrder([]);
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
          grade: computeGrade(mark, level, code), points: computePoints(mark, level, code),
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
        students: { name: string; marks: Record<string, number>; row_number?: number }[];
        subject_codes?: string[];
        form_level?: number | null;
      };

      const nextMarks: MarksMap = JSON.parse(JSON.stringify(marks));
      const subjSet = new Set<string>(subjects);
      const orderList: string[] = [];
      const pushOrder = (c: string) => { if (c && !orderList.includes(c)) orderList.push(c); };
      const studentRank: { id: string; rank: number; sequence: number }[] = [];
      const pushStudentOrder = (id: string, rank: number, sequence: number) => {
        if (id && !studentRank.find(r => r.id === id)) studentRank.push({ id, rank, sequence });
      };
      // Seed order from explicit subject_codes (header row, left→right)
      (subject_codes || []).forEach(c => pushOrder(normalizeSubjectCode(c)));
      const matched = new Set<string>();
      let matchedCount = 0;
      let cellCount = 0;
      const scanCandidates = form_level
        ? students.filter((p) => Number(p.form) === Number(form_level))
        : students;
      const matchCandidates = scanCandidates.length ? scanCandidates : students;

      let fallbackSeq = 0;
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
        fallbackSeq++;
        const rank = Number.isFinite(Number(r.row_number)) ? Number(r.row_number) : fallbackSeq;
        pushStudentOrder(s.id, rank, fallbackSeq);
        matchedCount++;
        if (!nextMarks[s.id]) nextMarks[s.id] = {};
        for (const [rawCode, val] of Object.entries(r.marks || {})) {
          const mark = parseMarkValue(val);
          if (mark == null) continue;
          const code = normalizeSubjectCode(rawCode);
          nextMarks[s.id][code] = mark;
          subjSet.add(code);
          pushOrder(code);
          cellCount++;
        }
      }

      (subject_codes || []).forEach(c => subjSet.add(normalizeSubjectCode(c)));

      setMarks(nextMarks);
      setSubjects([...subjSet].sort());
      setScanOrder(orderList);
      const sortedIds = [...studentRank].sort((a, b) => (a.sequence - b.sequence)).map(r => r.id);
      // Append unmatched students at the end in their original DB order so nothing disappears
      const unmatched = students.filter(s => !sortedIds.includes(s.id)).map(s => s.id);
      setScanStudentOrder([...sortedIds, ...unmatched]);
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
    const entries = [...map.entries()].map(([code, name]) => ({ code, name }));
    // If a scan provided an order, surface those subjects first in that exact order
    if (scanOrder.length) {
      const rank = new Map(scanOrder.map((c, i) => [c, i]));
      entries.sort((a, b) => {
        const ra = rank.has(a.code) ? (rank.get(a.code) as number) : Number.POSITIVE_INFINITY;
        const rb = rank.has(b.code) ? (rank.get(b.code) as number) : Number.POSITIVE_INFINITY;
        if (ra !== rb) return ra - rb;
        return a.code.localeCompare(b.code);
      });
      return entries;
    }
    return entries.sort((a, b) => a.code.localeCompare(b.code));
  };

  const addSubjectForStudent = (sid: string) => {
    const raw = prompt("Add subject code (e.g. MAT, CHE, PHY)");
    if (!raw) return;
    const code = normalizeSubjectCode(raw);
    setMarks(prev => ({ ...prev, [sid]: { ...(prev[sid] || {}), [code]: prev[sid]?.[code] ?? null } }));
  };

  const orderedStudents = useMemo(() => {
    if (!scanStudentOrder.length) return students;
    const rank = new Map(scanStudentOrder.map((id, i) => [id, i]));
    const originalIndex = new Map(students.map((s, i) => [s.id, i]));
    return [...students].sort((a, b) => {
      const ra = rank.has(a.id) ? (rank.get(a.id) as number) : Number.POSITIVE_INFINITY;
      const rb = rank.has(b.id) ? (rank.get(b.id) as number) : Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra - rb;
      return (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0);
    });
  }, [students, scanStudentOrder]);

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
        ) : students.length > 0 && (() => {
          // Unified column source — MUST match ScanMarks so phone & system show the same sheet.
          // Sources: saved marks + scan-detected codes + manually added subject columns.
          // (Per-student allocations are NOT added as columns — they only control which cells are editable.)
          const colMap = new Map<string, string>();
          subjects.forEach(c => { if (!colMap.has(c)) colMap.set(c, SUBJECT_CODES[c] || c); });
          scanOrder.forEach(c => { if (!colMap.has(c)) colMap.set(c, SUBJECT_CODES[c] || c); });
          Object.values(marks).forEach(r => Object.keys(r || {}).forEach(c => {
            if (!colMap.has(c)) colMap.set(c, SUBJECT_CODES[c] || c);
          }));
          let columns = Array.from(colMap, ([code, name]) => ({ code, name }));
          // Preferred mark-sheet column order (matches the printed form) — identical to ScanMarks.
          const maxForm = activeExam ? Math.max(...activeExam.form_levels) : 0;
          const PREFERRED_ORDER = maxForm <= 2
            ? ["ENG", "MAT", "SHO", "FRE", "HERI", "GEO", "ACC", "AGR", "CSC", "RS", "HIS", "SCI", "MUS"]
            : maxForm <= 4
              ? ["ENG", "MAT", "SHO", "FRE", "HERI", "GEO", "BS", "AGR", "CHE", "BIO", "PHY", "CSC", "ECO", "ACC", "ICT", "COMB"]
              : ["LIT", "RS", "HIS", "CSC", "BIO", "CHE", "MAT", "ACC", "PHY", "GEO", "BUS", "ECO"];
          const preferredRank = new Map(PREFERRED_ORDER.map((c, i) => [c, i]));
          const scanRank = new Map(scanOrder.map((c, i) => [c, i]));
          columns.sort((a, b) => {
            const pa = preferredRank.has(a.code) ? (preferredRank.get(a.code) as number) : Number.POSITIVE_INFINITY;
            const pb = preferredRank.has(b.code) ? (preferredRank.get(b.code) as number) : Number.POSITIVE_INFINITY;
            if (pa !== pb) return pa - pb;
            const sa = scanRank.has(a.code) ? (scanRank.get(a.code) as number) : Number.POSITIVE_INFINITY;
            const sb = scanRank.has(b.code) ? (scanRank.get(b.code) as number) : Number.POSITIVE_INFINITY;
            if (sa !== sb) return sa - sb;
            return a.code.localeCompare(b.code);
          });


          const addColumn = () => {
            const raw = prompt("Add subject code (e.g. MAT, CHE, PHY)");
            if (!raw) return;
            const code = normalizeSubjectCode(raw);
            if (!code) return;
            setSubjects(prev => prev.includes(code) ? prev : [...prev, code].sort());
          };

          return (
            <Card>
              <CardContent className="p-0">
                <div className="flex items-center justify-between p-3 border-b">
                  <div className="text-sm text-muted-foreground">{orderedStudents.length} students · {columns.length} subjects</div>
                  <Button size="sm" variant="outline" onClick={addColumn}>+ Subject Column</Button>
                </div>
                <div className="relative overflow-auto max-h-[75vh]">
                  <table className="caption-bottom text-sm border-separate border-spacing-0">
                    <thead>
                      <tr>
                        <th className="sticky top-0 left-0 z-[60] bg-background border-b border-r h-12 px-3 text-left align-middle font-semibold text-muted-foreground min-w-[220px] w-[220px] shadow-sm">Student</th>
                        {columns.map(col => (
                          <th key={col.code} title={col.name}
                              className="sticky top-0 z-50 bg-background border-b border-r h-12 px-2 text-center align-middle font-semibold text-muted-foreground min-w-[64px] w-[64px] shadow-sm">
                            {col.code}
                          </th>
                        ))}
                        <th className="sticky top-0 z-50 bg-background border-b border-r h-12 px-2 text-center align-middle font-semibold text-muted-foreground min-w-[140px] w-[140px] shadow-sm">Passed</th>
                        <th className="sticky top-0 z-50 bg-background border-b h-12 px-2 text-center align-middle font-semibold text-muted-foreground min-w-[140px] w-[140px] shadow-sm">Failed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderedStudents.map(s => {
                        const level = formToLevel(s.form);
                        const row = marks[s.id] || {};
                        const isMatched = lastMatched.has(s.id);
                        const allowed = new Set(subjectsForStudent(s).map(x => x.code));
                        const passed: string[] = [];
                        const failed: string[] = [];
                        return (
                          <tr key={s.id} className={isMatched ? "bg-green-500/5" : ""}>
                            <td className="sticky left-0 z-30 bg-background border-b border-r px-3 py-2 min-w-[220px] w-[220px] shadow-sm">
                              <div className="font-medium text-sm flex items-center">
                                {isMatched && <CheckCircle2 className="inline mr-1 text-green-600 shrink-0" size={14}/>}
                                <span className="truncate">{s.last_name} {s.first_name}</span>
                              </div>
                              <div className="text-xs text-muted-foreground">F{s.form} {s.stream}</div>
                            </td>
                            {columns.map(col => {
                              const m = row[col.code];
                              const isAllowed = allowed.has(col.code) || m != null;
                              if (m != null) {
                                const g = computeGrade(m, level);
                                if (g === "U") failed.push(col.code);
                                else if (g) passed.push(col.code);
                              }
                              return (
                                <td key={col.code} className="border-b border-r p-1 text-center min-w-[64px] w-[64px]">
                                  {isAllowed ? (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <Input type="number" min={0} max={100}
                                        className="h-8 px-1 text-center text-sm"
                                        value={m ?? ""}
                                        onChange={(e) => updateMark(s.id, col.code, e.target.value)}/>
                                      {m != null && (
                                        <span className={`text-[10px] font-bold ${computeGrade(m, level) === "U" ? "text-red-600" : "text-blue-600"}`}>
                                          {computeGrade(m, level)}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground/40">—</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="border-b border-r px-2 py-2 text-center text-xs font-medium text-green-600 min-w-[140px] w-[140px]">{passed.join(", ") || "—"}</td>
                            <td className="border-b px-2 py-2 text-center text-xs font-medium text-red-600 min-w-[140px] w-[140px]">{failed.join(", ") || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })()}
      </div>


      <CameraCaptureDialog open={scanOpen} onOpenChange={setScanOpen} onCapture={handleCapture}
        title="Scan Mark Sheet" description="Capture the whole grid — names and all subject columns. Marks for every student & subject will auto-fill."/>
      <PhoneCameraPairDialog
        open={phonePairOpen}
        onOpenChange={setPhonePairOpen}
        onPhotos={async (photos) => {
          for (const p of photos) {
            await handleCapture(p);
          }
        }}
        title="Use Phone Camera for Mark Sheet"
      />
    </DashboardLayout>
  );
};

export default TeacherMarks;
