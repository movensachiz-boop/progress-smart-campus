import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import StatCard from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, CreditCard, AlertTriangle, Bell, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const announcements = [
  { title: "Term 2 Exam Timetable Released", date: "Mar 28, 2025", priority: "high" },
  { title: "School Fees Deadline: April 15", date: "Mar 25, 2025", priority: "high" },
  { title: "Sports Day – April 5th", date: "Mar 20, 2025", priority: "low" },
];

interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  registration_number: string;
  form: string | null;
  stream: string | null;
  gender: string;
  balance: number;
  is_beginner: boolean;
  residency: string;
}

interface Payment {
  id: string;
  receipt_number: string | null;
  created_at: string;
  amount: number;
  method: string;
  status: string;
}

const StudentDashboard = () => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [termFees, setTermFees] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load profile
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, registration_number, form, stream, gender, balance, is_beginner, residency")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!prof) return;
      setProfile(prof as Profile);

      // Load fee requirements for this student's form
      if (prof.form) {
        // Load all active fee requirements (beginner students need all categories)
        const { data: feeItems } = await supabase
          .from("fee_requirements")
          .select("*")
          .eq("is_active", true);

        if (feeItems) {
          const formNum = prof.form;
          const stream = prof.stream || "";
          const studentGender = prof.gender === "female" ? "girls" : "boys";
          const isBeginner = prof.is_beginner;
          const residency = prof.residency || "day";
          const learningArea = ["Sciences", "Commercials", "Arts"].includes(stream) ? stream : null;

          const applicable = feeItems.filter((item: any) => {
            if (item.category !== "fees" && !isBeginner) return false;
            if (item.beginner_only && !isBeginner) return false;
            if (item.returning_only && isBeginner) return false;
            if (!item.form_levels.includes(formNum)) return false;
            if (item.gender !== "all" && item.gender !== studentGender) return false;
            if (item.residency && item.residency !== "all" && item.residency !== residency) return false;
            if (item.learning_area) {
              return item.learning_area === learningArea;
            }
            return true;
          });

          const total = applicable.reduce((sum: number, i: any) => sum + Number(i.amount), 0);
          setTermFees(total);
        }
      }

      // Load payments
      const { data: paymentData } = await supabase
        .from("payments")
        .select("id, receipt_number, created_at, amount, method, status")
        .eq("student_profile_id", prof.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (paymentData) {
        setPayments(paymentData);
        const paid = paymentData
          .filter((p: any) => p.status === "paid" || p.status === "completed")
          .reduce((sum: number, p: any) => sum + Number(p.amount), 0);
        setTotalPaid(paid);
      }
    };
    load();
  }, []);

  const outstanding = Math.max(0, termFees - totalPaid);

  return (
    <DashboardLayout role="student">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            Welcome, {profile ? `${profile.first_name} ${profile.last_name}` : "..."}
          </h2>
          <p className="text-muted-foreground">
            Reg: {profile?.registration_number || "..."} · Form {profile?.form || "—"} · {profile?.stream || "—"} Stream
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Term Fees" value="Processing" icon={DollarSign} variant="primary" />
          <StatCard title="Paid" value="Processing" icon={CreditCard} variant="success" />
          <StatCard title="Outstanding" value="Processing" icon={AlertTriangle} variant="warning" />
          <StatCard title="Notices" value="3" icon={Bell} variant="accent" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Payment History</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <DollarSign className="text-primary" size={32} />
                </div>
                <div>
                  <p className="text-lg font-semibold text-foreground">Fee Information Processing</p>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    We are currently updating our fee records. Please check back soon or contact the school office for your latest payment details.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Announcements</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {announcements.map((a, i) => (
                <div key={i} className="border-b last:border-0 pb-3 last:pb-0">
                  <div className="flex items-start gap-2">
                    <Bell size={14} className={a.priority === "high" ? "text-destructive mt-0.5" : "text-muted-foreground mt-0.5"} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{a.date}</p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default StudentDashboard;
