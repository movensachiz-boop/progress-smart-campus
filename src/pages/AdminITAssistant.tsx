import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, Search } from "lucide-react";

interface Teacher {
  user_id: string;
  full_name: string;
}

const AdminITAssistant = () => {
  const { toast } = useToast();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Teacher | null>(null);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("student-login", {
          body: { action: "list_staff" },
        });
        if (error) throw error;
        const merged: Teacher[] = (data?.staff || [])
          .filter((s: any) => s.role === "teacher" && s.user_id)
          .map((s: any) => ({ user_id: s.user_id, full_name: s.name }))
          .sort((a: Teacher, b: Teacher) => a.full_name.localeCompare(b.full_name));
        setTeachers(merged);
      } catch (e: any) {
        toast({ title: "Error", description: e.message || "Failed to load teachers", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  const filtered = useMemo(
    () => teachers.filter(t => t.full_name.toLowerCase().includes(search.toLowerCase())),
    [teachers, search]
  );

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || password.length < 4) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-students", {
        body: { action: "reset_teacher_password", teacherUserId: selected.user_id, newPassword: password },
      });
      if (error || data?.error) {
        toast({ title: "Error", description: data?.error || error?.message || "Reset failed", variant: "destructive" });
        return;
      }
      toast({ title: "Password reset", description: `${selected.full_name}'s password has been updated.` });
      setPassword("");
      setSelected(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6 max-w-3xl">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="text-primary" /> IT Assistant — Reset Teacher Passwords
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Select a teacher and set a new password. This is the only action available to your account.
          </p>
        </div>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Teachers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search teacher by name"
                className="pl-9"
              />
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="animate-spin" size={16} /> Loading…
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">No teachers found.</p>
            ) : (
              <div className="max-h-80 overflow-auto divide-y rounded border">
                {filtered.map(t => (
                  <button
                    key={t.user_id}
                    onClick={() => setSelected(t)}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-muted transition ${
                      selected?.user_id === t.user_id ? "bg-primary/10 font-medium" : ""
                    }`}
                  >
                    {t.full_name}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {selected && (
          <Card className="shadow-card border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="text-base">Reset password for {selected.full_name}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleReset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password (min 4 characters)</Label>
                  <Input
                    id="newPassword"
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={4}
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={saving} className="gap-2">
                    {saving && <Loader2 size={16} className="animate-spin" />}
                    Update Password
                  </Button>
                  <Button type="button" variant="outline" onClick={() => { setSelected(null); setPassword(""); }}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AdminITAssistant;
