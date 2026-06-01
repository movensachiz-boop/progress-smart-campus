import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useTimetable } from "@/context/TimetableContext";
import { Skeleton } from "@/components/ui/skeleton";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;

const subjectColor = (type: string) => {
  if (type === "break" || type === "lunch") return "bg-muted text-muted-foreground";
  if (type === "sports") return "bg-accent/20 text-accent-foreground";
  return "bg-primary/10 text-primary";
};

const StudentTimetable = () => {
  const [profile, setProfile] = useState<{ form: string | null; stream: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const { timetable, subjects, classes, config } = useTimetable();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from("profiles")
        .select("form, stream")
        .eq("user_id", user.id)
        .maybeSingle();
      setProfile(data);
      setLoading(false);
    })();
  }, []);

  const classId = profile?.form && profile?.stream ? `${profile.form}${profile.stream}` : null;
  const cls = classes.find(c => c.id === classId);

  // Build period times from config
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

  // Get slots for this class grouped by period
  const classSlots = timetable?.slots.filter(s => s.classId === classId) || [];
  const periods = [...new Set(classSlots.map(s => s.period))].sort((a, b) => a - b);

  if (loading) {
    return (
      <DashboardLayout role="student">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="student">
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-foreground">My Timetable</h2>
        {!classId ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">
            Your form and stream have not been set. Please contact the administration.
          </CardContent></Card>
        ) : !timetable ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">
            No timetable has been generated yet. Please check back later.
          </CardContent></Card>
        ) : (
          <Card className="shadow-card overflow-x-auto">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Form {profile?.form} – {profile?.stream}
                {cls && <span className="text-muted-foreground font-normal ml-2">({cls.subjectIds.length} subjects)</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary">
                    <th className="text-left p-3 font-semibold text-foreground">Time</th>
                    {days.map(d => <th key={d} className="text-left p-3 font-semibold text-foreground">{d}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {periods.map(period => {
                    const slotsForPeriod = days.map(day => classSlots.find(s => s.day === day && s.period === period));
                    return (
                      <tr key={period} className="border-t">
                        <td className="p-3 font-medium text-muted-foreground whitespace-nowrap">{buildPeriodLabel(period)}</td>
                        {slotsForPeriod.map((slot, i) => {
                          if (!slot) return <td key={i} className="p-3">—</td>;
                          if (slot.type !== "lesson") {
                            return (
                              <td key={i} className="p-3">
                                <Badge variant="secondary" className={subjectColor(slot.type)}>
                                  {slot.type === "break" ? "Break" : slot.type === "lunch" ? "Lunch" : "Sports"}
                                </Badge>
                              </td>
                            );
                          }
                          const subj = subjects.find(s => s.id === slot.subjectId);
                          return (
                            <td key={i} className="p-3">
                              <Badge variant="secondary" className={subjectColor("lesson")}>
                                {subj?.name || "Free"}
                              </Badge>
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
};

export default StudentTimetable;
