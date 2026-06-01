import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useTimetable } from "@/context/TimetableContext";
import { CalendarDays, Clock } from "lucide-react";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;

const slotColor = (type: string) => {
  if (type === "break" || type === "lunch") return "bg-muted text-muted-foreground";
  if (type === "sports") return "bg-accent/20 text-accent-foreground";
  return "bg-primary/10 text-primary";
};

export default function TeacherTimetable() {
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unmatched, setUnmatched] = useState(false);
  const { timetable, teachers, subjects, classes, config } = useTimetable();

  // Match logged-in user to a teacher record by email/full_name slug
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); setUnmatched(true); return; }
      if (teachers.length === 0) { setLoading(false); return; }

      const email = (user.email || "").toLowerCase();
      const metaName = String((user.user_metadata as any)?.full_name || "").toLowerCase();
      const localPart = email.split("@")[0] || "";
      const nameParts = (metaName || localPart)
        .replace(/[._-]+/g, " ")
        .split(/\s+/)
        .filter(Boolean);

      const match = teachers.find(t => {
        const tParts = t.name.toLowerCase().split(/\s+/);
        if (nameParts.length === 0) return false;
        return nameParts.every(p => tParts.some(tp => tp === p || tp.startsWith(p) || p.startsWith(tp)));
      });

      if (match) setTeacherId(match.id);
      else setUnmatched(true);
      setLoading(false);
    })();
  }, [teachers]);

  const selectedTeacher = teachers.find(t => t.id === teacherId);

  const buildPeriodLabel = (period: number) => {
    if (!config.startTime) return `P${period}`;
    const [h, m] = config.startTime.split(":").map(Number);
    let mins = h * 60 + m;
    for (let p = 1; p < period; p++) {
      mins += config.periodDuration;
      if (p === config.morningBreakAfterPeriod) mins += config.morningBreakDuration;
      if (p === config.lunchAfterPeriod) mins += config.lunchDuration;
    }
    const end = mins + config.periodDuration;
    const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
    return `${fmt(mins)} - ${fmt(end)}`;
  };

  // Get all slots assigned to this teacher
  const teacherSlots = timetable?.slots.filter(s => s.teacherId === teacherId) || [];
  const periods = [...new Set(
    (timetable?.slots || []).map(s => s.period)
  )].sort((a, b) => a - b);

  // Count lessons
  const lessonCount = teacherSlots.filter(s => s.type === "lesson").length;
  const classCount = new Set(teacherSlots.filter(s => s.type === "lesson").map(s => s.classId)).size;

  if (loading) {
    return (
      <DashboardLayout role="teacher">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground">My Timetable</h2>
            <p className="text-sm text-muted-foreground">View your weekly lesson schedule</p>
          </div>
          {selectedTeacher && (
            <Badge variant="secondary" className="text-sm py-1.5 px-3">
              {selectedTeacher.name}
            </Badge>
          )}
        </div>

        {unmatched && (
          <Card className="border-l-4 border-l-destructive">
            <CardContent className="py-4 text-sm">
              <p className="font-semibold mb-1">No teacher record matched your account.</p>
              <p className="text-muted-foreground">
                Ask the admin to add you in <em>Teachers</em> using a name that matches your login name
                (e.g. login <code>jane.doe</code> → teacher "Jane Doe").
              </p>
            </CardContent>
          </Card>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <CalendarDays className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{lessonCount}</p>
                <p className="text-xs text-muted-foreground">Lessons/Week</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                <Clock className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{classCount}</p>
                <p className="text-xs text-muted-foreground">Classes</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                <CalendarDays className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {new Set(teacherSlots.filter(s => s.type === "lesson").map(s => s.subjectId)).size}
                </p>
                <p className="text-xs text-muted-foreground">Subjects</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Timetable grid */}
        {!timetable ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">
            No timetable has been generated yet. Please check back later.
          </CardContent></Card>
        ) : (
          <Card className="shadow-card overflow-x-auto">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {selectedTeacher?.name || "Teacher"} — Weekly Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary">
                    <th className="text-left p-3 font-semibold text-foreground">Time</th>
                    {days.map(d => (
                      <th key={d} className="text-left p-3 font-semibold text-foreground">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periods.map(period => {
                    const slotsForPeriod = days.map(day =>
                      teacherSlots.find(s => s.day === day && s.period === period)
                    );
                    // Check if any slot exists for this period across all timetable slots (for breaks/lunch)
                    const globalSlot = timetable.slots.find(s => s.period === period);
                    const isBreakRow = globalSlot?.type === "break" || globalSlot?.type === "lunch" || globalSlot?.type === "sports";

                    if (isBreakRow) {
                      return (
                        <tr key={period} className="border-t bg-muted/20">
                          <td className="p-3 font-medium text-muted-foreground whitespace-nowrap">
                            {buildPeriodLabel(period)}
                          </td>
                          <td colSpan={5} className="p-3 text-center">
                            <Badge variant="secondary" className={slotColor(globalSlot!.type)}>
                              {globalSlot!.type === "break" ? "☕ Break" : globalSlot!.type === "lunch" ? "🍽 Lunch" : "⚽ Sports"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={period} className="border-t">
                        <td className="p-3 font-medium text-muted-foreground whitespace-nowrap">
                          {buildPeriodLabel(period)}
                        </td>
                        {slotsForPeriod.map((slot, i) => {
                          if (!slot) {
                            return (
                              <td key={i} className="p-3">
                                <span className="text-xs text-muted-foreground">Free</span>
                              </td>
                            );
                          }
                          const subj = subjects.find(s => s.id === slot.subjectId);
                          const cls = classes.find(c => c.id === slot.classId);
                          return (
                            <td key={i} className="p-3">
                              <div className="space-y-1">
                                <Badge variant="secondary" className={slotColor("lesson")}>
                                  {subj?.name || "Lesson"}
                                </Badge>
                                {cls && (
                                  <p className="text-[10px] text-muted-foreground">
                                    F{cls.form} {cls.stream}
                                  </p>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
