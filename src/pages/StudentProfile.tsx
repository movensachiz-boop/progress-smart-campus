import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2, Camera, MapPin, Phone, Mail, Cake, Flag, IdCard, Users,
  Stethoscope, GraduationCap, ShieldAlert, Pencil, BookOpen, School,
  Sparkles, CheckCircle2, User,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import CameraCaptureDialog from "@/components/CameraCaptureDialog";

const PURPLE = "#7c3aed";
const PURPLE_DARK = "#4c1d95";
const PURPLE_LIGHT = "#f5f3ff";

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

  return (
    <DashboardLayout role="student">
      <ProfileView
        p={p}
        fullName={fullName}
        initials={initials}
        onEdit={() => navigate("/student/complete-profile")}
        onPhoto={() => setCamOpen(true)}
        uploading={uploading}
      />
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

// -------- Shared attractive view --------
export const ProfileView = ({
  p, fullName, initials, onEdit, onPhoto, uploading, compact = false, logoUrl, nameColor,
}: {
  p: any; fullName: string; initials: string;
  onEdit: () => void; onPhoto?: () => void; uploading?: boolean; compact?: boolean;
  logoUrl?: string; nameColor?: string;
}) => {
  const InfoRow = ({ icon: Icon, label, value }: any) => (
    <div className="flex items-start gap-3 py-3 group">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all group-hover:scale-105"
        style={{ background: `linear-gradient(135deg, ${PURPLE_LIGHT}, #ede9fe)`, color: PURPLE_DARK }}
      >
        <Icon size={17} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <p className="font-semibold text-[15px] text-foreground/90 break-words leading-snug mt-0.5">{value || "—"}</p>
      </div>
    </div>
  );

  const SectionCard = ({ title, children }: any) => (
    <Card className="p-6 border-0 shadow-[0_2px_20px_-6px_rgba(76,29,149,0.12)] hover:shadow-[0_8px_28px_-8px_rgba(76,29,149,0.22)] transition-shadow rounded-2xl">
      <h3 className="font-bold text-[17px] tracking-tight mb-2 flex items-center gap-2" style={{ color: PURPLE_DARK }}>
        <span className="w-1 h-5 rounded-full" style={{ background: PURPLE }} />
        {title}
      </h3>
      <div className="divide-y divide-purple-100/60">{children}</div>
    </Card>
  );

  return (
    <div className={`max-w-5xl mx-auto ${compact ? "" : "-mt-4 md:-mt-6 lg:-mt-8 -mx-4 md:-mx-6 lg:-mx-8"} font-[Inter]`}>
      {/* Cover with mesh gradient + orbs */}
      <div className="relative h-56 md:h-72 w-full overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(120deg, #3b0764 0%, ${PURPLE_DARK} 30%, ${PURPLE} 65%, #a855f7 100%)`,
          }}
        />
        {/* Floating orbs */}
        <div className="absolute -top-20 -left-16 w-72 h-72 rounded-full opacity-40 blur-3xl"
             style={{ background: "radial-gradient(circle, #f0abfc 0%, transparent 70%)" }} />
        <div className="absolute -bottom-24 right-10 w-80 h-80 rounded-full opacity-30 blur-3xl"
             style={{ background: "radial-gradient(circle, #c4b5fd 0%, transparent 70%)" }} />
        {/* Dot grid */}
        <div className="absolute inset-0 opacity-[0.15]" style={{
          backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }} />
        {/* School logo */}
        {logoUrl && (
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <img src={logoUrl} alt="School logo" className="h-10 w-auto object-contain drop-shadow-lg" />
          </div>
        )}
        {/* Sparkle label */}
        <div className="absolute top-4 right-4 flex items-center gap-1.5 text-white/80 text-xs font-medium bg-white/10 backdrop-blur px-3 py-1.5 rounded-full border border-white/20">
          <Sparkles size={12} /> Progress Christian College
        </div>
      </div>

      <div className="px-4 md:px-8">
        {/* Header row */}
        <div className="relative -mt-20 md:-mt-24 flex flex-col md:flex-row md:items-end gap-5 md:gap-7 pb-5">
          {/* Avatar with gradient ring */}
          <div className="relative mx-auto md:mx-0">
            <div
              className="p-1.5 rounded-full shadow-2xl"
              style={{ background: `linear-gradient(135deg, #f0abfc, ${PURPLE}, #6366f1)` }}
            >
              <div
                className="w-36 h-36 md:w-44 md:h-44 rounded-full border-4 border-background bg-background overflow-hidden flex items-center justify-center text-5xl font-black tracking-tight"
                style={{ background: PURPLE_LIGHT, color: PURPLE_DARK }}
              >
                {p.selfie_url ? (
                  <img src={p.selfie_url} alt={fullName} className="w-full h-full object-cover" />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
            </div>
            {onPhoto && (
              <button
                onClick={onPhoto}
                disabled={uploading}
                className="absolute bottom-2 right-2 w-11 h-11 rounded-full shadow-lg flex items-center justify-center text-white transition hover:scale-110 border-2 border-white"
                style={{ background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_DARK})` }}
                aria-label="Change photo"
              >
                {uploading ? <Loader2 className="animate-spin" size={16} /> : <Camera size={17} />}
              </button>
            )}
          </div>

          <div className="flex-1 text-center md:text-left md:pb-3 min-w-0">
            <h1 className={`text-[28px] md:text-[36px] font-black tracking-tight leading-tight ${nameColor || "text-foreground"}`}>
              {fullName}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm md:text-base font-medium">
              <span className="font-mono tracking-wider">{p.registration_number}</span>
              <span className="mx-2 text-purple-300">•</span>
              Form {p.form}{p.stream ? ` ${p.stream}` : ""}
            </p>
            {/* Stat pills */}
            <div className="flex flex-wrap gap-2 mt-4 justify-center md:justify-start">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white shadow-md"
                    style={{ background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_DARK})` }}>
                <School size={12} /> {p.residency || "Day Scholar"}
              </span>
              {p.profile_completed && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 size={12} /> Verified
                </span>
              )}
              {p.gender && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                  <User size={12} /> {p.gender}
                </span>
              )}
            </div>
          </div>

          <div className="md:pb-3 flex md:block justify-center">
            <Button
              onClick={onEdit}
              className="gap-2 text-white hover:opacity-90 rounded-full px-5 h-11 font-semibold shadow-lg"
              style={{ background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_DARK})` }}
            >
              <Pencil size={15} /> Edit Profile
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="about" className="mt-2">
          <TabsList className="bg-purple-50/60 border border-purple-100 w-full md:w-auto justify-start rounded-full h-auto p-1.5 gap-1">
            {[
              { v: "about", l: "About" },
              { v: "guardians", l: "Family" },
              { v: "medical", l: "Medical" },
              { v: "academic", l: "Academic" },
            ].map(t => (
              <TabsTrigger
                key={t.v}
                value={t.v}
                className="rounded-full px-5 py-2 text-sm font-semibold text-purple-900/70 data-[state=active]:text-white data-[state=active]:shadow-md transition-all data-[state=active]:bg-[linear-gradient(135deg,#7c3aed,#4c1d95)]"
              >
                {t.l}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="grid md:grid-cols-3 gap-6 mt-6 pb-10">
            {/* Intro sidebar */}
            <Card className="p-6 md:col-span-1 h-fit rounded-2xl border-0 shadow-[0_2px_20px_-6px_rgba(76,29,149,0.12)] relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: `linear-gradient(90deg, ${PURPLE}, #a855f7, #6366f1)` }} />
              <h3 className="font-bold text-lg mb-4 tracking-tight" style={{ color: PURPLE_DARK }}>Intro</h3>
              <div className="space-y-3 text-sm">
                <p className="flex items-start gap-2.5 text-foreground/80"><School size={15} className="mt-0.5 shrink-0" style={{ color: PURPLE }} /> <span className="font-medium">Progress Christian College</span></p>
                <p className="flex items-start gap-2.5 text-foreground/80"><GraduationCap size={15} className="mt-0.5 shrink-0" style={{ color: PURPLE }} /> <span className="font-medium">Form {p.form}{p.stream ? ` ${p.stream}` : ""}</span></p>
                {p.home_address && <p className="flex items-start gap-2.5 text-foreground/80"><MapPin size={15} className="mt-0.5 shrink-0" style={{ color: PURPLE }} /> <span>{p.home_address}</span></p>}
                {p.nationality && <p className="flex items-start gap-2.5 text-foreground/80"><Flag size={15} className="mt-0.5 shrink-0" style={{ color: PURPLE }} /> <span>{p.nationality}</span></p>}
                {p.year_joined && <p className="flex items-start gap-2.5 text-foreground/80"><BookOpen size={15} className="mt-0.5 shrink-0" style={{ color: PURPLE }} /> <span>Joined {p.year_joined}</span></p>}
              </div>
            </Card>

            <div className="md:col-span-2 space-y-6">
              <TabsContent value="about" className="mt-0 space-y-6">
                <SectionCard title="Personal Details">
                  <InfoRow icon={Cake} label="Date of Birth" value={p.date_of_birth} />
                  <InfoRow icon={IdCard} label="National ID / Birth Cert" value={p.national_id} />
                  <InfoRow icon={Flag} label="Nationality" value={p.nationality} />
                </SectionCard>
                <SectionCard title="Contact">
                  <InfoRow icon={Phone} label="Phone" value={p.phone} />
                  <InfoRow icon={Mail} label="Email" value={p.email} />
                  <InfoRow icon={MapPin} label="Home Address" value={p.home_address} />
                </SectionCard>
              </TabsContent>

              <TabsContent value="guardians" className="mt-0 space-y-6">
                <SectionCard title="Primary Guardian">
                  <InfoRow icon={Users} label="Name" value={p.guardian_name} />
                  <InfoRow icon={Users} label="Relationship" value={p.guardian_relationship} />
                  <InfoRow icon={Phone} label="Phone" value={p.guardian_phone} />
                  <InfoRow icon={Mail} label="Email" value={p.guardian_email} />
                  <InfoRow icon={MapPin} label="Address" value={p.guardian_address} />
                </SectionCard>
                <SectionCard title="Secondary Guardian">
                  <InfoRow icon={Users} label="Name" value={p.guardian2_name} />
                  <InfoRow icon={Users} label="Relationship" value={p.guardian2_relationship} />
                  <InfoRow icon={Phone} label="Phone" value={p.guardian2_phone} />
                </SectionCard>
                <SectionCard title="Emergency Contact">
                  <InfoRow icon={ShieldAlert} label="Name" value={p.emergency_contact_name} />
                  <InfoRow icon={ShieldAlert} label="Relationship" value={p.emergency_contact_relationship} />
                  <InfoRow icon={Phone} label="Phone" value={p.emergency_contact_phone} />
                </SectionCard>
              </TabsContent>

              <TabsContent value="medical" className="mt-0">
                <SectionCard title="Medical Information">
                  <InfoRow icon={Stethoscope} label="Blood Group" value={p.blood_group} />
                  <InfoRow icon={Stethoscope} label="Allergies" value={p.allergies} />
                  <InfoRow icon={Stethoscope} label="Conditions / Medication" value={p.medical_conditions} />
                  <InfoRow icon={Phone} label="Doctor / Clinic" value={p.doctor_contact} />
                </SectionCard>
              </TabsContent>

              <TabsContent value="academic" className="mt-0">
                <SectionCard title="Academic History">
                  <InfoRow icon={School} label="Previous School" value={p.previous_school} />
                  <InfoRow icon={BookOpen} label="Year Joined PCC" value={p.year_joined} />
                  <InfoRow icon={GraduationCap} label="Current Class" value={`Form ${p.form}${p.stream ? ` ${p.stream}` : ""}`} />
                </SectionCard>
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </div>
    </div>
  );
};
