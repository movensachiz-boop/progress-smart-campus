import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Camera, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import CameraCaptureDialog from "@/components/CameraCaptureDialog";
import pccLogo from "@/assets/pcc-logo.png";

type F = Record<string, string>;

const REQUIRED = [
  "date_of_birth", "nationality", "national_id", "home_address", "phone",
  "guardian_name", "guardian_phone", "guardian_relationship",
  "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relationship",
];

const StudentCompleteProfile = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileId, setProfileId] = useState<string>("");
  const [studentName, setStudentName] = useState("");
  const [selfie, setSelfie] = useState<string>("");
  const [camOpen, setCamOpen] = useState(false);
  const [f, setF] = useState<F>({});

  const upd = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/login"); return; }
      const { data: p } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (!p) { navigate("/login"); return; }
      const any = p as any;
      if (any.profile_completed) { navigate("/student"); return; }
      setProfileId(any.id);
      setStudentName(`${any.first_name || ""} ${any.last_name || ""}`.trim());
      setSelfie(any.selfie_url || "");
      const init: F = {};
      [
        "date_of_birth","nationality","national_id","home_address","phone","email",
        "guardian_name","guardian_phone","guardian_relationship","guardian_email","guardian_occupation","guardian_address",
        "guardian2_name","guardian2_phone","guardian2_relationship","guardian2_email",
        "blood_group","allergies","medical_conditions","doctor_contact",
        "previous_school","year_joined",
        "emergency_contact_name","emergency_contact_relationship","emergency_contact_phone",
      ].forEach((k) => (init[k] = any[k] || ""));
      setF(init);
      setLoading(false);
    })();
  }, [navigate]);

  const handleSelfie = async (dataUrl: string) => {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const path = `selfies/${profileId}-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from("student-photos").upload(path, blob, {
        contentType: "image/jpeg", upsert: true,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("student-photos").createSignedUrl
        ? await supabase.storage.from("student-photos").createSignedUrl(path, 60 * 60 * 24 * 365 * 5)
        : ({ data: null } as any);
      setSelfie((data as any)?.signedUrl || path);
      toast({ title: "Selfie captured" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const missing = REQUIRED.filter((k) => !f[k]?.trim());
    if (missing.length) {
      toast({ title: "Missing required fields", description: missing.join(", "), variant: "destructive" });
      return;
    }
    if (!selfie) {
      toast({ title: "Selfie required", description: "Please capture your selfie.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = { ...f, selfie_url: selfie, profile_completed: true };
    if (!payload.date_of_birth) delete payload.date_of_birth;
    const { error } = await supabase.from("profiles").update(payload).eq("id", profileId);
    setSaving(false);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Profile saved", description: "Welcome to your portal!" });
    navigate("/student");
  };

  const logout = async () => { await supabase.auth.signOut(); navigate("/login"); };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary" size={32} /></div>;
  }

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-primary border-b pb-2">{title}</h3>
      <div className="grid md:grid-cols-2 gap-4">{children}</div>
    </div>
  );

  const Field = ({ k, label, req, type = "text", area }: { k: string; label: string; req?: boolean; type?: string; area?: boolean }) => (
    <div className={area ? "md:col-span-2 space-y-1.5" : "space-y-1.5"}>
      <Label>{label}{req && <span className="text-destructive"> *</span>}</Label>
      {area ? (
        <Textarea value={f[k] || ""} onChange={(e) => upd(k, e.target.value)} rows={2} />
      ) : (
        <Input type={type} value={f[k] || ""} onChange={(e) => upd(k, e.target.value)} />
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Card className="shadow-lg">
          <CardHeader className="text-center border-b bg-primary text-primary-foreground rounded-t-lg">
            <img src={pccLogo} alt="PCC" className="mx-auto h-16 w-16 mb-2" />
            <CardTitle className="text-2xl">Complete Your Student Profile</CardTitle>
            <CardDescription className="text-primary-foreground/80">
              Welcome {studentName}. Please fill out your details before accessing the portal.
              Fields marked <span className="text-yellow-300">*</span> are required.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-8">
            <form onSubmit={handleSubmit} className="space-y-8">
              <Section title="Selfie">
                <div className="md:col-span-2 flex items-center gap-4">
                  <div className="w-28 h-28 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden bg-muted">
                    {selfie ? <img src={selfie} alt="selfie" className="w-full h-full object-cover" /> : <Camera className="text-muted-foreground" />}
                  </div>
                  <div>
                    <Button type="button" variant="outline" onClick={() => setCamOpen(true)} className="gap-2">
                      <Camera size={16} /> {selfie ? "Retake Selfie" : "Capture Selfie"} *
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">Required for school records.</p>
                  </div>
                </div>
              </Section>

              <Section title="Personal & Contact Details">
                <Field k="date_of_birth" label="Date of Birth" req type="date" />
                <Field k="nationality" label="Nationality" req />
                <Field k="national_id" label="National ID / Birth Certificate No." req />
                <Field k="phone" label="Phone" req />
                <Field k="email" label="Email" type="email" />
                <Field k="home_address" label="Home Address" req area />
              </Section>

              <Section title="Parent / Guardian (Primary)">
                <Field k="guardian_name" label="Full Name" req />
                <Field k="guardian_relationship" label="Relationship" req />
                <Field k="guardian_phone" label="Phone" req />
                <Field k="guardian_email" label="Email" type="email" />
                <Field k="guardian_occupation" label="Occupation" />
                <Field k="guardian_address" label="Address" area />
              </Section>

              <Section title="Parent / Guardian (Secondary, optional)">
                <Field k="guardian2_name" label="Full Name" />
                <Field k="guardian2_relationship" label="Relationship" />
                <Field k="guardian2_phone" label="Phone" />
                <Field k="guardian2_email" label="Email" type="email" />
              </Section>

              <Section title="Medical Information">
                <div className="space-y-1.5">
                  <Label>Blood Group</Label>
                  <Select value={f.blood_group || ""} onValueChange={(v) => upd("blood_group", v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {["A+","A-","B+","B-","AB+","AB-","O+","O-","Unknown"].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Field k="doctor_contact" label="Family Doctor / Clinic Contact" />
                <Field k="allergies" label="Known Allergies" area />
                <Field k="medical_conditions" label="Chronic Conditions / Medication" area />
              </Section>

              <Section title="Academic History">
                <Field k="previous_school" label="Previous School" />
                <Field k="year_joined" label="Year Joined PCC" />
              </Section>

              <Section title="Emergency Contact (not the guardian)">
                <Field k="emergency_contact_name" label="Full Name" req />
                <Field k="emergency_contact_relationship" label="Relationship" req />
                <Field k="emergency_contact_phone" label="Phone" req />
              </Section>

              <div className="flex justify-between items-center pt-4 border-t">
                <Button type="button" variant="ghost" onClick={logout} className="gap-2">
                  <LogOut size={16} /> Sign Out
                </Button>
                <Button type="submit" disabled={saving} className="gap-2 min-w-[200px]">
                  {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                  {saving ? "Saving..." : "Save & Continue"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <CameraCaptureDialog
        open={camOpen}
        onOpenChange={setCamOpen}
        onCapture={handleSelfie}
        title="Capture Selfie"
        description="Look at the camera and capture a clear front-facing photo."
      />
    </div>
  );
};

export default StudentCompleteProfile;
