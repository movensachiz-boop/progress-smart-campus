import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Pencil, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activityLog";

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
    supabase.from("profiles").select("*").eq("id", studentId).maybeSingle()
      .then(({ data }) => {
        setData(data);
        const d: Record<string, string> = {};
        SECTIONS.forEach(s => s.fields.forEach(f => { d[f.k] = (data as any)?.[f.k] ?? ""; }));
        setDraft(d);
      })
      .finally(() => setLoading(false));
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Student Profile</SheetTitle>
          <SheetDescription>
            {data ? `${(data.first_name || "").toUpperCase()} ${(data.last_name || "").toUpperCase()} — ${data.registration_number}` : "Loading…"}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Student not found.</p>
        ) : (
          <div className="mt-4 space-y-6">
            <div className="flex items-center gap-3">
              {data.selfie_url ? (
                <img src={data.selfie_url} alt="selfie" className="w-20 h-20 rounded-lg object-cover border" />
              ) : (
                <div className="w-20 h-20 rounded-lg bg-muted border flex items-center justify-center text-xs text-muted-foreground">No photo</div>
              )}
              <div className="flex-1">
                <Badge variant={data.profile_completed ? "default" : "outline"} className={data.profile_completed ? "bg-success text-success-foreground" : ""}>
                  {data.profile_completed ? "Profile Complete" : "Profile Incomplete"}
                </Badge>
              </div>
              {!editing ? (
                <Button size="sm" variant="outline" className="gap-2" onClick={() => setEditing(true)}>
                  <Pencil size={14} /> Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(false); const d: Record<string,string> = {}; SECTIONS.forEach(s=>s.fields.forEach(f=>{d[f.k]=data[f.k]??"";})); setDraft(d); }}>
                    <X size={14} /> Cancel
                  </Button>
                  <Button size="sm" onClick={save} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} Save
                  </Button>
                </div>
              )}
            </div>

            {SECTIONS.map((sec) => (
              <div key={sec.title} className="space-y-3">
                <h4 className="font-semibold text-primary border-b pb-1">{sec.title}</h4>
                <div className="grid grid-cols-2 gap-3">
                  {sec.fields.map((fld) => (
                    <div key={fld.k} className={fld.area ? "col-span-2 space-y-1" : "space-y-1"}>
                      <Label className="text-xs text-muted-foreground">{fld.label}</Label>
                      {editing ? (
                        fld.area ? (
                          <Textarea rows={2} value={draft[fld.k] || ""} onChange={(e) => setDraft({ ...draft, [fld.k]: e.target.value })} />
                        ) : (
                          <Input type={fld.type || "text"} value={draft[fld.k] || ""} onChange={(e) => setDraft({ ...draft, [fld.k]: e.target.value })} />
                        )
                      ) : (
                        <p className="text-sm font-medium break-words">{(data[fld.k] || "—").toString()}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default StudentProfileDrawer;
