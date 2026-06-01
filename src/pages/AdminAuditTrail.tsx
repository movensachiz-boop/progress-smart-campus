import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PinGate from "@/components/PinGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Search, Download, Eye, ShieldCheck, LogIn, LogOut, Activity } from "lucide-react";

interface AuditEntry {
  id: string;
  payment_id: string | null;
  student_profile_id: string | null;
  action: string;
  actor_user_id: string | null;
  actor_email: string | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
  method: string | null;
  receipt_number: string | null;
  before_data: any;
  after_data: any;
  note: string | null;
  created_at: string;
}

interface ProfileLite { id: string; first_name: string; last_name: string; registration_number: string; }

const ACTION_COLORS: Record<string, string> = {
  created: "bg-success/15 text-success",
  updated: "bg-primary/10 text-primary",
  status_changed: "bg-accent/20 text-accent-foreground",
  voided: "bg-destructive/15 text-destructive",
  refunded: "bg-warning/15 text-warning-foreground",
};

interface ActivityEntry {
  id: string;
  user_id: string | null;
  actor_email: string | null;
  actor_label: string | null;
  action: string;
  details: any;
  user_agent: string | null;
  created_at: string;
}

const AdminAuditTrail = () => {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [activitySearch, setActivitySearch] = useState("");
  const [activityFilter, setActivityFilter] = useState<string>("all");
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("payment_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (!error && data) {
      setEntries(data as AuditEntry[]);
      const ids = Array.from(new Set(data.map((d: any) => d.student_profile_id).filter(Boolean)));
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, registration_number")
          .in("id", ids);
        const map: Record<string, ProfileLite> = {};
        (profs || []).forEach((p: any) => { map[p.id] = p; });
        setProfiles(map);
      }
    }
    const { data: act } = await supabase
      .from("activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (act) setActivity(act as ActivityEntry[]);
    setLoading(false);
  };

  const filteredActivity = useMemo(() => {
    return activity.filter(a => {
      if (activityFilter !== "all" && a.action !== activityFilter) return false;
      if (!activitySearch.trim()) return true;
      const q = activitySearch.trim().toLowerCase();
      return (
        (a.actor_email || "").toLowerCase().includes(q) ||
        (a.actor_label || "").toLowerCase().includes(q) ||
        (a.action || "").toLowerCase().includes(q) ||
        JSON.stringify(a.details || {}).toLowerCase().includes(q)
      );
    });
  }, [activity, activitySearch, activityFilter]);

  const exportActivityCsv = () => {
    const rows = [
      ["Timestamp", "Action", "User", "Email", "Details", "User Agent"],
      ...filteredActivity.map(a => [
        new Date(a.created_at).toISOString(),
        a.action,
        a.actor_label || "",
        a.actor_email || "",
        a.details ? JSON.stringify(a.details) : "",
        a.user_agent || "",
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (actionFilter !== "all" && e.action !== actionFilter) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      const p = e.student_profile_id ? profiles[e.student_profile_id] : null;
      const studentStr = p ? `${p.first_name} ${p.last_name} ${p.registration_number}` : "";
      return (
        (e.receipt_number || "").toLowerCase().includes(q) ||
        (e.actor_email || "").toLowerCase().includes(q) ||
        studentStr.toLowerCase().includes(q) ||
        (e.method || "").toLowerCase().includes(q)
      );
    });
  }, [entries, profiles, search, actionFilter]);

  const exportCsv = () => {
    const rows = [
      ["Timestamp", "Action", "Actor", "Student", "Reg #", "Receipt #", "Amount", "Currency", "Status", "Method"],
      ...filtered.map(e => {
        const p = e.student_profile_id ? profiles[e.student_profile_id] : null;
        return [
          new Date(e.created_at).toISOString(),
          e.action,
          e.actor_email || "",
          p ? `${p.first_name} ${p.last_name}` : "",
          p?.registration_number || "",
          e.receipt_number || "",
          e.amount ?? "",
          e.currency || "",
          e.status || "",
          e.method || "",
        ];
      })
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finance-audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout role="admin">
      <PinGate>
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="text-primary" size={24} />
              Audit Trail
            </h2>
            <p className="text-sm text-muted-foreground">
              Immutable record of finance changes and every user login, logout and key action — including who, when, and what.
            </p>
          </div>

          <Tabs defaultValue="finance">
            <TabsList>
              <TabsTrigger value="finance" className="gap-2"><ShieldCheck size={14} /> Finance</TabsTrigger>
              <TabsTrigger value="activity" className="gap-2"><Activity size={14} /> Activity (Login/Logout)</TabsTrigger>
            </TabsList>

            <TabsContent value="finance" className="mt-4">
              <div className="flex justify-end mb-3">
                <Button onClick={exportCsv} variant="outline" size="sm" className="gap-2">
                  <Download size={14} /> Export CSV
                </Button>
              </div>
              <Card className="shadow-card">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-[240px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                      <Input
                        placeholder="Search receipt, student, reg#, actor, method..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <Select value={actionFilter} onValueChange={setActionFilter}>
                      <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All actions</SelectItem>
                        <SelectItem value="created">Created</SelectItem>
                        <SelectItem value="updated">Updated</SelectItem>
                        <SelectItem value="status_changed">Status changed</SelectItem>
                        <SelectItem value="voided">Voided</SelectItem>
                        <SelectItem value="refunded">Refunded</SelectItem>
                      </SelectContent>
                    </Select>
                    <Badge variant="secondary">{filtered.length} entries</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  {loading ? (
                    <div className="p-4 space-y-2">
                      {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                    </div>
                  ) : filtered.length === 0 ? (
                    <p className="p-8 text-center text-muted-foreground text-sm">No audit entries found.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Timestamp</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Actor</TableHead>
                          <TableHead>Student</TableHead>
                          <TableHead>Receipt</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map(e => {
                          const p = e.student_profile_id ? profiles[e.student_profile_id] : null;
                          return (
                            <TableRow key={e.id}>
                              <TableCell className="text-xs whitespace-nowrap">
                                {new Date(e.created_at).toLocaleString()}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className={ACTION_COLORS[e.action] || ""}>
                                  {e.action.replace("_", " ")}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs">{e.actor_email || <span className="text-muted-foreground italic">system</span>}</TableCell>
                              <TableCell className="text-sm">
                                {p ? <>{p.first_name} {p.last_name} <span className="text-xs text-muted-foreground">({p.registration_number})</span></> : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                              <TableCell className="text-xs font-mono">{e.receipt_number || "—"}</TableCell>
                              <TableCell className="text-right text-sm font-medium">
                                {e.amount != null ? `${e.currency || "USD"} ${Number(e.amount).toFixed(2)}` : "—"}
                              </TableCell>
                              <TableCell className="text-xs">{e.status || "—"}</TableCell>
                              <TableCell>
                                <Button variant="ghost" size="icon" onClick={() => setSelected(e)}>
                                  <Eye size={16} />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              <div className="flex justify-end mb-3">
                <Button onClick={exportActivityCsv} variant="outline" size="sm" className="gap-2">
                  <Download size={14} /> Export CSV
                </Button>
              </div>
              <Card className="shadow-card">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-[240px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                      <Input
                        placeholder="Search user, email, action..."
                        value={activitySearch}
                        onChange={(e) => setActivitySearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <Select value={activityFilter} onValueChange={setActivityFilter}>
                      <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All actions</SelectItem>
                        <SelectItem value="login">Login</SelectItem>
                        <SelectItem value="logout">Logout</SelectItem>
                        <SelectItem value="login_failed">Failed login</SelectItem>
                      </SelectContent>
                    </Select>
                    <Badge variant="secondary">{filteredActivity.length} entries</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  {loading ? (
                    <div className="p-4 space-y-2">
                      {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                    </div>
                  ) : filteredActivity.length === 0 ? (
                    <p className="p-8 text-center text-muted-foreground text-sm">No activity recorded yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Timestamp</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>User</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredActivity.map(a => (
                          <TableRow key={a.id}>
                            <TableCell className="text-xs whitespace-nowrap">
                              {new Date(a.created_at).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={
                                a.action === "login" ? "bg-success/15 text-success" :
                                a.action === "logout" ? "bg-muted text-foreground" :
                                a.action === "login_failed" ? "bg-destructive/15 text-destructive" :
                                "bg-primary/10 text-primary"
                              }>
                                {a.action === "login" && <LogIn size={12} className="mr-1 inline" />}
                                {a.action === "logout" && <LogOut size={12} className="mr-1 inline" />}
                                {a.action.replace("_", " ")}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{a.actor_label || <span className="text-muted-foreground">—</span>}</TableCell>
                            <TableCell className="text-xs">{a.actor_email || <span className="text-muted-foreground italic">anonymous</span>}</TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                              {a.details ? JSON.stringify(a.details) : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Audit entry detail</DialogTitle>
            </DialogHeader>
            {selected && (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-muted-foreground">When:</span> {new Date(selected.created_at).toLocaleString()}</div>
                  <div><span className="text-muted-foreground">Action:</span> <Badge variant="secondary" className={ACTION_COLORS[selected.action] || ""}>{selected.action}</Badge></div>
                  <div><span className="text-muted-foreground">Actor:</span> {selected.actor_email || "system"}</div>
                  <div><span className="text-muted-foreground">Receipt:</span> {selected.receipt_number || "—"}</div>
                  <div><span className="text-muted-foreground">Amount:</span> {selected.amount != null ? `${selected.currency || "USD"} ${Number(selected.amount).toFixed(2)}` : "—"}</div>
                  <div><span className="text-muted-foreground">Method:</span> {selected.method || "—"}</div>
                </div>
                {selected.before_data && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">BEFORE</p>
                    <pre className="bg-muted/50 p-3 rounded text-xs overflow-x-auto">{JSON.stringify(selected.before_data, null, 2)}</pre>
                  </div>
                )}
                {selected.after_data && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">AFTER</p>
                    <pre className="bg-muted/50 p-3 rounded text-xs overflow-x-auto">{JSON.stringify(selected.after_data, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </PinGate>
    </DashboardLayout>
  );
};

export default AdminAuditTrail;
