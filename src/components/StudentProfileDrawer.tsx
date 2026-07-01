import { useEffect, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Loader2, Save, X, DollarSign, Plus, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import pccLogo from "@/assets/pcc-logo.png";
import { logActivity } from "@/lib/activityLog";
import { ProfileView } from "@/pages/StudentProfile";

const PURPLE = "#7c3aed";
const PURPLE_DARK = "#4c1d95";

const METHODS = ["Cash", "Bank Deposit", "EcoCash", "Bank Transfer", "Cheque"];

function PaymentsPanel({ studentId, studentName }: { studentId: string; studentName: string }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("payments")
      .select("id, amount, method, status, receipt_number, paynow_reference, description, created_at")
      .eq("student_profile_id", studentId)
      .order("created_at", { ascending: false });
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [studentId]);

  const totalPaid = rows.filter(r => r.status === "paid" || r.status === "completed").reduce((s, r) => s + Number(r.amount || 0), 0);

  const record = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    setSaving(true);
    const { error } = await supabase.from("payments").insert({
      student_profile_id: studentId,
      amount: amt,
      method,
      status: "paid",
      paynow_reference: reference || null,
      description: description || "Fees payment",
    });
    setSaving(false);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Payment recorded", description: `$${amt.toFixed(2)} for ${studentName}` });
    setAmount(""); setReference(""); setDescription(""); setMethod("Cash");
    setShowForm(false);
    load();
  };

  return (
    <Card className="mx-6 mb-6 p-5 rounded-2xl border-0 shadow-[0_2px_20px_-6px_rgba(76,29,149,0.12)]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <DollarSign size={18} style={{ color: PURPLE_DARK }} />
          <h4 className="font-bold text-[15px]" style={{ color: PURPLE_DARK }}>Fees Payments</h4>
          <span className="text-xs text-muted-foreground ml-2">
            Total paid: <b className="text-foreground">${totalPaid.toFixed(2)}</b>
          </span>
        </div>
        <Button size="sm" onClick={() => setShowForm(v => !v)} className="gap-1 text-white rounded-full"
                style={{ background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_DARK})` }}>
          <Plus size={14} /> {showForm ? "Close" : "Record Payment"}
        </Button>
      </div>

      {showForm && (
        <div className="grid grid-cols-2 gap-3 mb-4 p-3 rounded-xl bg-purple-50/50 border border-purple-100">
          <div className="space-y-1">
            <Label className="text-xs">Amount (USD)</Label>
            <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Method</Label>
            <select className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                    value={method} onChange={e => setMethod(e.target.value)}>
              {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Reference (optional)</Label>
            <Input value={reference} onChange={e => setReference(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Fees payment" />
          </div>
          <div className="col-span-2 flex justify-end">
            <Button size="sm" onClick={record} disabled={saving} className="gap-1 text-white rounded-full px-5"
                    style={{ background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_DARK})` }}>
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Receipt size={14} />} Save Payment
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center"><Loader2 className="inline animate-spin" size={16} /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No payments recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2">Date</th>
                <th className="text-left py-2">Receipt</th>
                <th className="text-left py-2">Method</th>
                <th className="text-left py-2">Description</th>
                <th className="text-right py-2">Amount</th>
                <th className="text-left py-2 pl-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="py-2 font-mono text-xs">{r.receipt_number || "—"}</td>
                  <td className="py-2">{r.method}</td>
                  <td className="py-2 text-muted-foreground">{r.description || "—"}</td>
                  <td className="py-2 text-right font-semibold">${Number(r.amount).toFixed(2)}</td>
                  <td className="py-2 pl-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      r.status === "paid" || r.status === "completed" ? "bg-green-100 text-green-700" :
                      r.status === "voided" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                    }`}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

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
          <>
            <ProfileView
              p={data}
              fullName={fullName}
              initials={initials}
              onEdit={() => setEditing(true)}
              compact
              logoUrl={pccLogo}
              nameColor="text-white"
            />
            <PaymentsPanel studentId={studentId!} studentName={fullName} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default StudentProfileDrawer;
