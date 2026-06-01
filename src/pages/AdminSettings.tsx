import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Crown, UserPlus } from "lucide-react";

const STAFF_ROLES = [
  { value: "admin", label: "Full Admin (Mrs Sibanda / Mr Cal / Developer)" },
  { value: "cashier", label: "Cashier (no Dashboard, no Settings)" },
  { value: "timetable_manager", label: "Timetable Manager (timetable + classes only)" },
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
              <Input defaultValue="Pioneer Christian College" />
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
