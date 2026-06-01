import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Users, CalendarDays, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function TeacherDashboard() {
  const navigate = useNavigate();

  const cards = [
    { label: "Mark Attendance", icon: CheckCircle, path: "/teacher/attendance", color: "bg-green-500/10 text-green-600" },
    { label: "Class Roster", icon: Users, path: "/teacher/roster", color: "bg-primary/10 text-primary" },
    { label: "View Timetable", icon: CalendarDays, path: "/teacher/timetable", color: "bg-primary/10 text-primary" },
  ];

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-foreground">Teacher Dashboard</h2>
        <p className="text-sm text-muted-foreground">Welcome! Select an action below.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map(c => (
            <Card key={c.path} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate(c.path)}>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${c.color}`}>
                  <c.icon className="w-6 h-6" />
                </div>
                <p className="text-lg font-semibold">{c.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
