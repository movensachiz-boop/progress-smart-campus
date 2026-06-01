import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import StatCard from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, DollarSign, AlertTriangle, TrendingUp, CalendarDays, UserPlus } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";

interface RecentPayment {
  student: string;
  reg: string;
  amount: number;
  currency: string;
  method: string;
  date: string;
  status: string;
}

interface RecentStudent {
  name: string;
  reg: string;
  form: string | null;
  created_at: string;
}

const OwnerDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [totalStudents, setTotalStudents] = useState(0);
  const [studentsByForm, setStudentsByForm] = useState<{ name: string; count: number }[]>([]);
  const [recentStudents, setRecentStudents] = useState<RecentStudent[]>([]);
  const [collectedToday, setCollectedToday] = useState(0);
  const [collectedWeek, setCollectedWeek] = useState(0);
  const [collectedMonth, setCollectedMonth] = useState(0);
  const [collectedTotal, setCollectedTotal] = useState(0);
  const [outstanding, setOutstanding] = useState(0);
  const [collectionRate, setCollectionRate] = useState(0);
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);
  const [revenueTrend, setRevenueTrend] = useState<{ name: string; amount: number }[]>([]);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      // Profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, registration_number, form, created_at")
        .order("created_at", { ascending: false });

      const profs = profiles || [];
      setTotalStudents(profs.length);

      // Group by form
      const formMap: Record<string, number> = {};
      for (const p of profs) {
        const k = p.form || "Unassigned";
        formMap[k] = (formMap[k] || 0) + 1;
      }
      setStudentsByForm(
        Object.entries(formMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, count]) => ({ name: name === "Unassigned" ? "—" : `Form ${name}`, count }))
      );

      // Recent 5 students
      setRecentStudents(
        profs.slice(0, 5).map((p) => ({
          name: `${p.first_name} ${p.last_name}`,
          reg: p.registration_number,
          form: p.form,
          created_at: new Date(p.created_at).toLocaleDateString(),
        }))
      );

      // Fee summary
      const { data: feeSummary } = await supabase.rpc("get_student_fee_summary");
      const summaries = feeSummary || [];
      const totalFees = summaries.reduce((s, r) => s + Number(r.total_fees), 0);
      const totalPaid = summaries.reduce((s, r) => s + Number(r.total_paid), 0);
      const totalOutstanding = Math.max(totalFees - totalPaid, 0);
      setOutstanding(totalOutstanding);
      setCollectionRate(totalFees > 0 ? Math.round((totalPaid / totalFees) * 100) : 0);

      // Payments — fetch all paid/completed
      const { data: pays } = await supabase
        .from("payments")
        .select("amount, currency, method, status, created_at, student_profile_id")
        .in("status", ["paid", "completed"])
        .order("created_at", { ascending: false });

      const paid = pays || [];
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const startOfWeek = startOfDay - 6 * 86400000;
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

      let today = 0, week = 0, month = 0, total = 0;
      const trend: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(startOfDay - i * 86400000);
        trend[d.toISOString().slice(0, 10)] = 0;
      }

      for (const p of paid) {
        const amt = Number(p.amount);
        const t = new Date(p.created_at).getTime();
        total += amt;
        if (t >= startOfMonth) month += amt;
        if (t >= startOfWeek) week += amt;
        if (t >= startOfDay) today += amt;
        const dayKey = new Date(p.created_at).toISOString().slice(0, 10);
        if (dayKey in trend) trend[dayKey] += amt;
      }

      setCollectedToday(today);
      setCollectedWeek(week);
      setCollectedMonth(month);
      setCollectedTotal(total);
      setRevenueTrend(
        Object.entries(trend).map(([k, v]) => ({
          name: new Date(k).toLocaleDateString(undefined, { weekday: "short" }),
          amount: v,
        }))
      );

      // Recent payments feed (top 8 across all statuses)
      const { data: latestPays } = await supabase
        .from("payments")
        .select("amount, currency, method, status, created_at, student_profile_id")
        .order("created_at", { ascending: false })
        .limit(8);

      const profMap = Object.fromEntries(profs.map((p) => [p.id, p]));
      setRecentPayments(
        (latestPays || []).map((p) => {
          const prof = profMap[p.student_profile_id];
          return {
            student: prof ? `${prof.first_name} ${prof.last_name}` : "Unknown",
            reg: prof?.registration_number || "—",
            amount: Number(p.amount),
            currency: p.currency || "USD",
            method: p.method,
            date: new Date(p.created_at).toLocaleDateString(),
            status:
              p.status === "paid" || p.status === "completed" ? "Paid" : p.status === "pending" ? "Pending" : p.status,
          };
        })
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout role="owner">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Owner Overview</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Read-only summary of school revenue and student activity.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Collected Today"
                value={`$${collectedToday.toLocaleString()}`}
                subtitle="Paid in last 24h"
                icon={DollarSign}
                variant="success"
              />
              <StatCard
                title="This Week"
                value={`$${collectedWeek.toLocaleString()}`}
                subtitle="Last 7 days"
                icon={CalendarDays}
                variant="primary"
              />
              <StatCard
                title="This Month"
                value={`$${collectedMonth.toLocaleString()}`}
                subtitle="Month to date"
                icon={TrendingUp}
                variant="accent"
              />
              <StatCard
                title="Total Collected"
                value={`$${collectedTotal.toLocaleString()}`}
                subtitle="All time"
                icon={DollarSign}
                variant="success"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Total Students"
                value={totalStudents.toLocaleString()}
                subtitle="Registered"
                icon={Users}
                variant="primary"
              />
              <StatCard
                title="Outstanding"
                value={`$${outstanding.toLocaleString()}`}
                subtitle="Across all students"
                icon={AlertTriangle}
                variant="warning"
              />
              <StatCard
                title="Collection Rate"
                value={`${collectionRate}%`}
                subtitle="Paid vs required"
                icon={TrendingUp}
                variant="accent"
              />
              <StatCard
                title="Recent Signups"
                value={recentStudents.length.toString()}
                subtitle="Latest registrations"
                icon={UserPlus}
                variant="primary"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 shadow-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Revenue — Last 7 Days</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-72">
                    {revenueTrend.some((d) => d.amount > 0) ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={revenueTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" fontSize={12} />
                          <YAxis fontSize={12} tickFormatter={(v) => `$${v}`} />
                          <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, "Collected"]} />
                          <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                        No payments in the last 7 days.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Students by Form</CardTitle>
                </CardHeader>
                <CardContent>
                  {studentsByForm.length > 0 ? (
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={studentsByForm} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis type="number" fontSize={12} />
                          <YAxis type="category" dataKey="name" fontSize={12} width={70} />
                          <Tooltip />
                          <Bar dataKey="count" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-72 text-muted-foreground text-sm">
                      No students registered yet.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Recent Payments</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {recentPayments.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-secondary">
                        <TableHead>Student</TableHead>
                        <TableHead>Reg No.</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentPayments.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{p.student}</TableCell>
                          <TableCell>{p.reg}</TableCell>
                          <TableCell className="capitalize">{p.method}</TableCell>
                          <TableCell>
                            {p.currency} {p.amount.toFixed(2)}
                          </TableCell>
                          <TableCell>{p.date}</TableCell>
                          <TableCell>
                            <Badge
                              className={
                                p.status === "Paid"
                                  ? "bg-success text-success-foreground"
                                  : "bg-warning text-warning-foreground"
                              }
                            >
                              {p.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="p-6 text-center text-muted-foreground text-sm">No payments recorded yet.</p>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Recently Registered Students</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {recentStudents.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-secondary">
                        <TableHead>Student</TableHead>
                        <TableHead>Reg No.</TableHead>
                        <TableHead>Form</TableHead>
                        <TableHead>Registered</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentStudents.map((s, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell>{s.reg}</TableCell>
                          <TableCell>{s.form || "—"}</TableCell>
                          <TableCell>{s.created_at}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="p-6 text-center text-muted-foreground text-sm">No students registered yet.</p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default OwnerDashboard;
