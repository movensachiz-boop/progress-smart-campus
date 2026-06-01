import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Camera, Upload, Loader2, Trash2, Save, AlertTriangle, CheckCircle2, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { titleCaseName, formatClass } from "@/lib/normalize";
import CameraCaptureDialog from "@/components/CameraCaptureDialog";
import PhoneCameraPairDialog from "@/components/PhoneCameraPairDialog";

interface StudentProfile {
  id: string;
  first_name: string;
  last_name: string;
  registration_number: string;
  guardian_phone?: string | null;
  form?: string | null;
  stream?: string | null;
}

interface BulkRow {
  id: string;
  date: string;
  details: string;
  rawName: string;
  amount: string;
  matchedStudentId: string;
  matchScore: number;
  candidates: { id: string; label: string; score: number }[];
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  students: StudentProfile[];
  defaultMethod?: string;
  onSaved: () => void;
}

const norm = (v: string) =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const tokens = (v: string) => norm(v).split(" ").filter(Boolean);

const score = (raw: string, s: StudentProfile) => {
  const hay = norm(raw);
  const first = norm(s.first_name);
  const last = norm(s.last_name);
  const reg = norm(s.registration_number);
  const full = norm(`${s.first_name} ${s.last_name}`);
  const rev = norm(`${s.last_name} ${s.first_name}`);
  const w = new Set(tokens(raw));
  let sc = 0;
  if (reg && hay.includes(reg)) sc += 12;
  if (full && hay.includes(full)) sc += 10;
  if (rev && hay.includes(rev)) sc += 10;
  if (first && w.has(first)) sc += 4;
  if (last && w.has(last)) sc += 4;
  // partial token containment
  if (first && first.length > 3 && hay.includes(first)) sc += 1;
  if (last && last.length > 3 && hay.includes(last)) sc += 1;
  return sc;
};

const rank = (raw: string, students: StudentProfile[]) => {
  return students
    .map((s) => ({
      id: s.id,
      label: `${titleCaseName(`${s.first_name} ${s.last_name}`)} (${s.registration_number})${s.form || s.stream ? ` — ${formatClass(s)}` : ""}`,
      score: score(raw, s),
    }))
    .filter((c) => c.score >= 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
};

const BulkPaymentDialog = ({ open, onOpenChange, students, defaultMethod = "Bank Deposit", onSaved }: Props) => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [method, setMethod] = useState(defaultMethod);
  const [saving, setSaving] = useState(false);

  const reset = () => { setRows([]); setScanning(false); setSaving(false); };

  const handleClose = (v: boolean) => {
    if (saving) return;
    if (!v) reset();
    onOpenChange(v);
  };

  const processImage = async (base64: string) => {
    setScanning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await supabase.functions.invoke("extract-payments-bulk", {
        body: { imageBase64: base64 },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (resp.error) throw new Error(resp.error.message || "Scan failed");
      const extracted: { date?: string; details?: string; student_name?: string; amount?: string }[] = resp.data?.rows || [];
      if (!extracted.length) {
        toast({ title: "No transactions found", description: "Try a clearer photo of the credit column.", variant: "destructive" });
        return;
      }
      const mapped: BulkRow[] = extracted.map((r, i) => {
        const candidates = rank(r.student_name || "", students);
        return {
          id: `${Date.now()}-${i}`,
          date: r.date || "",
          details: r.details || "",
          rawName: r.student_name || "",
          amount: r.amount || "",
          matchedStudentId: candidates[0]?.id || "",
          matchScore: candidates[0]?.score || 0,
          candidates,
        };
      });
      setRows((prev) => [...prev, ...mapped]);
      toast({ title: `Extracted ${mapped.length} transactions`, description: "Review and remove any that should not be saved." });
    } catch (err) {
      toast({ title: "Scan failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => processImage(reader.result as string);
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const updateRow = (id: string, patch: Partial<BulkRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));

  const validRows = rows.filter((r) => r.matchedStudentId && parseFloat(r.amount) > 0);
  const unmatchedCount = rows.filter((r) => !r.matchedStudentId).length;
  const total = validRows.reduce((s, r) => s + parseFloat(r.amount || "0"), 0);

  const handleSaveAll = async () => {
    if (!validRows.length) {
      toast({ title: "Nothing to save", description: "Match students and amounts first.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const inserts = validRows.map((r) => ({
        student_profile_id: r.matchedStudentId,
        amount: parseFloat(r.amount),
        method,
        status: "paid",
        description: r.details ? `Bulk: ${r.details}` : "Bulk bank statement entry",
      }));
      const { error } = await supabase.from("payments").insert(inserts);
      if (error) throw error;
      toast({ title: "Bulk payments saved", description: `${inserts.length} payments recorded.` });
      onSaved();
      reset();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Save failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Bulk Payment Entry</DialogTitle>
            <DialogDescription>
              Scan or upload a bank statement. We'll extract every credit, auto-match students by name, and let you review before saving.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2 border-b pb-3">
            <Button onClick={() => setCameraOpen(true)} disabled={scanning} className="gap-2">
              <Camera size={16} /> Capture with Camera
            </Button>
            <Button variant="outline" onClick={() => setPhoneOpen(true)} disabled={scanning} className="gap-2">
              <Smartphone size={16} /> Scan with Phone (QR)
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={scanning} className="gap-2">
              <Upload size={16} /> Upload Image
            </Button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            <div className="ml-auto flex items-center gap-2">
              <Label className="text-xs">Default Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Bank Deposit">Bank Deposit</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="EcoCash">EcoCash</SelectItem>
                  <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {scanning && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="animate-spin h-4 w-4" /> Extracting transactions with AI...
            </div>
          )}

          <div className="flex-1 overflow-auto">
            {rows.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No rows yet. Capture or upload a statement image to begin.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary">
                    <TableHead className="w-24">Date</TableHead>
                    <TableHead>Details (from slip)</TableHead>
                    <TableHead className="w-72">Matched Student</TableHead>
                    <TableHead className="w-28">Amount ($)</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const matched = !!r.matchedStudentId;
                    const lowConf = matched && r.matchScore < 8;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs">{r.date || "—"}</TableCell>
                        <TableCell>
                          <div className="text-xs font-medium">{r.rawName || "(no name)"}</div>
                          {r.details && <div className="text-[11px] text-muted-foreground">{r.details}</div>}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={r.matchedStudentId}
                            onValueChange={(v) => {
                              const c = r.candidates.find((x) => x.id === v);
                              updateRow(r.id, { matchedStudentId: v, matchScore: c?.score ?? 10 });
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="— pick student —" />
                            </SelectTrigger>
                            <SelectContent>
                              {r.candidates.length === 0 && (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground">No close match</div>
                              )}
                              {r.candidates.map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                              ))}
                              {students
                                .filter((s) => !r.candidates.some((c) => c.id === s.id))
                                .slice(0, 50)
                                .map((s) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {titleCaseName(`${s.first_name} ${s.last_name}`)} ({s.registration_number})
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <div className="mt-1">
                            {!matched ? (
                              <Badge variant="destructive" className="text-[10px] gap-1"><AlertTriangle size={10} /> No match</Badge>
                            ) : lowConf ? (
                              <Badge className="bg-warning text-warning-foreground text-[10px]">Low confidence — verify</Badge>
                            ) : (
                              <Badge className="bg-success text-success-foreground text-[10px] gap-1"><CheckCircle2 size={10} /> Matched</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={r.amount}
                            onChange={(e) => updateRow(r.id, { amount: e.target.value })}
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => removeRow(r.id)} title="Remove">
                            <Trash2 size={14} className="text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          <DialogFooter className="border-t pt-3 sm:justify-between">
            <div className="text-xs text-muted-foreground">
              {rows.length} extracted · {validRows.length} ready · {unmatchedCount > 0 && (
                <span className="text-destructive">{unmatchedCount} unmatched</span>
              )} {validRows.length > 0 && <span className="ml-2 font-semibold text-foreground">Total: ${total.toFixed(2)}</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleClose(false)} disabled={saving}>Cancel</Button>
              <Button onClick={handleSaveAll} disabled={saving || !validRows.length} className="gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save {validRows.length || ""} Payment{validRows.length === 1 ? "" : "s"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CameraCaptureDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onCapture={processImage}
        title="Scan Bank Statement"
        description="Capture a clear photo of the statement page. We'll extract every credit transaction."
      />

      <PhoneCameraPairDialog
        open={phoneOpen}
        onOpenChange={setPhoneOpen}
        title="Scan Bank Statement with Phone"
        onPhotos={async (urls) => {
          for (const u of urls) {
            // eslint-disable-next-line no-await-in-loop
            await processImage(u);
          }
        }}
      />
    </>
  );
};

export default BulkPaymentDialog;
