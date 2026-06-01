import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, XCircle, Clock, Save, Users } from "lucide-react";

const VALID_STREAMS: Record<string, string[]> = {
  "1": ["G1", "G2", "G22", "Blue"],
  "2": ["G1", "G2", "G22", "Blue"],
  "3": ["G1", "G2", "G22", "Blue"],
  "4": ["G1", "G2", "G22", "Blue"],
  "5": ["Sciences", "Commercials", "Arts"],
  "6": ["Sciences", "Commercials", "Arts"],
};

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  registration_number: string;
}

type AttStatus = "present" | "absent" | "late";

export default function TeacherAttendance() {
  const [form, setForm] = useState("1");
  const [stream, setStream] = useState("G1");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [marks, setMarks] = useState<Record<string, AttStatus>>({});
  const [existingIds, setExistingIds] = useState<Record<string, string>>({}); // student_profile_id -> attendance row id
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const streams = VALID_STREAMS[form] || [];

  useEffect(() => {
    if (!streams.includes(stream)) setStream(streams[0] || "G1");
  }, [form]);

  useEffect(() => { loadStudents(); }, [form, stream, date]);

  const loadStudents = async () => {
    setLoading(true);
    try {
      // Use student_roster view (no sensitive data)
      const { data: studs } = await supabase
        .from("student_roster" as any)
        .select("id, first_name, last_name, registration_number")
        .eq("form", form)
        .eq("stream", stream)
        .order("last_name");

      const studentList = (studs || []) as unknown as StudentRow[];
      setStudents(studentList);

      if (studentList.length > 0) {
        const ids = studentList.map(s => s.id);
        const { data: attData } = await supabase
          .from("attendance")
          .select("id, student_profile_id, status")
          .in("student_profile_id", ids)
          .eq("date", date);

        const markMap: Record<string, AttStatus> = {};
        const idMap: Record<string, string> = {};
        for (const row of attData || []) {
          markMap[row.student_profile_id] = row.status as AttStatus;
          idMap[row.student_profile_id] = row.id;
        }
        // Default unmarked to present
        for (const s of studentList) {
          if (!markMap[s.id]) markMap[s.id] = "present";
        }
        setMarks(markMap);
        setExistingIds(idMap);
      } else {
        setMarks({});
        setExistingIds({});
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = (studentId: string) => {
    setMarks(prev => {
      const current = prev[studentId] || "present";
      const next: AttStatus = current === "present" ? "absent" : current === "absent" ? "late" : "present";
      return { ...prev, [studentId]: next };
    });
  };

  const classId = `${form}${parseInt(form) >= 5 ? stream.charAt(0) : stream}`;

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Not authenticated"); return; }

      for (const student of students) {
        const status = marks[student.id] || "present";
        if (existingIds[student.id]) {
          // Update existing
          await supabase.from("attendance").update({ status, marked_by: user.id }).eq("id", existingIds[student.id]);
        } else {
          // Insert new
          await supabase.from("attendance").insert({
            student_profile_id: student.id,
            date,
            status,
            class_id: classId,
            marked_by: user.id,
          });
        }
      }
      toast.success("Attendance saved successfully");
      loadStudents(); // Refresh to get IDs
    } catch (e: any) {
      toast.error("Failed to save: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const markAll = (status: AttStatus) => {
    const updated: Record<string, AttStatus> = {};
    students.forEach(s => { updated[s.id] = status; });
    setMarks(updated);
  };

  const counts = {
    present: Object.values(marks).filter(v => v === "present").length,
    absent: Object.values(marks).filter(v => v === "absent").length,
    late: Object.values(marks).filter(v => v === "late").length,
  };

  const statusIcon = (s: AttStatus) => {
    if (s === "present") return <CheckCircle className="w-4 h-4 text-green-600" />;
    if (s === "absent") return <XCircle className="w-4 h-4 text-destructive" />;
    return <Clock className="w-4 h-4 text-yellow-600" />;
  };

  const statusBadge = (s: AttStatus) => {
    const variants: Record<AttStatus, string> = {
      present: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      absent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      late: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    };
    return variants[s];
  };

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Attendance Register</h2>
            <p className="text-sm text-muted-foreground">Mark daily attendance for each class</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={form} onValueChange={setForm}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["1","2","3","4","5","6"].map(f => (
                <SelectItem key={f} value={f}>Form {f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={stream} onValueChange={setStream}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {streams.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>

        {/* Summary */}
        <div className="flex gap-4 flex-wrap">
          <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 gap-1 px-3 py-1">
            <CheckCircle className="w-3.5 h-3.5" /> {counts.present} Present
          </Badge>
          <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 gap-1 px-3 py-1">
            <XCircle className="w-3.5 h-3.5" /> {counts.absent} Absent
          </Badge>
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 gap-1 px-3 py-1">
            <Clock className="w-3.5 h-3.5" /> {counts.late} Late
          </Badge>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => markAll("present")}>All Present</Button>
          <Button size="sm" variant="outline" onClick={() => markAll("absent")}>All Absent</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || students.length === 0}>
            <Save className="w-4 h-4 mr-1" />{saving ? "Saving..." : "Save Attendance"}
          </Button>
        </div>

        {/* Student list */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" /> Class {classId} — {date}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : students.length === 0 ? (
              <p className="p-6 text-center text-muted-foreground">No students in Form {form} — {stream}</p>
            ) : (
              <div className="divide-y">
                {students.map((s, i) => {
                  const status = marks[s.id] || "present";
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleStatus(s.id)}
                      className="w-full flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                    >
                      <span className="text-sm text-muted-foreground w-6">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.first_name} {s.last_name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{s.registration_number}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {statusIcon(status)}
                        <Badge variant="secondary" className={`${statusBadge(status)} text-[10px] capitalize`}>
                          {status}
                        </Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
