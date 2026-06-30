import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2, Camera, MapPin, Phone, Mail, Cake, Flag, IdCard, Users,
  Stethoscope, GraduationCap, ShieldAlert, Pencil, BookOpen, School,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import CameraCaptureDialog from "@/components/CameraCaptureDialog";

const PURPLE = "#7c3aed"; // violet-600
const PURPLE_DARK = "#5b21b6"; // violet-800
const PURPLE_LIGHT = "#ede9fe"; // violet-100

const StudentProfile = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [p, setP] = useState<any>(null);
  const [camOpen, setCamOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/login"); return; }
    const { data } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
    setP(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSelfie = async (dataUrl: string) => {
    if (!p) return;
    setUploading(true);
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const path = `selfies/${p.id}-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from("student-photos").upload(path, blob, {
        contentType: "image/jpeg", upsert: true,
      });
      if (error) throw error;
      const { data } = await supabase.storage.from("student-photos").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      const url = (data as any)?.signedUrl || path;
      await supabase.from("profiles").update({ selfie_url: url }).eq("id", p.id);
      setP({ ...p, selfie_url: url });
      toast({ title: "Profile photo updated" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    }
    setUploading(false);
  };

  if (loading) {
    return (
      <DashboardLayout role="student">
        <div className="flex justify-center py-20"><Loader2 className="animate-spin" style={{ color: PURPLE }} size={36} /></div>
      </DashboardLayout>
    );
  }

  if (!p) {
    return (
      <DashboardLayout role="student">
        <p className="text-center text-muted-foreground py-20">Profile not found.</p>
      </DashboardLayout>
    );
  }

  const fullName = `${p.first_name || ""} ${p.last_name || ""}`.trim();
  const initials = `${(p.first_name?.[0] || "?")}${(p.last_name?.[0] || "")}`.toUpperCase();

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

  return (
    <DashboardLayout role="student">
      <div className="max-w-5xl mx-auto -mt-4 md:-mt-6 lg:-mt-8 -mx-4 md:-mx-6 lg:-mx-8">
        {/* Cover */}
        <div
          className="relative h-56 md:h-72 w-full"
          style={{ background: `linear-gradient(135deg, ${PURPLE_DARK} 0%, ${PURPLE} 50%, #a855f7 100%)` }}
        >
          <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.4) 0%, transparent 40%), radial-gradient(circle at 80% 60%, rgba(255,255,255,0.3) 0%, transparent 40%)",
          }} />
        </div>

        {/* Profile header card */}
        <div className="px-4 md:px-8">
          <div className="relative -mt-20 md:-mt-24 flex flex-col md:flex-row md:items-end gap-4 md:gap-6 pb-4">
            {/* Avatar */}
            <div className="relative mx-auto md:mx-0">
              <div
                className="w-36 h-36 md:w-44 md:h-44 rounded-full border-4 border-background bg-background shadow-xl overflow-hidden flex items-center justify-center text-4xl font-bold"
                style={{ background: PURPLE_LIGHT, color: PURPLE_DARK }}
              >
                {p.selfie_url ? (
                  <img src={p.selfie_url} alt={fullName} className="w-full h-full object-cover" />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              <button
                onClick={() => setCamOpen(true)}
                disabled={uploading}
                className="absolute bottom-2 right-2 w-10 h-10 rounded-full shadow-lg flex items-center justify-center text-white transition hover:scale-105"
                style={{ background: PURPLE }}
                aria-label="Change photo"
              >
                {uploading ? <Loader2 className="animate-spin" size={16} /> : <Camera size={16} />}
              </button>
            </div>

            <div className="flex-1 text-center md:text-left md:pb-2">
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">{fullName}</h1>
              <p className="text-muted-foreground mt-1">
                {p.registration_number} · Form {p.form}{p.stream ? ` ${p.stream}` : ""}
              </p>
              <div className="flex flex-wrap gap-2 mt-3 justify-center md:justify-start">
                <Badge style={{ background: PURPLE, color: "white" }}>{p.residency || "Day Scholar"}</Badge>
                {p.profile_completed && (
                  <Badge variant="outline" style={{ borderColor: PURPLE, color: PURPLE_DARK }}>Profile Complete</Badge>
                )}
                {p.gender && <Badge variant="secondary">{p.gender}</Badge>}
              </div>
            </div>

            <div className="md:pb-2 flex md:block justify-center">
              <Button
                onClick={() => navigate("/student/complete-profile")}
                className="gap-2 text-white hover:opacity-90"
                style={{ background: PURPLE }}
              >
                <Pencil size={16} /> Edit Profile
              </Button>
            </div>
          </div>

          {/* Tabs */}
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

            <div className="grid md:grid-cols-3 gap-6 mt-6 pb-10">
              {/* Sidebar intro card (Facebook-style) */}
              <Card className="p-5 md:col-span-1 h-fit border-t-4" style={{ borderTopColor: PURPLE }}>
                <h3 className="font-bold text-lg mb-3" style={{ color: PURPLE_DARK }}>Intro</h3>
                <div className="space-y-2 text-sm">
                  <p className="flex items-center gap-2"><School size={14} style={{ color: PURPLE }} /> Progress Christian College</p>
                  <p className="flex items-center gap-2"><GraduationCap size={14} style={{ color: PURPLE }} /> Form {p.form}{p.stream ? ` ${p.stream}` : ""}</p>
                  {p.home_address && <p className="flex items-center gap-2"><MapPin size={14} style={{ color: PURPLE }} /> {p.home_address}</p>}
                  {p.nationality && <p className="flex items-center gap-2"><Flag size={14} style={{ color: PURPLE }} /> {p.nationality}</p>}
                  {p.year_joined && <p className="flex items-center gap-2"><BookOpen size={14} style={{ color: PURPLE }} /> Joined {p.year_joined}</p>}
                </div>
              </Card>

              <div className="md:col-span-2 space-y-6">
                <TabsContent value="about" className="mt-0 space-y-6">
                  <Card className="p-6">
                    <h3 className="font-bold text-lg mb-2" style={{ color: PURPLE_DARK }}>Personal Details</h3>
                    <div className="divide-y">
                      <InfoRow icon={Cake} label="Date of Birth" value={p.date_of_birth} />
                      <InfoRow icon={IdCard} label="National ID / Birth Cert" value={p.national_id} />
                      <InfoRow icon={Flag} label="Nationality" value={p.nationality} />
                    </div>
                  </Card>
                  <Card className="p-6">
                    <h3 className="font-bold text-lg mb-2" style={{ color: PURPLE_DARK }}>Contact</h3>
                    <div className="divide-y">
                      <InfoRow icon={Phone} label="Phone" value={p.phone} />
                      <InfoRow icon={Mail} label="Email" value={p.email} />
                      <InfoRow icon={MapPin} label="Home Address" value={p.home_address} />
                    </div>
                  </Card>
                </TabsContent>

                <TabsContent value="guardians" className="mt-0 space-y-6">
                  <Card className="p-6">
                    <h3 className="font-bold text-lg mb-2" style={{ color: PURPLE_DARK }}>Primary Guardian</h3>
                    <div className="divide-y">
                      <InfoRow icon={Users} label="Name" value={p.guardian_name} />
                      <InfoRow icon={Users} label="Relationship" value={p.guardian_relationship} />
                      <InfoRow icon={Phone} label="Phone" value={p.guardian_phone} />
                      <InfoRow icon={Mail} label="Email" value={p.guardian_email} />
                      <InfoRow icon={MapPin} label="Address" value={p.guardian_address} />
                    </div>
                  </Card>
                  <Card className="p-6">
                    <h3 className="font-bold text-lg mb-2" style={{ color: PURPLE_DARK }}>Secondary Guardian</h3>
                    <div className="divide-y">
                      <InfoRow icon={Users} label="Name" value={p.guardian2_name} />
                      <InfoRow icon={Users} label="Relationship" value={p.guardian2_relationship} />
                      <InfoRow icon={Phone} label="Phone" value={p.guardian2_phone} />
                    </div>
                  </Card>
                  <Card className="p-6">
                    <h3 className="font-bold text-lg mb-2" style={{ color: PURPLE_DARK }}>Emergency Contact</h3>
                    <div className="divide-y">
                      <InfoRow icon={ShieldAlert} label="Name" value={p.emergency_contact_name} />
                      <InfoRow icon={ShieldAlert} label="Relationship" value={p.emergency_contact_relationship} />
                      <InfoRow icon={Phone} label="Phone" value={p.emergency_contact_phone} />
                    </div>
                  </Card>
                </TabsContent>

                <TabsContent value="medical" className="mt-0">
                  <Card className="p-6">
                    <h3 className="font-bold text-lg mb-2" style={{ color: PURPLE_DARK }}>Medical Information</h3>
                    <div className="divide-y">
                      <InfoRow icon={Stethoscope} label="Blood Group" value={p.blood_group} />
                      <InfoRow icon={Stethoscope} label="Allergies" value={p.allergies} />
                      <InfoRow icon={Stethoscope} label="Conditions / Medication" value={p.medical_conditions} />
                      <InfoRow icon={Phone} label="Doctor / Clinic" value={p.doctor_contact} />
                    </div>
                  </Card>
                </TabsContent>

                <TabsContent value="academic" className="mt-0">
                  <Card className="p-6">
                    <h3 className="font-bold text-lg mb-2" style={{ color: PURPLE_DARK }}>Academic History</h3>
                    <div className="divide-y">
                      <InfoRow icon={School} label="Previous School" value={p.previous_school} />
                      <InfoRow icon={BookOpen} label="Year Joined PCC" value={p.year_joined} />
                      <InfoRow icon={GraduationCap} label="Current Class" value={`Form ${p.form}${p.stream ? ` ${p.stream}` : ""}`} />
                    </div>
                  </Card>
                </TabsContent>
              </div>
            </div>
          </Tabs>
        </div>
      </div>

      <CameraCaptureDialog
        open={camOpen}
        onOpenChange={setCamOpen}
        onCapture={handleSelfie}
        title="Update Profile Photo"
        description="Look at the camera and capture a clear photo."
      />
    </DashboardLayout>
  );
};

export default StudentProfile;
