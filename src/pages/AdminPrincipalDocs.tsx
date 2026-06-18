import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { generateTargetsFormBatch, TargetsStudent } from "@/lib/generateTargetsForm";
import { generateAttendanceRegister } from "@/lib/generateAttendanceRegister";
import { supabase } from "@/integrations/supabase/client";
import { useTimetable } from "@/context/TimetableContext";
import { FileDown, Users, Loader2, ClipboardList } from "lucide-react";
import { toast } from "sonner";

interface StudentRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  registration_number: string | null;
  form: string | null;
  stream: string | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
}

const ALL_FORMS = [
  { value: "1", label: "Form 1" },
  { value: "2", label: "Form 2" },
  { value: "3", label: "Form 3" },
  { value: "4", label: "Form 4" },
  { value: "5", label: "Form 5" },
  { value: "6", label: "Form 6" },
];

const parseFormNumber = (form: string | null | undefined): number | null => {
  if (!form) return null;
  const m = String(form).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
};

const AdminPrincipalDocs = () => {
  const { subjects } = useTimetable();

  const [term, setTerm] = useState("Term 1");
  const [year, setYear] = useState(String(new Date().getFullYear()));

  const [allStudents, setAllStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selForm, setSelForm] = useState<string>("");
  const [selStream, setSelStream] = useState<string>("ALL");
  const [generating, setGenerating] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState<string>("Parents' Meeting");
  const [meetingDate, setMeetingDate] = useState<string>(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, registration_number, form, stream, guardian_name, guardian_phone")
        .not("form", "is", null)
        .order("form")
        .order("stream")
        .order("last_name");
      if (error) toast.error(error.message);
      else setAllStudents((data || []) as StudentRow[]);
      setLoading(false);
    })();
  }, []);

  const streamsForForm = useMemo(() => {
    if (!selForm) return [];
    const s = new Set<string>();
    allStudents.filter(x => x.form === selForm).forEach(x => x.stream && s.add(x.stream));
    return Array.from(s).sort();
  }, [allStudents, selForm]);

  const filteredStudents = useMemo(() => {
    if (!selForm) return [];
    return allStudents.filter(s =>
      s.form === selForm && (selStream === "ALL" || s.stream === selStream)
    );
  }, [allStudents, selForm, selStream]);

  // Derive subjects per student from Subjects module (matched by form + learning area/stream)
  const subjectsFor = (student: StudentRow): string[] => {
    const fn = parseFormNumber(student.form);
    if (!fn) return [];
    const stream = (student.stream || "").trim();
    const matches = subjects.filter(sb => {
      if (!sb.forms.includes(fn as 1 | 2 | 3 | 4 | 5 | 6)) return false;
      // If subject is restricted to learning areas, match the student's stream
      if (sb.learningAreas && sb.learningAreas.length > 0) {
        if (!stream) return false;
        return sb.learningAreas.some(la => la.toLowerCase() === stream.toLowerCase());
      }
      return true;
    });
    return matches.map(s => s.name);
  };

  const selectedLevel: "O" | "A" = useMemo(() => {
    const fn = parseFormNumber(selForm);
    return fn && fn >= 5 ? "A" : "O";
  }, [selForm]);

  const handleBatch = async () => {
    if (!selForm) return toast.error("Select a class/form first");
    if (!filteredStudents.length) return toast.error("No students in this class");
    setGenerating(true);
    try {
      const students: TargetsStudent[] = filteredStudents.map(s => ({
        studentName: `${s.first_name || ""} ${s.last_name || ""}`.trim(),
        regNo: s.registration_number || "",
        form: s.form || "",
        stream: s.stream || "",
        // O-level: auto-fill subjects; A-level: leave blank for student to fill
        subjects: selectedLevel === "O" ? subjectsFor(s) : [],
      }));
      await generateTargetsFormBatch({
        level: selectedLevel,
        term, year,
        students,
        className: `${selForm}${selStream !== "ALL" ? "-" + selStream : ""}`,
      });
      toast.success(`Generated ${students.length} targets forms`);
    } finally {
      setGenerating(false);
    }
  };

  const handleAttendance = async () => {
    await generateAttendanceRegister({
      meetingTitle,
      meetingDate,
    });
    toast.success("Attendance register downloaded");
  };



  return (
    <DashboardLayout role="admin">
      <div className="space-y-6 max-w-6xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Principal's Documents</h1>
          <p className="text-sm text-muted-foreground">
            Generate official school documents. Student details and subjects are auto-filled from registration and the Subjects module.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users size={18} /> Student Targets Form — by Class</CardTitle>
            <CardDescription>
              Pick a class and download a pack containing one targets form per student. Names, registration numbers and subjects are filled automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>Form</Label>
                <Select value={selForm} onValueChange={(v) => { setSelForm(v); setSelStream("ALL"); }}>
                  <SelectTrigger><SelectValue placeholder="Select form" /></SelectTrigger>
                  <SelectContent>
                    {ALL_FORMS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Stream / Class</Label>
                <Select value={selStream} onValueChange={setSelStream} disabled={!selForm}>
                  <SelectTrigger><SelectValue placeholder="All streams" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All streams</SelectItem>
                    {streamsForForm.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Term</Label>
                <Select value={term} onValueChange={setTerm}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Term 1">Term 1</SelectItem>
                    <SelectItem value="Term 2">Term 2</SelectItem>
                    <SelectItem value="Term 3">Term 3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Year</Label>
                <Input value={year} onChange={(e) => setYear(e.target.value)} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="secondary" className="h-9 px-3 flex items-center">
                {loading ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
                {filteredStudents.length} student{filteredStudents.length === 1 ? "" : "s"}
              </Badge>
              <Badge variant="outline" className="h-9 px-3 flex items-center">
                {selectedLevel} Level
              </Badge>
              <Button onClick={handleBatch} disabled={generating || !selForm || !filteredStudents.length} className="gap-2 ml-auto">
                {generating ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                Download Class Pack ({filteredStudents.length})
              </Button>
            </div>

            {filteredStudents.length > 0 && (
              <div className="border rounded-md max-h-80 overflow-auto text-sm">
                <table className="w-full">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">#</th>
                      <th className="text-left px-3 py-2 font-medium">Reg No.</th>
                      <th className="text-left px-3 py-2 font-medium">Name</th>
                      <th className="text-left px-3 py-2 font-medium">Class</th>
                      <th className="text-left px-3 py-2 font-medium">Subjects</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((s, i) => {
                      const subs = subjectsFor(s);
                      return (
                        <tr key={s.id} className="border-t align-top">
                          <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-1.5 font-mono">{s.registration_number}</td>
                          <td className="px-3 py-1.5">{[s.first_name, s.last_name].filter(Boolean).join(" ")}</td>
                          <td className="px-3 py-1.5">{s.form} {s.stream}</td>
                          <td className="px-3 py-1.5 text-xs text-muted-foreground">
                            {subs.length ? `${subs.length}: ${subs.join(", ")}` : <span className="text-destructive">No subjects matched — check Subjects module</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!subjects.length && (
              <p className="text-xs text-destructive">
                No subjects defined yet. Add subjects in the Subjects module first.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ClipboardList size={18} /> Parent / Guardian Attendance Register</CardTitle>
            <CardDescription>
              Download a blank printable attendance register for parents' meetings. Columns: Name of Parent, Name of Learner, Contact, Signature.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Meeting Title</Label>
                <Input value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)} placeholder="e.g. Term 1 Parents' Consultation" />
              </div>
              <div className="space-y-1.5">
                <Label>Meeting Date</Label>
                <Input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={handleAttendance} className="gap-2">
                <FileDown size={16} /> Download Attendance Register
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This downloads a blank form — fill in details by hand during the meeting.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AdminPrincipalDocs;
