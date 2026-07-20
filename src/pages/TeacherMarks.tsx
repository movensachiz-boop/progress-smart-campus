import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableHeader, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { Loader2, Save, Camera, CheckCircle2, FileDown } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
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
  const { role, loading: baseRoleLoading } = useUserRole();
  const [hasPrivilegedMarksRole, setHasPrivilegedMarksRole] = useState(false);
  const [marksRoleLoading, setMarksRoleLoading] = useState(true);
  const [teacherAccount, setTeacherAccount] = useState<Teacher | null>(null);
  const hasFullMarksAccess = role === "admin" || role === "owner" || hasPrivilegedMarksRole;
  const restrictedMarksMode = !hasFullMarksAccess;
  const roleLoading = baseRoleLoading || marksRoleLoading;

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (mounted) { setHasPrivilegedMarksRole(false); setMarksRoleLoading(false); }
        return;
      }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const roles = (data || []).map((r: any) => String(r.role));
      if (mounted) {
        setHasPrivilegedMarksRole(roles.includes("admin") || roles.includes("owner"));
        setMarksRoleLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Identify the signed-in teacher via their `firstname.lastname@pcc.local` email.
  useEffect(() => {
    (async () => {
      if (roleLoading) return;
      if (hasFullMarksAccess) { setTeacherAccount(null); return; }
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email || "";
      const local = email.split("@")[0]?.toLowerCase();
      const metadata = (user?.user_metadata || {}) as Record<string, unknown>;
      const candidates = new Set<string>();
      if (local) candidates.add(local);
      [metadata.full_name, metadata.name, metadata.teacher_name].forEach((value) => {
        if (typeof value === "string" && value.trim()) candidates.add(slugifyName(value));
      });
      const match = ttTeachers.find(t => candidates.has(slugifyName(t.name)) || candidates.has(slugifyName(`${t.title} ${t.name}`)));
      setTeacherAccount(match || null);
    })();
  }, [roleLoading, hasFullMarksAccess, ttTeachers]);

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
  // Teacher-selected active subject (only this column is editable)
  const [activeSubject, setActiveSubject] = useState<string>("");
  // Teacher-selected active class (filters students to that class only)
  const [activeClass, setActiveClass] = useState<string>("");
  // Subjects unlocked this session after entering the per-subject password
  const [unlockedSubjects, setUnlockedSubjects] = useState<Set<string>>(new Set());

  const pwKey = (code: string) => `mark-pw:${teacherAccount?.id || "anon"}:${code}`;
  const unlockSubject = (code: string): boolean => {
    const stored = localStorage.getItem(pwKey(code));
    if (!stored) {
      const p1 = prompt(`Set a password for ${SUBJECT_CODES[code] || code} (${code}). It will be required each time you enter marks for this subject.`);
      if (!p1) return false;
      const p2 = prompt("Confirm password");
      if (p1 !== p2) { toast({ title: "Passwords do not match", variant: "destructive" }); return false; }
      localStorage.setItem(pwKey(code), btoa(p1));
      setUnlockedSubjects(prev => new Set(prev).add(code));
      toast({ title: `Password set for ${code}` });
      return true;
    }
    const entered = prompt(`Enter password for ${SUBJECT_CODES[code] || code} (${code})`);
    if (!entered) return false;
    if (btoa(entered) !== stored) { toast({ title: "Wrong password", variant: "destructive" }); return false; }
    setUnlockedSubjects(prev => new Set(prev).add(code));
    return true;
  };
  const resetSubjectPassword = (code: string) => {
    const stored = localStorage.getItem(pwKey(code));
    if (stored) {
      const entered = prompt(`Enter CURRENT password for ${code} to reset it`);
      if (!entered) return;
      if (btoa(entered) !== stored) { toast({ title: "Wrong password", variant: "destructive" }); return; }
    }
    localStorage.removeItem(pwKey(code));
    setUnlockedSubjects(prev => { const n = new Set(prev); n.delete(code); return n; });
    if (activeSubject === code) setActiveSubject("");
    toast({ title: `Password cleared for ${code}. You'll set a new one on next unlock.` });
  };
  const selectSubject = (code: string) => {
    if (!code) { setActiveSubject(""); return; }
    if (unlockedSubjects.has(code)) { setActiveSubject(code); return; }
    if (unlockSubject(code)) setActiveSubject(code);
  };

  useEffect(() => {
    if (!restrictedMarksMode || !activeSubject) return;
    if (!teacherScope?.allowedCodes.has(activeSubject)) setActiveSubject("");
  }, [restrictedMarksMode, activeSubject, teacherScope]);

  // Reset selected class when subject changes so teacher picks the correct class next.
  useEffect(() => { setActiveClass(""); }, [activeSubject, examId]);

  // Classes available to filter by (based on selected subject for teachers, or all present classes for admins).
  const availableClasses = useMemo(() => {
    const set = new Set<string>();
    if (restrictedMarksMode && teacherScope && activeSubject) {
      const assigned = teacherScope.codeToClasses.get(activeSubject);
      if (assigned && assigned.size > 0) assigned.forEach(c => set.add(c));
    }
    // Always union with the classes actually present in the loaded student list.
    students.forEach(s => { const c = studentClassId(s); if (c) set.add(c); });
    return Array.from(set).sort();
  }, [restrictedMarksMode, teacherScope, activeSubject, students]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("exams").select("id, name, form_levels, published").order("created_at", { ascending: false });
      setExams((data || []) as Exam[]);
    })();
  }, []);

  const activeExam = exams.find(e => e.id === examId);

  const canTeacherEnterSubjectForStudent = (student: Profile, code: string): boolean => {
    if (!restrictedMarksMode) return true;
    if (!teacherScope?.allowedCodes.has(code)) return false;
    const allowedClasses = teacherScope.codeToClasses.get(code);
    if (!allowedClasses || allowedClasses.size === 0) return true;
    const cid = studentClassId(student);
    return !!cid && allowedClasses.has(cid);
  };

  useEffect(() => {
    if (roleLoading) return;
    if (!activeExam) { setStudents([]); setMarks({}); setSubjects([]); return; }
    // Hard block: the teacher portal must never fall back to the full admin mark schedule.
    if (restrictedMarksMode && (!teacherScope || teacherScope.allowedCodes.size === 0)) {
      setStudents([]); setMarks({}); setSubjects([]); return;
    }
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
        if (restrictedMarksMode && (!teacherScope?.allowedCodes.has(code))) continue;
        subjSet.add(code);
      }
      for (const r of (rows || []) as any[]) {
        const sid = r.student_profile_id;
        const code = normalizeSubjectCode(r.subject_code);
        if (restrictedMarksMode && (!teacherScope?.allowedCodes.has(code))) continue;
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
  }, [examId, activeExam, teacherScope, restrictedMarksMode, roleLoading, ttSubjects]);


  const saveAll = async () => {
    if (!activeExam) return;
    if (restrictedMarksMode && (!activeSubject || !unlockedSubjects.has(activeSubject))) {
      return toast({ title: "Select and unlock your subject first", variant: "destructive" });
    }
    setSaving(true);
    const payload: any[] = [];
    for (const s of students) {
      const level = formToLevel(s.form);
      const row = marks[s.id] || {};
      for (const code of Object.keys(row)) {
        const mark = row[code];
        if (mark == null || isNaN(mark as number)) continue;
        if (restrictedMarksMode) {
          if (code !== activeSubject || !canTeacherEnterSubjectForStudent(s, code)) continue;
        }
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

  const downloadPdf = () => {
    if (!activeExam) return toast({ title: "Choose an exam first", variant: "destructive" });
    // Determine columns: restricted teacher = only their active subject; otherwise all present subjects
    const codes = restrictedMarksMode
      ? (activeSubject ? [activeSubject] : Array.from(teacherScope?.allowedCodes || []))
      : Array.from(new Set([
          ...subjects,
          ...Object.values(marks).flatMap(r => Object.keys(r || {})),
        ]));
    if (!codes.length) return toast({ title: "Nothing to export", variant: "destructive" });
    const rows = orderedStudents;
    if (!rows.length) return toast({ title: "No students to export", variant: "destructive" });

    const doc = new jsPDF({ orientation: codes.length > 4 ? "landscape" : "portrait", unit: "pt", format: "a4" });
    const title = `${activeExam.name} — Mark Schedule`;
    const sub = restrictedMarksMode && teacherAccount
      ? `Teacher: ${teacherAccount.title || ""} ${teacherAccount.name}`.trim()
      : "";
    doc.setFontSize(14); doc.text(title, 40, 40);
    if (sub) { doc.setFontSize(10); doc.text(sub, 40, 58); }
    if (activeClass) { doc.setFontSize(10); doc.text(`Class: ${activeClass}`, 40, sub ? 72 : 58); }

    const head = [["#", "Student", "Class", ...codes.flatMap(c => [c, "Grade"])]];
    const body = rows.map((s, i) => {
      const level = formToLevel(s.form);
      const row = marks[s.id] || {};
      const cells: (string | number)[] = [i + 1, `${s.last_name} ${s.first_name}`, `F${s.form || "-"} ${s.stream || ""}`.trim()];
      for (const c of codes) {
        const m = row[c];
        cells.push(m == null || isNaN(m as number) ? "" : String(m));
        cells.push(m == null || isNaN(m as number) ? "" : computeGrade(m as number, level, c));
      }
      return cells;
    });
    autoTable(doc, {
      head, body,
      startY: (activeClass ? 88 : sub ? 82 : 68),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [0, 51, 102], textColor: 255 },
      columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 140 }, 2: { cellWidth: 50 } },
    });
    const stamp = new Date().toISOString().slice(0, 10);
    const fname = `${activeExam.name.replace(/\s+/g, "_")}_${activeClass || "all"}_${stamp}.pdf`;
    doc.save(fname);
    toast({ title: "PDF downloaded" });
  };


  const handleCapture = async (dataUrl: string) => {
    setScanOpen(false);
    if (!activeExam) {
      toast({ title: "Choose an exam first", variant: "destructive" });
      return;
    }
    if (restrictedMarksMode && (!activeSubject || !unlockedSubjects.has(activeSubject))) {
      toast({ title: "Select and unlock your subject first", variant: "destructive" });
      return;
    }
    setOcrLoading(true);
    try {
      const expectedSubjectCodes = Array.from(new Set([
        ...(restrictedMarksMode ? [activeSubject] : subjects),
        ...students.flatMap((s) => subjectsForStudent(s).map((sub) => sub.code)),
      ])).filter(Boolean);
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
      (subject_codes || []).forEach(c => {
        const code = normalizeSubjectCode(c);
        if (restrictedMarksMode && code !== activeSubject) return;
        pushOrder(code);
      });
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
          // Teachers may only capture marks for their own subject(s).
          if (restrictedMarksMode && code !== activeSubject) continue;
          nextMarks[s.id][code] = mark;
          subjSet.add(code);
          pushOrder(code);
          cellCount++;
        }
      }

      (subject_codes || []).forEach(c => {
        const code = normalizeSubjectCode(c);
        if (restrictedMarksMode && code !== activeSubject) return;
        subjSet.add(code);
      });

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
    if (restrictedMarksMode) {
      if (!teacherScope?.allowedCodes.has(code)) {
        toast({ title: "Not your subject", variant: "destructive" }); return;
      }
      if (activeSubject !== code) {
        toast({ title: "Select this subject first", variant: "destructive" }); return;
      }
      if (!unlockedSubjects.has(code)) {
        if (!unlockSubject(code)) return;
      }
    }
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
      if (!code) return;
      if (restrictedMarksMode && !teacherScope?.allowedCodes.has(code)) return;
      // Enforce per-subject class assignment: teacher must be assigned to this student's class.
      if (restrictedMarksMode && teacherScope) {
        const cid = studentClassId(s);
        const allowedClasses = teacherScope.codeToClasses.get(code);
        if (allowedClasses && allowedClasses.size > 0 && (!cid || !allowedClasses.has(cid))) return;
      }
      map.set(code, sb.name || code);
    });
    // Include any extra codes already saved for this student
    Object.keys(marks[s.id] || {}).forEach(c => {
      if (restrictedMarksMode && !teacherScope?.allowedCodes.has(c)) return;
      if (!map.has(c)) map.set(c, SUBJECT_CODES[c] || c);
    });
    // In teacher mode, the selected subject must be editable for every assigned class
    // even when the subject/class ticks in the Subjects module are incomplete.
    if (restrictedMarksMode && activeSubject && canTeacherEnterSubjectForStudent(s, activeSubject)) {
      map.set(activeSubject, SUBJECT_CODES[activeSubject] || activeSubject);
    }
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
    let base = students;
    if (activeClass) base = base.filter(s => studentClassId(s) === activeClass);
    if (!scanStudentOrder.length) return base;
    const rank = new Map(scanStudentOrder.map((id, i) => [id, i]));
    const originalIndex = new Map(base.map((s, i) => [s.id, i]));
    return [...base].sort((a, b) => {
      const ra = rank.has(a.id) ? (rank.get(a.id) as number) : Number.POSITIVE_INFINITY;
      const rb = rank.has(b.id) ? (rank.get(b.id) as number) : Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra - rb;
      return (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0);
    });
  }, [students, scanStudentOrder, activeClass]);

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Enter Marks</h2>

        {restrictedMarksMode && (
          <Card><CardContent className="p-3 text-xs bg-slate-50 border rounded">
            <b>Account check:</b> role=<code>{roleLoading ? "checking" : role || "not admin"}</code> · teacherMatched=<code>{teacherAccount ? teacherAccount.name : "NO MATCH"}</code> · subjectsAssigned=<code>{teacherScope ? teacherScope.allowedCodes.size : 0}</code>
            {teacherScope && teacherScope.allowedCodes.size > 0 && (
              <> · codes=<code>{Array.from(teacherScope.allowedCodes).join(", ")}</code></>
            )}
          </CardContent></Card>
        )}
        {restrictedMarksMode && !roleLoading && !teacherAccount && (
          <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded">
            Your login email does not match any teacher record in Timetable → Teachers. Ask an administrator to add your name so it slugifies to your email prefix (e.g. <code>jane.doe</code>).
          </CardContent></Card>
        )}
        {restrictedMarksMode && teacherAccount && (!teacherScope || teacherScope.allowedCodes.size === 0) && (
          <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded">
            Your teacher profile <b>{teacherAccount.name}</b> has no subject assignments. Ask an admin to assign subjects/classes in Timetable → Teachers.
          </CardContent></Card>
        )}

        <Card>
          <CardContent className="p-4 flex flex-wrap gap-3 items-end">
            <div className="min-w-[260px]">
              <Label>Exam</Label>
              <Select value={examId} onValueChange={setExamId}>
                <SelectTrigger><SelectValue placeholder="Select exam"/></SelectTrigger>
                <SelectContent>{exams.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {restrictedMarksMode && teacherScope && teacherScope.allowedCodes.size > 0 && (
              <div className="min-w-[220px]">
                <Label>Subject (password-protected)</Label>
                <Select value={activeSubject} onValueChange={selectSubject}>
                  <SelectTrigger><SelectValue placeholder="Select your subject"/></SelectTrigger>
                  <SelectContent>
                    {Array.from(teacherScope.allowedCodes).sort().map(c => (
                      <SelectItem key={c} value={c}>
                        {SUBJECT_CODES[c] || c} ({c}) {unlockedSubjects.has(c) ? "🔓" : "🔒"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {restrictedMarksMode && activeSubject && (
              <Button variant="outline" size="sm" onClick={() => resetSubjectPassword(activeSubject)}>
                Reset password
              </Button>
            )}
            {availableClasses.length > 0 && (
              <div className="min-w-[180px]">
                <Label>Class</Label>
                <Select value={activeClass || "__all"} onValueChange={(v) => setActiveClass(v === "__all" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="All classes"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All classes</SelectItem>
                    {availableClasses.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={() => setScanOpen(true)} variant="outline" className="gap-2" disabled={!activeExam || ocrLoading || (restrictedMarksMode && !activeSubject)}>
              {ocrLoading ? <Loader2 className="animate-spin" size={14}/> : <Camera size={14}/>} Scan Mark Sheet
            </Button>
            <Button onClick={() => setPhonePairOpen(true)} variant="outline" className="gap-2" disabled={!activeExam || ocrLoading || (restrictedMarksMode && !activeSubject)} title="Scan QR with phone to capture from phone camera">
              <Camera size={14}/> Use Phone Camera
            </Button>
            <Button onClick={saveAll} className="gap-2" disabled={!activeExam || saving || (restrictedMarksMode && !activeSubject)}>
              {saving ? <Loader2 className="animate-spin" size={14}/> : <Save size={14}/>} Save All
            </Button>
          </CardContent>
        </Card>

        {restrictedMarksMode && teacherScope && teacherScope.allowedCodes.size > 0 && !activeSubject && (
          <Card><CardContent className="p-4 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded">
            Select a subject above and enter its password to reveal the mark column. Each subject you teach has its own password so no one else can access it from your account.
          </CardContent></Card>
        )}

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
          const allowCode = (c: string) => !restrictedMarksMode || !!teacherScope?.allowedCodes.has(c);
          if (restrictedMarksMode) {
            // Strict teacher mode: only the selected & unlocked subject is shown as a column.
            if (activeSubject && teacherScope?.allowedCodes.has(activeSubject) && unlockedSubjects.has(activeSubject)) {
              colMap.set(activeSubject, SUBJECT_CODES[activeSubject] || activeSubject);
            }
          } else {
            subjects.forEach(c => { if (allowCode(c) && !colMap.has(c)) colMap.set(c, SUBJECT_CODES[c] || c); });
            scanOrder.forEach(c => { if (allowCode(c) && !colMap.has(c)) colMap.set(c, SUBJECT_CODES[c] || c); });
            Object.values(marks).forEach(r => Object.keys(r || {}).forEach(c => {
              if (allowCode(c) && !colMap.has(c)) colMap.set(c, SUBJECT_CODES[c] || c);
            }));
          }
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
                  <div className="text-sm text-muted-foreground">
                    {orderedStudents.length} students · {columns.length} subjects
                    {restrictedMarksMode && <span className="ml-2 text-blue-600">· Restricted to your subject{teacherScope?.allowedCodes.size === 1 ? "" : "s"}</span>}
                  </div>
                  {hasFullMarksAccess && <Button size="sm" variant="outline" onClick={addColumn}>+ Subject Column</Button>}
                </div>
                <div className="relative overflow-auto max-h-[75vh]">
                  <table className="caption-bottom text-sm border-separate border-spacing-0">
                    <thead>
                      <tr>
                        <th className="sticky top-0 left-0 z-[60] bg-background border-b border-r h-12 px-3 text-left align-middle font-semibold text-muted-foreground min-w-[220px] w-[220px] shadow-sm">Student</th>
                        {columns.map(col => (
                          <th key={col.code} title={col.name}
                              className="sticky top-0 z-50 bg-background border-b border-r h-12 px-2 text-center align-middle font-semibold text-muted-foreground min-w-[96px] w-[96px] shadow-sm">
                            {col.code}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {orderedStudents.map(s => {
                        const level = formToLevel(s.form);
                        const row = marks[s.id] || {};
                        const isMatched = lastMatched.has(s.id);
                        const allowed = new Set(subjectsForStudent(s).map(x => x.code));
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
                              const isAllowed = restrictedMarksMode
                                ? canTeacherEnterSubjectForStudent(s, col.code)
                                : allowed.has(col.code) || m != null;
                              return (
                                <td key={col.code} className="border-b border-r p-1 text-center min-w-[96px] w-[96px]">
                                  {isAllowed ? (
                                    <div className="flex items-center justify-center gap-1">
                                      <Input type="number" min={0} max={100}
                                        className="h-8 px-1 text-center text-sm w-14"
                                        value={m ?? ""}
                                        onChange={(e) => updateMark(s.id, col.code, e.target.value)}/>
                                      {m != null && (
                                        <span className={`text-xs font-bold min-w-[18px] ${computeGrade(m, level) === "U" ? "text-red-600" : "text-blue-600"}`}>
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
