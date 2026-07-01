import { useEffect, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2, Save, Pencil, X, MapPin, Phone, Mail, Cake, Flag, IdCard, Users,
  Stethoscope, GraduationCap, ShieldAlert, BookOpen, School,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activityLog";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  studentId: string | null;
}

const PURPLE = "#7c3aed";
const PURPLE_DARK = "#5b21b6";
const PURPLE_LIGHT = "#ede9fe";

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

const InfoRow = ({ icon: Icon, label, value }: any) => (
  <div className="flex items-start gap-3 py-2.5">
    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: PURPLE_LIGHT }}>
      <Icon size={16} style={{ color: PURPLE_DARK }} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium break-words">{value || "—"}</p>
    </div>
  </div>
);

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
        ) : (
          <div>
            {/* Cover */}
            <div
              className="relative h-48 md:h-60 w-full"
              style={{ background: `linear-gradient(135deg, ${PURPLE_DARK} 0%, ${PURPLE} 50%, #a855f7 100%)` }}
            >
              <div className="absolute inset-0 opacity-20" style={{
                backgroundImage: "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.4) 0%, transparent 40%), radial-gradient(circle at 80% 60%, rgba(255,255,255,0.3) 0%, transparent 40%)",
              }} />
            </div>

            <div className="px-4 md:px-8 pb-10">
              <div className="relative -mt-16 md:-mt-20 flex flex-col md:flex-row md:items-end gap-4 md:gap-6 pb-4">
                <div
                  className="w-32 h-32 md:w-40 md:h-40 rounded-full border-4 border-background bg-background shadow-xl overflow-hidden flex items-center justify-center text-4xl font-bold mx-auto md:mx-0"
                  style={{ background: PURPLE_LIGHT, color: PURPLE_DARK }}
                >
                  {data.selfie_url ? (
                    <img src={data.selfie_url} alt={fullName} className="w-full h-full object-cover" />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
                <div className="flex-1 text-center md:text-left md:pb-2">
                  <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">{fullName}</h1>
                  <p className="text-muted-foreground mt-1">
                    {data.registration_number} · Form {data.form}{data.stream ? ` ${data.stream}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3 justify-center md:justify-start">
                    <Badge style={{ background: PURPLE, color: "white" }}>{data.residency || "Day Scholar"}</Badge>
                    <Badge variant={data.profile_completed ? "default" : "outline"} className={data.profile_completed ? "bg-success text-success-foreground" : ""}>
                      {data.profile_completed ? "Profile Complete" : "Profile Incomplete"}
                    </Badge>
                    {data.gender && <Badge variant="secondary">{data.gender}</Badge>}
                  </div>
                </div>
                <div className="md:pb-2 flex md:block justify-center gap-2">
                  {!editing ? (
                    <Button className="gap-2 text-white hover:opacity-90" style={{ background: PURPLE }} onClick={() => setEditing(true)}>
                      <Pencil size={16} /> Edit Profile
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(false); const d: Record<string,string> = {}; SECTIONS.forEach(s=>s.fields.forEach(f=>{d[f.k]=data[f.k]??"";})); setDraft(d); }}>
                        <X size={14} /> Cancel
                      </Button>
                      <Button size="sm" onClick={save} disabled={saving} className="gap-2 text-white" style={{ background: PURPLE }}>
                        {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} Save
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {editing ? (
                <div className="space-y-6 mt-4">
                  {SECTIONS.map((sec) => (
                    <Card key={sec.title} className="p-5">
                      <h4 className="font-semibold border-b pb-1 mb-3" style={{ color: PURPLE_DARK }}>{sec.title}</h4>
                      <div className="grid grid-cols-2 gap-3">
                        {sec.fields.map((fld) => (
                          <div key={fld.k} className={fld.area ? "col-span-2 space-y-1" : "space-y-1"}>
                            <Label className="text-xs text-muted-foreground">{fld.label}</Label>
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
                <Tabs defaultValue="about" className="mt-2">
                  <TabsList className="bg-transparent border-b w-full justify-start rounded-none h-auto p-0 gap-1">
                    {[
                      { v: "about", l: "About" },
                      { v: "guardians", l: "Family" },
                      { v: "medical", l: "Medical" },
                      { v: "academic", l: "Academic" },
                    ].map(t => (
                      <TabsTrigger
                        key={t.v}
                        value={t.v}
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-current data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 font-semibold"
                        style={{ color: PURPLE_DARK }}
                      >
                        {t.l}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  <div className="grid md:grid-cols-3 gap-6 mt-6">
                    <Card className="p-5 md:col-span-1 h-fit border-t-4" style={{ borderTopColor: PURPLE }}>
                      <h3 className="font-bold text-lg mb-3" style={{ color: PURPLE_DARK }}>Intro</h3>
                      <div className="space-y-2 text-sm">
                        <p className="flex items-center gap-2"><School size={14} style={{ color: PURPLE }} /> Progress Christian College</p>
                        <p className="flex items-center gap-2"><GraduationCap size={14} style={{ color: PURPLE }} /> Form {data.form}{data.stream ? ` ${data.stream}` : ""}</p>
                        {data.home_address && <p className="flex items-center gap-2"><MapPin size={14} style={{ color: PURPLE }} /> {data.home_address}</p>}
                        {data.nationality && <p className="flex items-center gap-2"><Flag size={14} style={{ color: PURPLE }} /> {data.nationality}</p>}
                        {data.year_joined && <p className="flex items-center gap-2"><BookOpen size={14} style={{ color: PURPLE }} /> Joined {data.year_joined}</p>}
                      </div>
                    </Card>

                    <div className="md:col-span-2 space-y-6">
                      <TabsContent value="about" className="mt-0 space-y-6">
                        <Card className="p-6">
                          <h3 className="font-bold text-lg mb-2" style={{ color: PURPLE_DARK }}>Personal Details</h3>
                          <div className="divide-y">
                            <InfoRow icon={Cake} label="Date of Birth" value={data.date_of_birth} />
                            <InfoRow icon={IdCard} label="National ID / Birth Cert" value={data.national_id} />
                            <InfoRow icon={Flag} label="Nationality" value={data.nationality} />
                          </div>
                        </Card>
                        <Card className="p-6">
                          <h3 className="font-bold text-lg mb-2" style={{ color: PURPLE_DARK }}>Contact</h3>
                          <div className="divide-y">
                            <InfoRow icon={Phone} label="Phone" value={data.phone} />
                            <InfoRow icon={Mail} label="Email" value={data.email} />
                            <InfoRow icon={MapPin} label="Home Address" value={data.home_address} />
                          </div>
                        </Card>
                      </TabsContent>

                      <TabsContent value="guardians" className="mt-0 space-y-6">
                        <Card className="p-6">
                          <h3 className="font-bold text-lg mb-2" style={{ color: PURPLE_DARK }}>Primary Guardian</h3>
                          <div className="divide-y">
                            <InfoRow icon={Users} label="Name" value={data.guardian_name} />
                            <InfoRow icon={Users} label="Relationship" value={data.guardian_relationship} />
                            <InfoRow icon={Phone} label="Phone" value={data.guardian_phone} />
                            <InfoRow icon={Mail} label="Email" value={data.guardian_email} />
                            <InfoRow icon={MapPin} label="Address" value={data.guardian_address} />
                          </div>
                        </Card>
                        <Card className="p-6">
                          <h3 className="font-bold text-lg mb-2" style={{ color: PURPLE_DARK }}>Secondary Guardian</h3>
                          <div className="divide-y">
                            <InfoRow icon={Users} label="Name" value={data.guardian2_name} />
                            <InfoRow icon={Users} label="Relationship" value={data.guardian2_relationship} />
                            <InfoRow icon={Phone} label="Phone" value={data.guardian2_phone} />
                          </div>
                        </Card>
                        <Card className="p-6">
                          <h3 className="font-bold text-lg mb-2" style={{ color: PURPLE_DARK }}>Emergency Contact</h3>
                          <div className="divide-y">
                            <InfoRow icon={ShieldAlert} label="Name" value={data.emergency_contact_name} />
                            <InfoRow icon={ShieldAlert} label="Relationship" value={data.emergency_contact_relationship} />
                            <InfoRow icon={Phone} label="Phone" value={data.emergency_contact_phone} />
                          </div>
                        </Card>
                      </TabsContent>

                      <TabsContent value="medical" className="mt-0">
                        <Card className="p-6">
                          <h3 className="font-bold text-lg mb-2" style={{ color: PURPLE_DARK }}>Medical Information</h3>
                          <div className="divide-y">
                            <InfoRow icon={Stethoscope} label="Blood Group" value={data.blood_group} />
                            <InfoRow icon={Stethoscope} label="Allergies" value={data.allergies} />
                            <InfoRow icon={Stethoscope} label="Conditions / Medication" value={data.medical_conditions} />
                            <InfoRow icon={Phone} label="Doctor / Clinic" value={data.doctor_contact} />
                          </div>
                        </Card>
                      </TabsContent>

                      <TabsContent value="academic" className="mt-0">
                        <Card className="p-6">
                          <h3 className="font-bold text-lg mb-2" style={{ color: PURPLE_DARK }}>Academic History</h3>
                          <div className="divide-y">
                            <InfoRow icon={School} label="Previous School" value={data.previous_school} />
                            <InfoRow icon={BookOpen} label="Year Joined PCC" value={data.year_joined} />
                            <InfoRow icon={GraduationCap} label="Current Class" value={`Form ${data.form}${data.stream ? ` ${data.stream}` : ""}`} />
                          </div>
                        </Card>
                      </TabsContent>
                    </div>
                  </div>
                </Tabs>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default StudentProfileDrawer;
