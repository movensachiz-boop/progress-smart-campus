import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PinGate from "@/components/PinGate";
import StatCard from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, DollarSign, AlertTriangle, TrendingUp, ShoppingBag } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { supabase } from "@/integrations/supabase/client";

const PIE_COLORS = ["hsl(210,100%,20%)", "hsl(51,100%,50%)", "hsl(142,72%,40%)", "hsl(0,0%,60%)"];

interface RecentPayment {
  student: string;
  reg: string;
  form: string;
  amount: string;
  date: string;
  status: string;
}

const AdminDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [totalStudents, setTotalStudents] = useState(0);
  const [feesCollected, setFeesCollected] = useState(0);
  const [outstanding, setOutstanding] = useState(0);
  const [inventoryRevenue, setInventoryRevenue] = useState(0);
  const [barData, setBarData] = useState<{ name: string; collected: number; outstanding: number }[]>([]);
  const [pieData, setPieData] = useState<{ name: string; value: number }[]>([]);
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      // Total students
      const { count: studentCount } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true });
      setTotalStudents(studentCount || 0);

      // Fee summary via RPC
      const { data: feeSummary } = await supabase.rpc("get_student_fee_summary");
      const summaries = feeSummary || [];
      const totalPaid = summaries.reduce((s, r) => s + Number(r.total_paid), 0);
      const totalFees = summaries.reduce((s, r) => s + Number(r.total_fees), 0);
      const totalOutstanding = Math.max(totalFees - totalPaid, 0);
      setFeesCollected(totalPaid);
      setOutstanding(totalOutstanding);

      // Inventory sales (separate from fees)
      const { data: invSales } = await supabase
        .from("inventory_sales")
        .select("total_amount, status")
        .in("status", ["paid", "completed", "confirmed"]);
      const invTotal = (invSales || []).reduce((s, r) => s + Number(r.total_amount || 0), 0);
      setInventoryRevenue(invTotal);

      // Bar data per form
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, form");
      const formMap: Record<string, { collected: number; outstanding: number }> = {};
      for (const f of ["1", "2", "3", "4", "5", "6"]) {
        formMap[f] = { collected: 0, outstanding: 0 };
      }
      for (const s of summaries) {
        const prof = (profiles || []).find(p => p.id === s.profile_id);
        if (prof?.form && formMap[prof.form]) {
          formMap[prof.form].collected += Number(s.total_paid);
          formMap[prof.form].outstanding += Math.max(Number(s.total_fees) - Number(s.total_paid), 0);
        }
      }
      setBarData(Object.entries(formMap).map(([f, d]) => ({ name: `Form ${f}`, ...d })));

      // Recent payments
      const { data: payData } = await supabase
        .from("payments")
        .select("amount, created_at, status, method, student_profile_id")
        .order("created_at", { ascending: false })
        .limit(5);

      if (payData && payData.length > 0) {
        const ids = payData.map(p => p.student_profile_id);
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, registration_number, form")
          .in("id", ids);

        const profMap = Object.fromEntries((profs || []).map(p => [p.id, p]));
        setRecentPayments(payData.map(p => {
          const prof = profMap[p.student_profile_id];
          return {
            student: prof ? `${prof.first_name} ${prof.last_name}` : "Unknown",
            reg: prof?.registration_number || "—",
            form: prof?.form || "—",
            amount: `$${Number(p.amount).toFixed(2)}`,
            date: new Date(p.created_at).toLocaleDateString(),
            status: p.status === "paid" || p.status === "completed" ? "Paid" : "Pending",
          };
        }));
      } else {
        setRecentPayments([]);
      }

      // Pie data from payment methods
      if (payData && payData.length > 0) {
        const methodCounts: Record<string, number> = {};
        for (const p of payData) {
          const m = p.method || "Other";
          methodCounts[m] = (methodCounts[m] || 0) + 1;
        }
        // Use all payments for pie, not just recent 5
        const { data: allPay } = await supabase
          .from("payments")
          .select("method")
          .eq("status", "paid");
        const allCounts: Record<string, number> = {};
        for (const p of allPay || []) {
          const m = p.method || "Other";
          allCounts[m] = (allCounts[m] || 0) + 1;
        }
        const total = Object.values(allCounts).reduce((a, b) => a + b, 0);
        setPieData(
          Object.entries(allCounts).map(([name, count]) => ({
            name,
            value: total > 0 ? Math.round((count / total) * 100) : 0,
          }))
        );
      } else {
        setPieData([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const collectionRate = feesCollected + outstanding > 0
    ? Math.round((feesCollected / (feesCollected + outstanding)) * 100)
    : 0;

  return (
    <PinGate variant="dashboard">
      <DashboardLayout role="admin">
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-foreground">Admin Dashboard</h2>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              <StatCard title="Total Students" value={totalStudents.toLocaleString()} subtitle="Registered" icon={Users} variant="primary" />
              <StatCard title="Fees Collected" value={`$${feesCollected.toLocaleString()}`} subtitle="School fees only" icon={DollarSign} variant="success" />
              <StatCard title="Inventory Sales" value={`$${inventoryRevenue.toLocaleString()}`} subtitle="Shop revenue" icon={ShoppingBag} variant="accent" />
              <StatCard title="Outstanding" value={`$${outstanding.toLocaleString()}`} subtitle={totalStudents > 0 ? `${Math.round((outstanding / (feesCollected + outstanding || 1)) * 100)}% of total` : "—"} icon={AlertTriangle} variant="warning" />
              <StatCard title="Collection Rate" value={`${collectionRate}%`} subtitle="Based on fee requirements" icon={TrendingUp} variant="accent" />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Fee Collection by Form</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  {barData.some(d => d.collected > 0 || d.outstanding > 0) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,90%)" />
                        <XAxis dataKey="name" fontSize={12} />
                        <YAxis fontSize={12} tickFormatter={(v) => `$${v / 1000}k`} />
                        <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, ""]} />
                        <Bar dataKey="collected" fill="hsl(210,100%,20%)" radius={[4, 4, 0, 0]} name="Collected" />
                        <Bar dataKey="outstanding" fill="hsl(51,100%,50%)" radius={[4, 4, 0, 0]} name="Outstanding" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                      No fee data yet. Register students and record payments to see analytics.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Payment Methods</CardTitle>
              </CardHeader>
              <CardContent>
                {pieData.length > 0 ? (
                  <>
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                            {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: number) => [`${v}%`, ""]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {pieData.map((d, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="w-3 h-3 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                          {d.name} ({d.value}%)
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-52 text-muted-foreground text-sm">
                    No payments recorded yet.
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
                      <TableHead>Form</TableHead>
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
                        <TableCell>{p.form}</TableCell>
                        <TableCell>{p.amount}</TableCell>
                        <TableCell>{p.date}</TableCell>
                        <TableCell>
                          <Badge className={p.status === "Paid" ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"}>
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
        </div>
      </DashboardLayout>
    </PinGate>
  );
};

export default AdminDashboard;
