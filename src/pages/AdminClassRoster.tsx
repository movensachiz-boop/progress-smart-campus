import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Users, DollarSign, CheckCircle, XCircle, Clock } from "lucide-react";

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  registration_number: string;
  form: string | null;
  stream: string | null;
  balance: number;
  status: string;
}

interface AttendanceSummary {
  student_profile_id: string;
  total: number;
  present: number;
  absent: number;
  late: number;
}

const VALID_STREAMS: Record<string, string[]> = {
  "1": ["G1", "G2", "G22", "Blue"],
  "2": ["G1", "G2", "G22", "Blue"],
  "3": ["G1", "G2", "G22", "Blue"],
  "4": ["G1", "G2", "G22", "Blue"],
  "5": ["Sciences", "Commercials", "Arts"],
  "6": ["Sciences", "Commercials", "Arts"],
};

export default function AdminClassRoster() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [form, setForm] = useState(searchParams.get("form") || "1");
  const [stream, setStream] = useState(searchParams.get("stream") || "G1");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceSummary[]>([]);
  const [payments, setPayments] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const streams = VALID_STREAMS[form] || [];

  useEffect(() => {
    if (!streams.includes(stream)) {
      setStream(streams[0] || "G1");
    }
  }, [form]);

  useEffect(() => {
    setSearchParams({ form, stream });
    loadData();
  }, [form, stream]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch students in this class
      const { data: studentData } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, registration_number, form, stream, balance, status")
        .eq("form", form)
        .eq("stream", stream)
        .order("last_name");

      const studs = studentData || [];
      setStudents(studs);

      if (studs.length > 0) {
        const ids = studs.map(s => s.id);

        // Fetch attendance summary
        const { data: attData } = await supabase
          .from("attendance")
          .select("student_profile_id, status")
          .in("student_profile_id", ids);

        // Aggregate attendance
        const attMap: Record<string, AttendanceSummary> = {};
        for (const row of attData || []) {
          if (!attMap[row.student_profile_id]) {
            attMap[row.student_profile_id] = { student_profile_id: row.student_profile_id, total: 0, present: 0, absent: 0, late: 0 };
          }
          attMap[row.student_profile_id].total++;
          if (row.status === "present") attMap[row.student_profile_id].present++;
          else if (row.status === "absent") attMap[row.student_profile_id].absent++;
          else if (row.status === "late") attMap[row.student_profile_id].late++;
        }
        setAttendance(Object.values(attMap));

        // Fetch payment totals
        const { data: payData } = await supabase
          .from("payments")
          .select("student_profile_id, amount, status")
          .in("student_profile_id", ids)
          .eq("status", "paid");

        const payMap: Record<string, number> = {};
        for (const row of payData || []) {
          payMap[row.student_profile_id] = (payMap[row.student_profile_id] || 0) + Number(row.amount);
        }
        setPayments(payMap);
      } else {
        setAttendance([]);
        setPayments({});
      }
    } finally {
      setLoading(false);
    }
  };

  const getAttendance = (id: string) => attendance.find(a => a.student_profile_id === id);
  const getAttendancePercent = (id: string) => {
    const att = getAttendance(id);
    if (!att || att.total === 0) return null;
    return Math.round(((att.present + att.late) / att.total) * 100);
  };

  const classId = `${form}${parseInt(form) >= 5 ? stream.charAt(0) : stream}`;

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Class Roster</h2>
            <p className="text-sm text-muted-foreground">View students per stream with fees and attendance</p>
          </div>
          <div className="flex gap-2">
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
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{students.length}</p>
                <p className="text-xs text-muted-foreground">Students</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{students.filter(s => (payments[s.id] || 0) > 0).length}</p>
                <p className="text-xs text-muted-foreground">Fees Paid</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{students.filter(s => (payments[s.id] || 0) === 0).length}</p>
                <p className="text-xs text-muted-foreground">Fees Unpaid</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {students.length > 0
                    ? Math.round(students.reduce((sum, s) => sum + (getAttendancePercent(s.id) ?? 0), 0) / Math.max(students.filter(s => getAttendancePercent(s.id) !== null).length, 1))
                    : 0}%
                </p>
                <p className="text-xs text-muted-foreground">Avg Attendance</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Student table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Class {classId} — {students.length} student(s)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : students.length === 0 ? (
              <p className="p-6 text-center text-muted-foreground">No students registered in Form {form} — {stream}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary">
                      <th className="text-left p-3 font-semibold">#</th>
                      <th className="text-left p-3 font-semibold">Reg No.</th>
                      <th className="text-left p-3 font-semibold">Name</th>
                      <th className="text-left p-3 font-semibold">Status</th>
                      <th className="text-right p-3 font-semibold">Fees Paid</th>
                      <th className="text-right p-3 font-semibold">Balance</th>
                      <th className="text-center p-3 font-semibold">Attendance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s, i) => {
                      const paid = payments[s.id] || 0;
                      const attPct = getAttendancePercent(s.id);
                      const att = getAttendance(s.id);
                      return (
                        <tr key={s.id} className="border-t hover:bg-muted/30 transition-colors">
                          <td className="p-3 text-muted-foreground">{i + 1}</td>
                          <td className="p-3 font-mono text-xs">{s.registration_number}</td>
                          <td className="p-3 font-medium">{s.first_name} {s.last_name}</td>
                          <td className="p-3">
                            <Badge variant={s.status === "Active" ? "default" : "secondary"} className="text-[10px]">
                              {s.status}
                            </Badge>
                          </td>
                          <td className="p-3 text-right font-mono">
                            {paid > 0 ? (
                              <span className="text-green-600">${paid.toFixed(2)}</span>
                            ) : (
                              <span className="text-destructive">$0.00</span>
                            )}
                          </td>
                          <td className="p-3 text-right font-mono">
                            <span className={s.balance < 0 ? "text-destructive" : "text-foreground"}>
                              ${s.balance.toFixed(2)}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            {attPct !== null ? (
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${attPct >= 80 ? 'bg-green-500' : attPct >= 60 ? 'bg-yellow-500' : 'bg-destructive'}`}
                                    style={{ width: `${attPct}%` }}
                                  />
                                </div>
                                <span className="text-xs font-medium">{attPct}%</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
