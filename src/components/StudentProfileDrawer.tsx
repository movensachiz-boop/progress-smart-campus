import { useEffect, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Loader2, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activityLog";
import { ProfileView } from "@/pages/StudentProfile";

const PURPLE = "#7c3aed";
const PURPLE_DARK = "#4c1d95";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  studentId: string | null;
}

const SECTIONS: { title: string; fields: { k: string; label: string; area?: boolean; type?: string }[] }[] = [
  { title: "Identity", fields: [
    { k: "first_name", label: "First Name" },
    { k: "last_name", label: "Last Name" },
    { k: "registration_number", label: "Registration No." },
    { k: "form", label: "Form" },
    { k: "stream", label: "Stream" },
    { k: "gender", label: "Gender" },
    { k: "residency", label: "Residency" },
    { k: "date_of_birth", label: "Date of Birth", type: "date" },
    { k: "nationality", label: "Nationality" },
    { k: "national_id", label: "National ID / Birth Cert" },
  ]},
  { title: "Contact", fields: [
    { k: "phone", label: "Phone" },
    { k: "email", label: "Email", type: "email" },
    { k: "home_address", label: "Home Address", area: true },
  ]},
  { title: "Primary Guardian", fields: [
    { k: "guardian_name", label: "Name" },
    { k: "guardian_relationship", label: "Relationship" },
    { k: "guardian_phone", label: "Phone" },
    { k: "guardian_email", label: "Email", type: "email" },
    { k: "guardian_occupation", label: "Occupation" },
    { k: "guardian_address", label: "Address", area: true },
  ]},
  { title: "Secondary Guardian", fields: [
    { k: "guardian2_name", label: "Name" },
    { k: "guardian2_relationship", label: "Relationship" },
    { k: "guardian2_phone", label: "Phone" },
    { k: "guardian2_email", label: "Email", type: "email" },
  ]},
  { title: "Medical", fields: [
    { k: "blood_group", label: "Blood Group" },
    { k: "doctor_contact", label: "Doctor / Clinic" },
    { k: "allergies", label: "Allergies", area: true },
    { k: "medical_conditions", label: "Conditions / Medication", area: true },
  ]},
  { title: "Academic History", fields: [
    { k: "previous_school", label: "Previous School" },
    { k: "year_joined", label: "Year Joined" },
  ]},
  { title: "Emergency Contact", fields: [
    { k: "emergency_contact_name", label: "Name" },
    { k: "emergency_contact_relationship", label: "Relationship" },
    { k: "emergency_contact_phone", label: "Phone" },
  ]},
];

const StudentProfileDrawer = ({ open, onOpenChange, studentId }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [data, setData] = useState<any>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !studentId) return;
    setEditing(false);
    setLoading(true);
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", studentId).maybeSingle();
      setData(data);
      const d: Record<string, string> = {};
      SECTIONS.forEach(s => s.fields.forEach(f => { d[f.k] = (data as any)?.[f.k] ?? ""; }));
      setDraft(d);
      setLoading(false);
    })();
  }, [open, studentId]);

  const save = async () => {
    if (!studentId || !data) return;
    setSaving(true);
    const changes: Record<string, { from: any; to: any }> = {};
    const payload: any = {};
    Object.keys(draft).forEach((k) => {
      const newVal = draft[k] === "" ? null : draft[k];
      const oldVal = data[k] ?? null;
      if (String(newVal ?? "") !== String(oldVal ?? "")) {
        changes[k] = { from: oldVal, to: newVal };
        payload[k] = newVal;
      }
    });
    if (Object.keys(payload).length === 0) {
      setSaving(false); setEditing(false);
      toast({ title: "No changes" });
      return;
    }
    const { error } = await supabase.from("profiles").update(payload).eq("id", studentId);
    setSaving(false);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    await logActivity("profile_updated_by_admin", {
      profile_id: studentId,
      student: `${data.first_name} ${data.last_name}`,
      registration_number: data.registration_number,
      changes,
    });
    setData({ ...data, ...payload });
    setEditing(false);
    toast({ title: "Profile updated", description: `${Object.keys(changes).length} field(s) saved & logged.` });
  };

  const fullName = data ? `${data.first_name || ""} ${data.last_name || ""}`.trim() : "";
  const initials = data ? `${(data.first_name?.[0] || "?")}${(data.last_name?.[0] || "")}`.toUpperCase() : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-5xl p-0 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin" style={{ color: PURPLE }} /></div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Student not found.</p>
        ) : editing ? (
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur z-10 pb-3 border-b">
              <h2 className="text-xl font-bold tracking-tight" style={{ color: PURPLE_DARK }}>
                Editing: {fullName}
              </h2>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => {
                  setEditing(false);
                  const d: Record<string,string> = {};
                  SECTIONS.forEach(s => s.fields.forEach(f => { d[f.k] = data[f.k] ?? ""; }));
                  setDraft(d);
                }}>
                  <X size={14} /> Cancel
                </Button>
                <Button size="sm" onClick={save} disabled={saving} className="gap-2 text-white rounded-full px-4"
                        style={{ background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_DARK})` }}>
                  {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} Save
                </Button>
              </div>
            </div>
            {SECTIONS.map((sec) => (
              <Card key={sec.title} className="p-5 rounded-2xl border-0 shadow-[0_2px_20px_-6px_rgba(76,29,149,0.12)]">
                <h4 className="font-bold text-[15px] mb-3 flex items-center gap-2" style={{ color: PURPLE_DARK }}>
                  <span className="w-1 h-4 rounded-full" style={{ background: PURPLE }} />
                  {sec.title}
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {sec.fields.map((fld) => (
                    <div key={fld.k} className={fld.area ? "col-span-2 space-y-1" : "space-y-1"}>
                      <Label className="text-xs text-muted-foreground font-medium">{fld.label}</Label>
                      {fld.area ? (
                        <Textarea rows={2} value={draft[fld.k] || ""} onChange={(e) => setDraft({ ...draft, [fld.k]: e.target.value })} />
                      ) : (
                        <Input type={fld.type || "text"} value={draft[fld.k] || ""} onChange={(e) => setDraft({ ...draft, [fld.k]: e.target.value })} />
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <ProfileView
            p={data}
            fullName={fullName}
            initials={initials}
            onEdit={() => setEditing(true)}
            compact
          />
        )}
      </SheetContent>
    </Sheet>
  );
};

export default StudentProfileDrawer;
