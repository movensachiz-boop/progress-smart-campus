import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTimetable } from "@/context/TimetableContext";
import { formToLevel, computeGrade, normalizeSubjectCode, SUBJECT_CODES } from "@/lib/grading";
import type { Teacher } from "@/types/school";

type Exam = { id: string; name: string; form_levels: number[] };
type Profile = { id: string; first_name: string; last_name: string; form: string | null; stream: string | null };
type Result = { student_profile_id: string; subject_code: string; mark: number | null };

const studentClassId = (s: { form: string | null; stream: string | null }): string | null => {
  const fn = Number(s.form);
  if (!fn) return null;
  const stream = (s.stream || "").trim();
  if (!stream) return null;
  if (fn >= 5) return `${fn}${stream.charAt(0).toUpperCase()}`;
  return `${fn}${stream}`;
};

const slugifyName = (n: string) =>
  n.toLowerCase().trim().replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "");

const TeacherClassTeacher = () => {
  const { toast } = useToast();
  const { teachers: ttTeachers, classes: ttClasses } = useTimetable();

  const [userId, setUserId] = useState<string>("");
  const [teacherAccount, setTeacherAccount] = useState<Teacher | null>(null);
  const [myClasses, setMyClasses] = useState<string[]>([]);       // classes teacher teaches (from timetable)
  const [assignedClasses, setAssignedClasses] = useState<string[]>([]); // class-teacher-of (DB)
  const [manageOpen, setManageOpen] = useState(false);

  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState("");
  const [classId, setClassId] = useState("");
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState<Profile[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // identify signed-in teacher
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const email = user.email || "";
      const local = email.split("@")[0]?.toLowerCase();
      const match = ttTeachers.find(t => slugifyName(t.name) === local);
      setTeacherAccount(match || null);
    })();
  }, [ttTeachers]);

  // derive classes teacher teaches
  useEffect(() => {
    if (!teacherAccount) { setMyClasses([]); return; }
    const set = new Set<string>();
    (teacherAccount.assignments || []).forEach(a => (a.classIds || []).forEach(c => set.add(c)));
    setMyClasses(Array.from(set).sort());
  }, [teacherAccount]);

  // load class-teacher assignments
  const loadAssignments = async (uid: string) => {
    const { data } = await (supabase as any).from("class_teacher_assignments")
      .select("class_id").eq("teacher_user_id", uid);
    setAssignedClasses((data || []).map((r: any) => r.class_id));
  };
  useEffect(() => { if (userId) loadAssignments(userId); }, [userId]);

  const toggleAssignment = async (cls: string, checked: boolean) => {
    if (!userId) return;
    if (checked) {
      const { error } = await (supabase as any).from("class_teacher_assignments")
        .insert({ teacher_user_id: userId, class_id: cls });
      if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      const { error } = await (supabase as any).from("class_teacher_assignments")
        .delete().eq("teacher_user_id", userId).eq("class_id", cls);
      if (error) return toast({ title: "Remove failed", description: error.message, variant: "destructive" });
    }
    loadAssignments(userId);
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("exams").select("id, name, form_levels").order("created_at", { ascending: false });
      setExams((data || []) as Exam[]);
    })();
  }, []);

  const activeExam = exams.find(e => e.id === examId);

  useEffect(() => {
    if (!activeExam || !classId) { setStudents([]); setResults([]); setComments({}); return; }
    (async () => {
      setLoading(true);
      const [{ data: profs }, { data: rows }] = await Promise.all([
        supabase.from("profiles").select("id, first_name, last_name, form, stream")
          .in("form", activeExam.form_levels.map(String)).order("last_name"),
        supabase.from("exam_results").select("student_profile_id, subject_code, mark").eq("exam_id", examId),
      ]);
      const filtered = ((profs || []) as Profile[]).filter(p => studentClassId(p) === classId);
      setStudents(filtered);
      setResults((rows || []) as Result[]);
      const sids = filtered.map(s => s.id);
      if (sids.length && userId) {
        const { data: cm } = await (supabase as any).from("exam_comments")
          .select("student_profile_id, comment")
          .eq("exam_id", examId)
          .eq("comment_type", "class_teacher")
          .eq("author_user_id", userId)
          .in("student_profile_id", sids);
        const map: Record<string, string> = {};
        (cm || []).forEach((r: any) => { map[r.student_profile_id] = r.comment || ""; });
        setComments(map);
      } else {
        setComments({});
      }
      setLoading(false);
    })();
  }, [examId, classId, activeExam, userId]);

  const resultsByStudent = useMemo(() => {
    const m: Record<string, Result[]> = {};
    results.forEach(r => { (m[r.student_profile_id] ||= []).push(r); });
    return m;
  }, [results]);

  const saveComments = async () => {
    if (!examId || !userId || !students.length) return;
    setSaving(true);
    const payload = students.map(s => ({
      exam_id: examId,
      student_profile_id: s.id,
      comment_type: "class_teacher",
      author_user_id: userId,
      comment: comments[s.id] || "",
    }));
    const { error } = await (supabase as any).from("exam_comments")
      .upsert(payload, { onConflict: "exam_id,student_profile_id,comment_type,author_user_id" });
    setSaving(false);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: `Saved ${payload.length} comment(s)` });
  };

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold">Class Teacher — Comments</h2>
            <p className="text-sm text-muted-foreground">Pick your class(es) and write a comment for each student per exam.</p>
          </div>
          <Button variant="outline" onClick={() => setManageOpen(v => !v)}>
            {manageOpen ? "Hide" : "Manage"} my class-teacher classes
          </Button>
        </div>

        {manageOpen && (
          <Card><CardContent className="p-4">
            <div className="text-sm mb-3">Tick the class(es) you are class teacher of. Only classes you teach appear.</div>
            {myClasses.length === 0 ? (
              <div className="text-sm text-muted-foreground">You are not assigned to any classes in Timetable → Teachers.</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {myClasses.map(c => (
                  <label key={c} className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer">
                    <Checkbox checked={assignedClasses.includes(c)}
                              onCheckedChange={(v) => toggleAssignment(c, !!v)} />
                    <span>{c}</span>
                  </label>
                ))}
              </div>
            )}
          </CardContent></Card>
        )}

        <Card><CardContent className="p-4 flex flex-wrap gap-3 items-end">
          <div className="min-w-[240px]">
            <Label>Exam</Label>
            <Select value={examId} onValueChange={setExamId}>
              <SelectTrigger><SelectValue placeholder="Select exam"/></SelectTrigger>
              <SelectContent>{exams.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="min-w-[200px]">
            <Label>Class</Label>
            {(() => {
              const options = Array.from(new Set([
                ...assignedClasses,
                ...myClasses,
                ...ttClasses.map(c => c.id),
              ])).sort();
              return (
                <Select value={classId} onValueChange={setClassId}>
                  <SelectTrigger><SelectValue placeholder={options.length ? "Select class" : "No classes available"}/></SelectTrigger>
                  <SelectContent>{options.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              );
            })()}
          </div>
          <Button onClick={saveComments} disabled={saving || !students.length} className="gap-2">
            {saving ? <Loader2 className="animate-spin" size={14}/> : <Save size={14}/>} Save Comments
          </Button>
        </CardContent></Card>

        {loading ? (
          <div className="p-8 text-center"><Loader2 className="inline animate-spin mr-2" size={16}/>Loading…</div>
        ) : students.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">
            {examId && classId ? "No students in this class." : "Select an exam and one of your classes to begin."}
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {students.map(s => {
              const level = formToLevel(s.form);
              const rs = resultsByStudent[s.id] || [];
              return (
                <Card key={s.id}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <div className="font-semibold">{s.last_name} {s.first_name}</div>
                        <div className="text-xs text-muted-foreground">F{s.form} {s.stream}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">{rs.length} subject(s) recorded</div>
                    </div>
                    {rs.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {rs.map(r => {
                          const code = normalizeSubjectCode(r.subject_code);
                          const g = r.mark != null ? computeGrade(Number(r.mark), level, code) : "";
                          return (
                            <span key={code} className="text-xs border rounded px-2 py-1 bg-secondary/40">
                              {SUBJECT_CODES[code] || code}: <b>{r.mark ?? "—"}</b> {g && <span className="text-blue-600">({g})</span>}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <Textarea
                      placeholder="Class teacher's overall comment for this student…"
                      value={comments[s.id] || ""}
                      onChange={(e) => setComments(prev => ({ ...prev, [s.id]: e.target.value }))}
                      rows={2}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default TeacherClassTeacher;
