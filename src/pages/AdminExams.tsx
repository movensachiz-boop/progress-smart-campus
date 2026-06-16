import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Camera, Upload, QrCode, Printer, Save, Eye, EyeOff, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import CameraCaptureDialog from "@/components/CameraCaptureDialog";
import QRCode from "qrcode";
import { useTimetable } from "@/context/TimetableContext";
import {
  SUBJECT_CODES, normalizeSubjectCode, formToLevel, computeGrade, computePoints,
} from "@/lib/grading";

type Exam = {
  id: string; name: string; exam_type: string; term: number; year: number;
  form_levels: number[]; published: boolean; created_at: string;
};

type Profile = {
  id: string; first_name: string; last_name: string;
  form: string | null; stream: string | null;
};

type ResultRow = {
  id?: string; exam_id: string; student_profile_id: string;
  subject_code: string; subject_name?: string;
  mark: number | null; grade?: string; points?: number;
};

const EXAM_TYPES = ["Mid-Term", "End-Term", "Mock", "Final"];

const AdminExams = () => {
  const { toast } = useToast();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrTitle, setQrTitle] = useState<string>("");
  const [qrShareUrl, setQrShareUrl] = useState<string>("");


  const [newExam, setNewExam] = useState({
    name: "2026 Mid-Term 2", exam_type: "Mid-Term", term: 2, year: 2026, form_levels: [6] as number[],
  });

  const loadExams = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("exams").select("*").order("created_at", { ascending: false });
    if (error) toast({ title: "Failed to load exams", description: error.message, variant: "destructive" });
    setExams((data || []) as Exam[]);
    setLoading(false);
  };

  useEffect(() => { loadExams(); }, []);

  const createExam = async () => {
    if (!newExam.name.trim() || !newExam.form_levels.length) {
      toast({ title: "Missing info", description: "Name and at least one form are required.", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("exams").insert([newExam]);
    if (error) return toast({ title: "Create failed", description: error.message, variant: "destructive" });
    toast({ title: "Exam created" });
    setCreating(false);
    setNewExam({ name: "", exam_type: "Mid-Term", term: 1, year: new Date().getFullYear(), form_levels: [] });
    loadExams();
  };

  const togglePublish = async (e: Exam) => {
    const { error } = await supabase.from("exams").update({ published: !e.published }).eq("id", e.id);
    if (error) return toast({ title: "Update failed", description: error.message, variant: "destructive" });
    toast({ title: e.published ? "Unpublished" : "Published — students can now view" });
    loadExams();
  };

  const deleteExam = async (e: Exam) => {
    if (!confirm(`Delete "${e.name}" and all its results?`)) return;
    const { error } = await supabase.from("exams").delete().eq("id", e.id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    toast({ title: "Deleted" });
    loadExams();
  };

  const openSheetQR = async (e: Exam) => {
    const url = `${window.location.origin}/scan-marks/${e.id}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 320, margin: 2 });
    setQrUrl(dataUrl);
    setQrShareUrl(url);
    setQrTitle(`${e.name} – Mark Sheet Editing Link`);
  };


  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Exam Reports</h2>
            <p className="text-sm text-muted-foreground">Create exams, scan mark sheets, and publish results to students.</p>
          </div>
          <Button onClick={() => setCreating(true)} className="gap-2"><Plus size={16}/> New Exam</Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground"><Loader2 className="inline mr-2 animate-spin" size={16}/>Loading…</div>
            ) : exams.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No exams yet. Click <b>New Exam</b> to start.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Term / Year</TableHead>
                    <TableHead>Forms</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exams.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell>{e.exam_type}</TableCell>
                      <TableCell>T{e.term} / {e.year}</TableCell>
                      <TableCell>{e.form_levels.map(f => `F${f}`).join(", ")}</TableCell>
                      <TableCell>
                        {e.published
                          ? <Badge className="bg-emerald-600">Published</Badge>
                          : <Badge variant="outline">Draft</Badge>}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="outline" size="sm" onClick={() => { setActiveExam(e); setEditorOpen(true); }}>Open</Button>
                        <Button variant="outline" size="sm" onClick={() => openSheetQR(e)} title="Mark sheet QR"><QrCode size={14}/></Button>
                        <Button variant="outline" size="sm" onClick={() => togglePublish(e)}>
                          {e.published ? <EyeOff size={14}/> : <Eye size={14}/>}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => deleteExam(e)} className="text-destructive"><Trash2 size={14}/></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Exam</DialogTitle>
            <DialogDescription>Define the exam session. You'll capture marks next.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={newExam.name} onChange={(e) => setNewExam({ ...newExam, name: e.target.value })} placeholder="2026 Mid-Term 2"/>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={newExam.exam_type} onValueChange={(v) => setNewExam({ ...newExam, exam_type: v })}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{EXAM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Term</Label><Input type="number" min={1} max={3} value={newExam.term} onChange={(e) => setNewExam({ ...newExam, term: parseInt(e.target.value) || 1 })}/></div>
              <div><Label>Year</Label><Input type="number" value={newExam.year} onChange={(e) => setNewExam({ ...newExam, year: parseInt(e.target.value) || new Date().getFullYear() })}/></div>
            </div>
            <div>
              <Label>Forms (multi-select)</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {[1,2,3,4,5,6].map(f => {
                  const on = newExam.form_levels.includes(f);
                  return (
                    <Button key={f} type="button" variant={on ? "default" : "outline"} size="sm"
                      onClick={() => setNewExam({
                        ...newExam,
                        form_levels: on ? newExam.form_levels.filter(x => x !== f) : [...newExam.form_levels, f].sort()
                      })}
                    >Form {f}</Button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={createExam}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editor */}
      {activeExam && (
        <ExamEditor
          exam={activeExam}
          open={editorOpen}
          onOpenChange={(o) => { setEditorOpen(o); if (!o) loadExams(); }}
        />
      )}

      {/* QR */}
      <Dialog open={!!qrUrl} onOpenChange={(o) => { if (!o) setQrUrl(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{qrTitle}</DialogTitle></DialogHeader>
          {qrUrl && <div className="flex flex-col items-center gap-3 py-2">
            <img src={qrUrl} alt="QR" className="w-72 h-72"/>
            <p className="text-xs text-muted-foreground text-center">Scan this QR or share the link below. The page only allows editing marks for this exam — no other access.</p>
            <div className="w-full flex gap-2">
              <Input readOnly value={qrShareUrl} className="text-xs font-mono" onFocus={(ev) => ev.currentTarget.select()} />
              <Button type="button" variant="outline" onClick={() => { navigator.clipboard.writeText(qrShareUrl); toast({ title: "Link copied" }); }}>Copy</Button>
            </div>
            <Button onClick={() => window.print()} variant="outline" className="gap-2"><Printer size={14}/> Print QR</Button>
          </div>}

        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

// ============ Editor ============

const ExamEditor = ({ exam, open, onOpenChange }: { exam: Exam; open: boolean; onOpenChange: (o: boolean) => void }) => {
  const { toast } = useToast();
  const { classes, subjects } = useTimetable();
  const [students, setStudents] = useState<Profile[]>([]);
  const [subjectCodes, setSubjectCodes] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, Record<string, number | null>>>({}); // [studentId][code] = mark
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [selectedClassId, setSelectedClassId] = useState<string>("all");
  const [scanOrder, setScanOrder] = useState<string[]>([]);
  const [scanStudentOrder, setScanStudentOrder] = useState<string[]>([]);

  // Classes whose form belongs to this exam
  const examClasses = useMemo(
    () => classes.filter(c => exam.form_levels.includes(c.form as number)),
    [classes, exam.form_levels]
  );

  // Subject codes derived from the selected class
  const classSubjectCodes = useMemo(() => {
    if (selectedClassId === "all") return [];
    const cls = examClasses.find(c => c.id === selectedClassId);
    if (!cls) return [];
    return cls.subjectIds
      .map(id => subjects.find(s => s.id === id)?.code)
      .filter(Boolean)
      .map(c => normalizeSubjectCode(c as string));
  }, [selectedClassId, examClasses, subjects]);

  const load = async () => {
    setLoading(true);
    const [{ data: profs }, { data: rows }] = await Promise.all([
      supabase.from("profiles").select("id, first_name, last_name, form, stream")
        .in("form", exam.form_levels.map(String)),
      supabase.from("exam_results").select("*").eq("exam_id", exam.id),
    ]);
    setStudents((profs || []) as Profile[]);
    const grid: Record<string, Record<string, number | null>> = {};
    const codes = new Set<string>();
    for (const r of (rows || []) as ResultRow[]) {
      grid[r.student_profile_id] = grid[r.student_profile_id] || {};
      grid[r.student_profile_id][r.subject_code] = r.mark != null ? Number(r.mark) : null;
      codes.add(r.subject_code);
    }
    setResults(grid);
    setSubjectCodes(Array.from(codes));
    setScanOrder([]);
    setScanStudentOrder([]);
    setLoading(false);
  };

  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open]);

  const setCell = (sid: string, code: string, val: string) => {
    const num = val.trim() === "" ? null : Number(val);
    setResults((prev) => ({ ...prev, [sid]: { ...(prev[sid] || {}), [code]: isNaN(num as number) ? null : num } }));
  };

  const addColumn = () => {
    const c = normalizeSubjectCode(newCode);
    if (!c) return;
    if (!subjectCodes.includes(c)) setSubjectCodes([...subjectCodes, c]);
    setNewCode("");
  };

  const saveAll = async () => {
    setSaving(true);
    const payload: any[] = [];
    const allCodes = Array.from(new Set([...subjectCodes, ...Object.values(results).flatMap(r => Object.keys(r))]));
    for (const s of students) {
      const level = formToLevel(s.form);
      const row = results[s.id] || {};
      for (const code of allCodes) {
        const mark = row[code];
        if (mark == null || isNaN(mark)) continue;
        const grade = computeGrade(mark, level);
        payload.push({
          exam_id: exam.id, student_profile_id: s.id,
          subject_code: code, subject_name: SUBJECT_CODES[code] || code,
          mark, grade, points: computePoints(mark, level),
        });
      }
    }
    // Use upsert on unique (exam_id, student_profile_id, subject_code)
    const { error } = await supabase.from("exam_results")
      .upsert(payload, { onConflict: "exam_id,student_profile_id,subject_code" });
    setSaving(false);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: `Saved ${payload.length} marks` });
    load();
  };

  const handleCapture = async (dataUrl: string) => {
    setScanOpen(false);
    setOcrLoading(true);
    try {
      const expectedStudents = students.map((p) => ({ name: `${p.first_name} ${p.last_name}` }));
      const expectedSubjectCodes = subjectCodes.length ? subjectCodes : [];
      const { data, error } = await supabase.functions.invoke("extract-marks", {
        body: { imageBase64: dataUrl, expectedStudents, expectedSubjectCodes },
      });
      if (error) throw error;
      const { students: rows, subject_codes } = data as { students: { name: string; marks: Record<string, number> }[]; subject_codes?: string[] };
      // Add any new subject columns, preserving scan order
      const codes = new Set(subjectCodes);
      const orderList: string[] = [];
      const pushOrder = (c: string) => { if (c && !orderList.includes(c)) orderList.push(c); };
      (subject_codes || []).forEach((c) => { const n = normalizeSubjectCode(c); codes.add(n); pushOrder(n); });
      // Try to match each row to a profile by fuzzy name, preserving row order
      let matched = 0;
      const nextResults = { ...results };
      const matchedIds: string[] = [];
      for (const r of rows) {
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, "").trim();
        const target = norm(r.name);
        const s = students.find(p => {
          const full = norm(`${p.first_name} ${p.last_name}`);
          const rev = norm(`${p.last_name} ${p.first_name}`);
          return full === target || rev === target || full.includes(target) || target.includes(full);
        });
        if (!s) continue;
        if (!matchedIds.includes(s.id)) matchedIds.push(s.id);
        matched++;
        nextResults[s.id] = nextResults[s.id] || {};
        for (const [code, mark] of Object.entries(r.marks || {})) {
          const c = normalizeSubjectCode(code);
          codes.add(c);
          pushOrder(c);
          nextResults[s.id][c] = Number(mark);
        }
      }
      const unmatched = students.filter(s => !matchedIds.includes(s.id)).map(s => s.id);
      setResults(nextResults);
      setSubjectCodes(Array.from(codes));
      setScanOrder(orderList);
      setScanStudentOrder([...matchedIds, ...unmatched]);
      toast({ title: "OCR complete", description: `Matched ${matched} of ${rows.length} rows. Review then save.` });
    } catch (err: any) {
      toast({ title: "OCR failed", description: err.message || "Try a clearer photo", variant: "destructive" });
    } finally {
      setOcrLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = () => handleCapture(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{exam.name}</DialogTitle>
            <DialogDescription>Forms {exam.form_levels.join(", ")} · {students.length} students</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2 pb-2 border-b">
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Class"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {examClasses.map(c => (
                  <SelectItem key={c.id} value={c.id}>Form {c.form} {c.stream}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => setScanOpen(true)} className="gap-2" disabled={ocrLoading}>
              {ocrLoading ? <Loader2 className="animate-spin" size={14}/> : <Camera size={14}/>} Scan Mark Sheet
            </Button>
            <label className="inline-flex">
              <Button asChild variant="outline" className="gap-2">
                <span><Upload size={14}/> Upload Image</span>
              </Button>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}/>
            </label>
            <div className="flex items-center gap-1 ml-auto">
              <Input placeholder="Add subject code (e.g. LIT)" value={newCode} onChange={(e) => setNewCode(e.target.value)} className="w-48"/>
              <Button variant="outline" onClick={addColumn}>Add</Button>
            </div>
            <Button onClick={saveAll} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="animate-spin" size={14}/> : <Save size={14}/>} Save All
            </Button>
          </div>


          <div className="flex-1 overflow-auto">
            {loading ? <div className="p-8 text-center"><Loader2 className="inline animate-spin mr-2" size={16}/>Loading…</div> : (() => {
              const maxForm = Math.max(...exam.form_levels);
              const PREFERRED_ORDER = maxForm <= 2
                ? ["ENG", "MAT", "SHO", "FRE", "HERI", "GEO", "ACC", "AGR", "CSC", "RS", "HIS", "SCI", "MUS"]
                : maxForm <= 4
                  ? ["ENG", "MAT", "SHO", "FRE", "HERI", "GEO", "BS", "AGR", "CHE", "BIO", "PHY", "CSC", "ECO", "ACC", "ICT", "COMB"]
                  : ["LIT", "RS", "HIS", "CSC", "BIO", "CHE", "MAT", "ACC", "PHY", "GEO", "BUS", "ECO"];
              const rank = new Map(PREFERRED_ORDER.map((c, i) => [c, i]));
              const scanRank = new Map(scanOrder.map((c, i) => [c, i]));
              // When a class is picked, restrict columns to that class's registered subjects (in preferred order).
              const baseCodes = classSubjectCodes.length ? classSubjectCodes : PREFERRED_ORDER;
              const combined = Array.from(new Set([...baseCodes, ...subjectCodes]));
              const orderedCodes = scanOrder.length
                ? combined.sort((a, b) => {
                    const sa = scanRank.has(a) ? (scanRank.get(a) as number) : Number.POSITIVE_INFINITY;
                    const sb = scanRank.has(b) ? (scanRank.get(b) as number) : Number.POSITIVE_INFINITY;
                    if (sa !== sb) return sa - sb;
                    const ra = rank.has(a) ? (rank.get(a) as number) : Number.POSITIVE_INFINITY;
                    const rb = rank.has(b) ? (rank.get(b) as number) : Number.POSITIVE_INFINITY;
                    if (ra !== rb) return ra - rb;
                    return a.localeCompare(b);
                  })
                : combined.sort((a, b) => {
                    const ra = rank.has(a) ? (rank.get(a) as number) : Number.POSITIVE_INFINITY;
                    const rb = rank.has(b) ? (rank.get(b) as number) : Number.POSITIVE_INFINITY;
                    if (ra !== rb) return ra - rb;
                    return a.localeCompare(b);
                  });
              // Order students by scan order first, then DB order (no alphabetical sort)
              const studentRank = new Map(scanStudentOrder.map((id, i) => [id, i]));
              const origIdx = new Map(students.map((s, i) => [s.id, i]));
              const orderedStudents = scanStudentOrder.length
                ? [...students].sort((a, b) => {
                    const ra = studentRank.has(a.id) ? (studentRank.get(a.id) as number) : Number.POSITIVE_INFINITY;
                    const rb = studentRank.has(b.id) ? (studentRank.get(b.id) as number) : Number.POSITIVE_INFINITY;
                    if (ra !== rb) return ra - rb;
                    return (origIdx.get(a.id) ?? 0) - (origIdx.get(b.id) ?? 0);
                  })
                : students;
              // Filter students by selected class (match by form + stream/learning area)
              const selectedClass = examClasses.find(c => c.id === selectedClassId);
              const visibleStudents = selectedClass
                ? orderedStudents.filter(s => {
                    if (String(s.form) !== String(selectedClass.form)) return false;
                    const target = (selectedClass.learningArea || selectedClass.stream || "").toLowerCase();
                    const stream = (s.stream || "").toLowerCase();
                    return stream === target || stream.charAt(0) === target.charAt(0);
                  })
                : orderedStudents;
              return (
              <Table wrapperClassName="overflow-visible">

                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px] sticky left-0 top-0 bg-card z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]">Student</TableHead>
                    {orderedCodes.map(c => <TableHead key={c} className="text-center min-w-[70px] sticky top-0 bg-card z-10" title={SUBJECT_CODES[c] || c}>{c}</TableHead>)}
                    <TableHead className="text-center min-w-[140px] sticky top-0 bg-card z-10">Passed</TableHead>
                    <TableHead className="text-center min-w-[140px] sticky top-0 bg-card z-10">Failed</TableHead>
                    <TableHead className="text-center sticky top-0 bg-card z-10">Pts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleStudents.map(s => {
                    const level = formToLevel(s.form);
                    const row = results[s.id] || {};
                    const passed: string[] = [];
                    const failed: string[] = [];
                    for (const c of orderedCodes) {
                      const m = row[c];
                      if (m == null || isNaN(m as number)) continue;
                      const g = computeGrade(m, level);
                      if (!g) continue;
                      if (g === "U") failed.push(c); else passed.push(c);
                    }
                    const totalPts = orderedCodes.reduce((acc, c) => acc + computePoints(row[c] ?? null, level), 0);
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium sticky left-0 bg-card z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]">
                          {s.last_name} {s.first_name}
                          <div className="text-xs text-muted-foreground">F{s.form} {s.stream}</div>
                        </TableCell>

                        {orderedCodes.map(c => {
                          const m = row[c];
                          const g = m != null && !isNaN(m as number) ? computeGrade(m, level) : "";
                          return (
                            <TableCell key={c} className="p-1">
                              <div className="flex flex-col items-center gap-0.5">
                                <Input
                                  type="number" min={0} max={100} className="h-8 text-center"
                                  value={row[c] ?? ""} onChange={(e) => setCell(s.id, c, e.target.value)}
                                />
                                {g && (
                                  <span className={`text-[10px] font-bold ${g === "U" ? "text-red-600" : "text-blue-600"}`}>{g}</span>
                                )}
                              </div>
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center text-xs font-medium text-green-600">{passed.join(", ") || "—"}</TableCell>
                        <TableCell className="text-center text-xs font-medium text-red-600">{failed.join(", ") || "—"}</TableCell>
                        <TableCell className="text-center font-semibold">{level === "alevel" ? totalPts : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      <CameraCaptureDialog open={scanOpen} onOpenChange={setScanOpen} onCapture={handleCapture}
        title="Scan Mark Sheet" description="Capture the full table; the system will OCR names and marks."/>
    </>
  );
};

export default AdminExams;
