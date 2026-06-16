import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Camera, Upload, Save, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import CameraCaptureDialog from "@/components/CameraCaptureDialog";
import {
  SUBJECT_CODES, normalizeSubjectCode, formToLevel, computeGrade, computePoints,
} from "@/lib/grading";

type Exam = {
  id: string; name: string; exam_type: string; term: number; year: number;
  form_levels: number[]; published: boolean;
};
type Profile = { id: string; first_name: string; last_name: string; form: string | null; stream: string | null };

const ALEVEL_ORDER = ["LIT", "RS", "HIS", "CSC", "BIO", "CHE", "MAT", "ACC", "PHY", "GEO", "BUS", "ECO"];
// Form 1-2 mark sheet column order
const OLEVEL_JUNIOR_ORDER = ["ENG", "MAT", "SHO", "FRE", "HERI", "GEO", "ACC", "AGR", "CSC", "RS", "HIS", "SCI", "MUS"];
// Form 3-4 mark sheet column order — union of Leo (Sciences) + Aries (Commercials)
const OLEVEL_SENIOR_ORDER = ["ENG", "MAT", "SHO", "FRE", "HERI", "GEO", "BS", "AGR", "CHE", "BIO", "PHY", "CSC", "ECO", "ACC", "ICT", "COMB"];

/**
 * Public mark-sheet capture page. Reached by scanning the QR printed on a mark
 * sheet — no login required. Uses the `save-exam-results` edge function (service
 * role) to load students/results and persist captured marks.
 */
const ScanMarks = () => {
  const { examId } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState<Exam | null>(null);
  const [students, setStudents] = useState<Profile[]>([]);
  const [subjectCodes, setSubjectCodes] = useState<string[]>([]);
  const [grid, setGrid] = useState<Record<string, Record<string, number | null>>>({});
  const [scanOpen, setScanOpen] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [filter, setFilter] = useState("");
  const [scanOrder, setScanOrder] = useState<string[]>([]);
  const [scanStudentOrder, setScanStudentOrder] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("save-exam-results", {
      body: { action: "load", exam_id: examId },
    });
    if (error || !data?.exam) {
      toast({ title: "Failed to load exam", description: error?.message || data?.error, variant: "destructive" });
      setLoading(false); return;
    }
    setExam(data.exam);
    setStudents(data.students || []);
    const g: Record<string, Record<string, number | null>> = {};
    const codes = new Set<string>();
    for (const r of data.results || []) {
      g[r.student_profile_id] = g[r.student_profile_id] || {};
      g[r.student_profile_id][r.subject_code] = r.mark != null ? Number(r.mark) : null;
      codes.add(r.subject_code);
    }
    setGrid(g);
    // Always seed default subject columns for the exam's form level so subjects
    // like CHE appear even when no marks have been captured yet.
    const maxForm = Math.max(...(data.exam.form_levels || [0]));
    const defaults = maxForm <= 2 ? OLEVEL_JUNIOR_ORDER : maxForm <= 4 ? OLEVEL_SENIOR_ORDER : ALEVEL_ORDER;
    defaults.forEach((c) => codes.add(c));
    setSubjectCodes(Array.from(codes));
    setScanOrder([]);
    setScanStudentOrder([]);
    setLoading(false);
  };

  useEffect(() => { if (examId) load(); /* eslint-disable-next-line */ }, [examId]);

  const setCell = (sid: string, code: string, val: string) => {
    const num = val.trim() === "" ? null : Number(val);
    setGrid((p) => ({ ...p, [sid]: { ...(p[sid] || {}), [code]: isNaN(num as number) ? null : num } }));
  };

  const addColumn = () => {
    const c = normalizeSubjectCode(newCode);
    if (!c) return;
    if (!subjectCodes.includes(c)) setSubjectCodes([...subjectCodes, c]);
    setNewCode("");
  };

  const handleCapture = async (dataUrl: string) => {
    setScanOpen(false);
    setOcrLoading(true);
    try {
      const expectedStudents = students.map((p) => ({ name: `${p.first_name} ${p.last_name}` }));
      const expectedSubjectCodes = subjectCodes.length
        ? subjectCodes
        : (exam ? (Math.max(...exam.form_levels) <= 2 ? OLEVEL_JUNIOR_ORDER : Math.max(...exam.form_levels) <= 4 ? OLEVEL_SENIOR_ORDER : ALEVEL_ORDER) : ALEVEL_ORDER);
      const { data, error } = await supabase.functions.invoke("extract-marks", {
        body: { imageBase64: dataUrl, expectedStudents, expectedSubjectCodes },
      });
      if (error) throw error;
      const { students: rows, subject_codes } = data as { students: { name: string; marks: Record<string, number>; row_number?: number }[]; subject_codes?: string[] };
      const codes = new Set(subjectCodes);
      const orderList: string[] = [];
      const pushOrder = (c: string) => { if (c && !orderList.includes(c)) orderList.push(c); };
      (subject_codes || []).forEach((c) => { const n = normalizeSubjectCode(c); codes.add(n); pushOrder(n); });
      let matched = 0;
      const next = { ...grid };
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, "").trim();
      const matchedIds: string[] = [];
      for (const r of rows) {
        const target = norm(r.name);
        const s = students.find((p) => {
          const full = norm(`${p.first_name} ${p.last_name}`);
          const rev = norm(`${p.last_name} ${p.first_name}`);
          return full === target || rev === target || full.includes(target) || target.includes(full);
        });
        if (!s) continue;
        if (!matchedIds.includes(s.id)) matchedIds.push(s.id);
        matched++;
        next[s.id] = next[s.id] || {};
        for (const [code, mark] of Object.entries(r.marks || {})) {
          const c = normalizeSubjectCode(code);
          codes.add(c);
          pushOrder(c);
          next[s.id][c] = Number(mark);
        }
      }
      const unmatched = students.filter(s => !matchedIds.includes(s.id)).map(s => s.id);
      setGrid(next);
      setSubjectCodes(Array.from(codes));
      setScanOrder(orderList);
      setScanStudentOrder([...matchedIds, ...unmatched]);
      toast({ title: "OCR complete", description: `Matched ${matched} of ${rows.length} rows.` });
    } catch (err: any) {
      toast({ title: "OCR failed", description: err.message || "Try a clearer photo", variant: "destructive" });
    } finally {
      setOcrLoading(false);
    }
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => handleCapture(reader.result as string);
    reader.readAsDataURL(file);
  };

  const saveAll = async () => {
    if (!exam) return;
    setSaving(true);
    const payload: any[] = [];
    for (const s of students) {
      const level = formToLevel(s.form);
      const row = grid[s.id] || {};
      for (const code of subjectCodes) {
        const m = row[code];
        if (m == null || isNaN(m)) continue;
        payload.push({
          student_profile_id: s.id,
          subject_code: code,
          subject_name: SUBJECT_CODES[code] || code,
          mark: m,
          grade: computeGrade(m, level),
          points: computePoints(m, level),
        });
      }
    }
    const { data, error } = await supabase.functions.invoke("save-exam-results", {
      body: { action: "save", exam_id: exam.id, rows: payload },
    });
    setSaving(false);
    if (error || data?.error) {
      toast({ title: "Save failed", description: error?.message || data?.error, variant: "destructive" });
      return;
    }
    toast({ title: `Saved ${data.saved} marks` });
    load();
  };

  // Order students by scan order, then DB order
  const orderedStudents = useMemo(() => {
    if (!scanStudentOrder.length) return students;
    const rank = new Map(scanStudentOrder.map((id, i) => [id, i]));
    const origIdx = new Map(students.map((s, i) => [s.id, i]));
    return [...students].sort((a, b) => {
      const ra = rank.has(a.id) ? (rank.get(a.id) as number) : Number.POSITIVE_INFINITY;
      const rb = rank.has(b.id) ? (rank.get(b.id) as number) : Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra - rb;
      return (origIdx.get(a.id) ?? 0) - (origIdx.get(b.id) ?? 0);
    });
  }, [students, scanStudentOrder]);

  // Order subject columns: scan order first (when available), else preferred order, then alpha
  const orderedCodes = useMemo(() => {
    const maxForm = exam ? Math.max(...exam.form_levels) : 0;
    const preferredOrder = maxForm <= 2 ? OLEVEL_JUNIOR_ORDER : maxForm <= 4 ? OLEVEL_SENIOR_ORDER : ALEVEL_ORDER;
    const preferredRank = new Map(preferredOrder.map((c, i) => [c, i]));
    const scanRank = new Map(scanOrder.map((c, i) => [c, i]));
    if (scanOrder.length) {
      return [...subjectCodes].sort((a, b) => {
        const sa = scanRank.has(a) ? (scanRank.get(a) as number) : Number.POSITIVE_INFINITY;
        const sb = scanRank.has(b) ? (scanRank.get(b) as number) : Number.POSITIVE_INFINITY;
        if (sa !== sb) return sa - sb;
        const pa = preferredRank.has(a) ? (preferredRank.get(a) as number) : Number.POSITIVE_INFINITY;
        const pb = preferredRank.has(b) ? (preferredRank.get(b) as number) : Number.POSITIVE_INFINITY;
        if (pa !== pb) return pa - pb;
        return a.localeCompare(b);
      });
    }
    return [...subjectCodes].sort((a, b) => {
      const pa = preferredRank.has(a) ? (preferredRank.get(a) as number) : Number.POSITIVE_INFINITY;
      const pb = preferredRank.has(b) ? (preferredRank.get(b) as number) : Number.POSITIVE_INFINITY;
      if (pa !== pb) return pa - pb;
      return a.localeCompare(b);
    });
  }, [subjectCodes, scanOrder, exam]);

  const computeRowResult = (s: Profile): { passed: string[]; failed: string[] } => {
    const level = formToLevel(s.form);
    const row = grid[s.id] || {};
    const passed: string[] = [];
    const failed: string[] = [];
    for (const code of orderedCodes) {
      const m = row[code];
      if (m == null || isNaN(m)) continue;
      const g = computeGrade(m, level);
      if (!g) continue;
      if (g === "U") failed.push(code);
      else passed.push(code);
    }
    return { passed, failed };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }
  if (!exam) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full"><CardContent className="p-6 text-center">Exam not found.</CardContent></Card>
      </div>
    );
  }

  const visibleStudents = orderedStudents.filter((s) => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return `${s.first_name} ${s.last_name}`.toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-background p-3 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-medium">Mark Sheet Editor</span>
          <span className="text-xs text-muted-foreground">Verification-only access</span>
        </div>


        <Card>
          <CardHeader>
            <CardTitle>{exam.name}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Forms {exam.form_levels.join(", ")} · {students.length} students
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setScanOpen(true)} className="gap-2" disabled={ocrLoading}>
                {ocrLoading ? <Loader2 className="animate-spin" size={14}/> : <Camera size={14}/>}
                Scan with Phone
              </Button>
              <label>
                <Button asChild variant="outline" className="gap-2">
                  <span><Upload size={14}/> Upload Photo</span>
                </Button>
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </label>
              <div className="flex items-center gap-1">
                <Input value={newCode} onChange={(e) => setNewCode(e.target.value)}
                  placeholder="Add subject (e.g. MAT)" className="w-44" />
                <Button variant="outline" onClick={addColumn}>Add</Button>
              </div>
              <Button onClick={saveAll} disabled={saving} className="gap-2 ml-auto">
                {saving ? <Loader2 className="animate-spin" size={14}/> : <Save size={14}/>} Save All
              </Button>
            </div>
            <Input placeholder="Filter students…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left p-2 min-w-[180px]">Student</th>
                  <th className="text-left p-2">Form</th>
                  {orderedCodes.map((c) => (
                    <th key={c} className="text-center p-2 min-w-[70px]" title={SUBJECT_CODES[c] || c}>{c}</th>
                  ))}
                  <th className="text-center p-2 min-w-[140px]">PASSED</th>
                  <th className="text-center p-2 min-w-[140px]">FAILED</th>
                </tr>
              </thead>
              <tbody>
                {visibleStudents.map((s) => {
                  const { passed, failed } = computeRowResult(s);
                  return (
                  <tr key={s.id} className="border-t">
                    <td className="p-2 whitespace-nowrap">{s.last_name} {s.first_name}</td>
                    <td className="p-2">{s.form}{s.stream ? ` ${s.stream}` : ""}</td>
                    {orderedCodes.map((c) => {
                      const m = grid[s.id]?.[c];
                      const level = formToLevel(s.form);
                      const grade = m != null && !isNaN(m) ? computeGrade(m, level) : "";
                      return (
                        <td key={c} className="p-1">
                          <div className="flex flex-col items-center gap-0.5">
                            <Input
                              inputMode="numeric"
                              value={m ?? ""}
                              onChange={(e) => setCell(s.id, c, e.target.value)}
                              className="h-8 text-center w-16"
                            />
                            {grade && (
                              <span className={`text-[10px] font-bold ${grade === "U" ? "text-red-600" : "text-blue-600"}`}>
                                {grade}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td className="p-2 text-center text-xs font-medium text-green-600">{passed.join(", ") || "—"}</td>
                    <td className="p-2 text-center text-xs font-medium text-red-600">{failed.join(", ") || "—"}</td>
                  </tr>
                  );
                })}
                {visibleStudents.length === 0 && (
                  <tr><td colSpan={4 + orderedCodes.length} className="p-6 text-center text-muted-foreground">
                    No students match the filter.
                  </td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <CameraCaptureDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onCapture={handleCapture}
        title="Capture Mark Sheet"
      />
    </div>
  );
};

export default ScanMarks;
