import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Crown, UserPlus, KeyRound, Trash2, Search } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STAFF_ROLES = [
  { value: "admin", label: "Full Admin (Mrs Sibanda / Mr Cal / Developer)" },
  { value: "cashier", label: "Cashier (no Dashboard, no Settings)" },
  { value: "timetable_manager", label: "Timetable Manager (timetable + classes only)" },
  { value: "kitchen", label: "Kitchen Staff (kitchen stock only)" },
  { value: "principal", label: "Principal (combined mark schedules only)" },
  { value: "it_assistant", label: "IT Assistant (reset teacher passwords only)" },

];

const AdminSettings = () => {
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);

  // Staff creation
  const [staffName, setStaffName] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffRole, setStaffRole] = useState("cashier");
  const [creatingStaff, setCreatingStaff] = useState(false);

  // Existing accounts management
  interface StaffAccount { user_id: string; name: string; role: string }
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountSearch, setAccountSearch] = useState("");
  const [resetTarget, setResetTarget] = useState<StaffAccount | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StaffAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const { data, error } = await supabase.functions.invoke("student-login", { body: { action: "list_staff" } });
      if (error) throw error;
      setAccounts(((data?.staff || []) as any[]).filter(s => s.user_id));
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to load accounts", variant: "destructive" });
    } finally {
      setLoadingAccounts(false);
    }
  };

  useEffect(() => { loadAccounts(); /* eslint-disable-next-line */ }, []);

  const filteredAccounts = useMemo(
    () => accounts.filter(a => a.name.toLowerCase().includes(accountSearch.toLowerCase())),
    [accounts, accountSearch]
  );

  const invokeErr = async (error: any, data: any, fallback: string) => {
    let msg = data?.error || error?.message || fallback;
    try {
      if (error?.context?.json) {
        const body = await error.context.json();
        if (body?.error) msg = body.error;
      }
    } catch {}
    return msg;
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget || resetPassword.length < 4) return;
    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-students", {
        body: { action: "reset_staff_password", userId: resetTarget.user_id, newPassword: resetPassword },
      });
      if (error || data?.error) {
        toast({ title: "Error", description: await invokeErr(error, data, "Reset failed"), variant: "destructive" });
        return;
      }
      toast({ title: "Password reset ✓", description: `${resetTarget.name} can now sign in with the new password.` });
      setResetTarget(null);
      setResetPassword("");
    } finally {
      setResetting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-students", {
        body: { action: "delete_staff_account", userId: deleteTarget.user_id },
      });
      if (error || data?.error) {
        toast({ title: "Error", description: await invokeErr(error, data, "Delete failed"), variant: "destructive" });
        return;
      }
      toast({ title: "Account deleted", description: `${deleteTarget.name} no longer has access.` });
      setAccounts(prev => prev.filter(a => a.user_id !== deleteTarget.user_id));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };



  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffName.trim() || !staffPassword.trim() || !staffRole) return;
    setCreatingStaff(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-students", {
        body: { action: "create_staff", fullName: staffName.trim(), password: staffPassword, role: staffRole },
      });
      if (error || data?.error) {
        let msg = data?.error || "Failed to create staff account";
        try {
          if (error?.context?.json) {
            const body = await error.context.json();
            if (body?.error) msg = body.error;
          }
        } catch {}
        toast({ title: "Error", description: msg, variant: "destructive" });
        return;
      }
      toast({
        title: "Staff account created",
        description: `${staffName} can now sign in by typing their full name and password.`,
      });
      setStaffName("");
      setStaffPassword("");
      loadAccounts();
    } finally {
      setCreatingStaff(false);
    }
  };

  const handleCreateOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-students", {
        body: { action: "create_owner", fullName, email: email.trim().toLowerCase(), password },
      });
      if (error) {
        let msg = "Failed to create owner account";
        try {
          if (error.context?.json) {
            const body = await error.context.json();
            if (body?.error) msg = body.error;
          }
        } catch {}
        toast({ title: "Error", description: msg, variant: "destructive" });
        return;
      }
      if (data?.error) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
        return;
      }
      toast({
        title: "Owner account created",
        description: `${fullName} can now sign in with email ${email}.`,
      });
      setFullName("");
      setEmail("");
      setPassword("");
    } finally {
      setCreating(false);
    }
  };

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-foreground">Settings</h2>

        <Card className="shadow-card max-w-lg">
          <CardHeader>
            <CardTitle className="text-base">School Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>School Name</Label>
              <Input defaultValue="Progress Christian College" />
            </div>
            <div className="space-y-2">
              <Label>Term</Label>
              <Input defaultValue="Term 1 – 2025" />
            </div>
            <div className="space-y-2">
              <Label>Admin Email</Label>
              <Input defaultValue="admin@pcc.edu" />
            </div>
            <Button>Save Changes</Button>
          </CardContent>
        </Card>

        <Card className="shadow-card max-w-lg border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus size={18} className="text-primary" />
              Create Staff Account
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Staff sign in by typing their full name (e.g. "Mavunga Mitchell") and password — no email needed.
              Choose the role to control which pages they can access.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateStaff} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="staffName">Full Name</Label>
                <Input
                  id="staffName"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder="e.g. Mavunga Mitchell"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="staffRole">Role</Label>
                <Select value={staffRole} onValueChange={setStaffRole}>
                  <SelectTrigger id="staffRole"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAFF_ROLES.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="staffPassword">Password</Label>
                <Input
                  id="staffPassword"
                  type="text"
                  value={staffPassword}
                  onChange={(e) => setStaffPassword(e.target.value)}
                  placeholder="e.g. final"
                  minLength={4}
                  required
                />
              </div>
              <Button type="submit" disabled={creatingStaff} className="gap-2">
                {creatingStaff && <Loader2 size={16} className="animate-spin" />}
                Create Staff Account
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="shadow-card max-w-lg border-l-4 border-l-accent">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Crown size={18} className="text-accent" />
              Create School Owner Account
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Owners get a read-only portal showing revenue collected and student registrations.
              They sign in with their email and password (not a registration number).
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateOwner} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ownerName">Full Name</Label>
                <Input
                  id="ownerName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Mr. John Moyo"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownerEmail">Email</Label>
                <Input
                  id="ownerEmail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@school.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownerPassword">Temporary Password (min 8 chars)</Label>
                <Input
                  id="ownerPassword"
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  minLength={8}
                  required
                />
              </div>
              <Button type="submit" disabled={creating} className="gap-2">
                {creating && <Loader2 size={16} className="animate-spin" />}
                Create Owner Account
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AdminSettings;
