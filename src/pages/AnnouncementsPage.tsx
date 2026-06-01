import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, Plus, Trash2, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: string;
  target_role: string;
  created_at: string;
}

interface AnnouncementsPageProps {
  role: "admin" | "student" | "teacher";
}

const AnnouncementsPage = ({ role }: AnnouncementsPageProps) => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [smsDialogOpen, setSmsDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New announcement form
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("low");
  const [targetRole, setTargetRole] = useState("all");

  // SMS notification form
  const [smsPhone, setSmsPhone] = useState("");
  const [smsMessage, setSmsMessage] = useState("");
  const [smsName, setSmsName] = useState("");
  const [sendingSms, setSendingSms] = useState(false);

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const loadAnnouncements = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("announcements" as any)
      .select("*")
      .order("created_at", { ascending: false });
    setAnnouncements((data || []) as unknown as Announcement[]);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error("Title and body are required");
      return;
    }
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("announcements" as any).insert({
      title: title.trim(),
      body: body.trim(),
      priority,
      target_role: targetRole,
      created_by: user?.id,
    } as any);
    if (error) {
      toast.error("Failed to create announcement");
    } else {
      toast.success("Announcement posted!");
      setTitle(""); setBody(""); setPriority("low"); setTargetRole("all");
      setDialogOpen(false);
      loadAnnouncements();
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("announcements" as any).delete().eq("id", id);
    if (error) toast.error("Failed to delete");
    else { toast.success("Deleted"); loadAnnouncements(); }
  };

  const handleSendSms = async () => {
    if (!smsPhone.trim() || !smsMessage.trim()) {
      toast.error("Phone and message are required");
      return;
    }
    setSendingSms(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-notification", {
        body: {
          type: "custom",
          guardianPhone: smsPhone.trim(),
          studentName: smsName.trim() || "Parent/Guardian",
          customMessage: smsMessage.trim(),
        },
      });
      if (error) throw error;
      toast.success("Notification sent!");
      setSmsPhone(""); setSmsMessage(""); setSmsName("");
      setSmsDialogOpen(false);
    } catch (e: any) {
      toast.error("Failed to send: " + e.message);
    }
    setSendingSms(false);
  };

  // Filter announcements by role
  const filtered = announcements.filter(a =>
    a.target_role === "all" || a.target_role === role
  );

  return (
    <DashboardLayout role={role}>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h2 className="text-2xl font-bold text-foreground">Announcements</h2>
          {role === "admin" && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setSmsDialogOpen(true)}>
                <Send className="w-4 h-4 mr-1" /> Send SMS
              </Button>
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> New Announcement
              </Button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No announcements yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filtered.map(a => (
              <Card key={a.id} className="shadow-card">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <Bell size={18} className={a.priority === "high" ? "text-destructive mt-0.5" : "text-muted-foreground mt-0.5"} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-semibold text-foreground">{a.title}</p>
                        {a.priority === "high" && <Badge variant="destructive" className="text-xs">Important</Badge>}
                        {a.target_role !== "all" && (
                          <Badge variant="secondary" className="text-xs capitalize">{a.target_role}s only</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-2 whitespace-pre-wrap">{a.body}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(a.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                      </p>
                    </div>
                    {role === "admin" && (
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(a.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* New Announcement Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Announcement</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
              <Textarea placeholder="Announcement body..." rows={4} value={body} onChange={e => setBody(e.target.value)} />
              <div className="flex gap-3">
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Normal</SelectItem>
                    <SelectItem value="high">Important</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={targetRole} onValueChange={setTargetRole}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Everyone</SelectItem>
                    <SelectItem value="student">Students Only</SelectItem>
                    <SelectItem value="teacher">Teachers Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Post Announcement
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* SMS Dialog */}
        <Dialog open={smsDialogOpen} onOpenChange={setSmsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send SMS Notification</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input placeholder="Recipient name (optional)" value={smsName} onChange={e => setSmsName(e.target.value)} />
              <Input placeholder="Phone number (e.g. 0786133259)" value={smsPhone} onChange={e => setSmsPhone(e.target.value)} />
              <Textarea placeholder="Type your message here..." rows={4} value={smsMessage} onChange={e => setSmsMessage(e.target.value)} />
            </div>
            <DialogFooter>
              <Button onClick={handleSendSms} disabled={sendingSms}>
                {sendingSms ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                Send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default AnnouncementsPage;
