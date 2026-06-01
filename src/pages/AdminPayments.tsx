import { useState, useEffect, useRef } from "react";
import { formatClass, titleCaseName } from "@/lib/normalize";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Camera, Upload, Loader2, CheckCircle, Search, Eye, Printer, MoreVertical, UserPlus, Layers, Tag, FileText, Pencil, Trash2 } from "lucide-react";

import { generateReceipt, generateThermalReceipt, printReceipt } from "@/lib/generateReceipt";
import { generatePaidLabels, generatePaidStudentsList, PaidStudent } from "@/lib/generatePaidLabels";
import { generateFeesByClassPDF } from "@/lib/generateFeesByClass";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import BulkPaymentDialog from "@/components/BulkPaymentDialog";
import PaymentsBackupPanel from "@/components/PaymentsBackupPanel";

interface PaymentRow {
  id: string;
  student_profile_id: string;
  amount: number;
  method: string;
  status: string;
  receipt_number: string | null;
  created_at: string;
  currency: string;
  description: string | null;
  paynow_reference: string | null;
  phone: string | null;
  deposit_slip_url: string | null;
  verification_hash: string | null;
  studentName?: string;
  regNo?: string;
  studentClass?: string;
}

interface StudentProfile {
  id: string;
  first_name: string;
  last_name: string;
  registration_number: string;
  guardian_phone: string | null;
  form?: string | null;
  stream?: string | null;
}

interface ScannedPayment {
  depositor_name?: string;
  student_name?: string;
  possible_student_name?: string;
  amount?: string;
  currency?: string;
  bank_name?: string;
  swift_code?: string;
  reference_number?: string;
  transaction_id_format?: string;
  date?: string;
  method?: string;
}

const getErrorMessage = (err: unknown) => err instanceof Error ? err.message : "Something went wrong";

const normalizeLookupText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const lookupTokens = (value: string) => normalizeLookupText(value).split(" ").filter(Boolean);

const scoreStudentMatch = (rawName: string, student: StudentProfile) => {
  const haystack = normalizeLookupText(rawName);
  const first = normalizeLookupText(student.first_name);
  const last = normalizeLookupText(student.last_name);
  const reg = normalizeLookupText(student.registration_number);
  const full = normalizeLookupText(`${student.first_name} ${student.last_name}`);
  const reverse = normalizeLookupText(`${student.last_name} ${student.first_name}`);
  const words = new Set(lookupTokens(rawName));

  let score = 0;
  if (reg && haystack.includes(reg)) score += 10;
  if (full && haystack.includes(full)) score += 8;
  if (reverse && haystack.includes(reverse)) score += 8;
  if (first && words.has(first)) score += 3;
  if (last && words.has(last)) score += 3;
  return score;
};

const findStrongStudentMatch = (rawName: string, students: StudentProfile[]) => {
  const ranked = students
    .map((student) => ({ student, score: scoreStudentMatch(rawName, student) }))
    .filter((item) => item.score >= 6)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) return null;
  if (ranked[1] && ranked[1].score === ranked[0].score) return null;
  return ranked[0].student;
};

interface FeeSummary {
  profile_id: string;
  total_fees: number;
  total_paid: number;
  balance: number;
  payment_status: string;
}

const AdminPayments = () => {
  const { toast } = useToast();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [slipDialogOpen, setSlipDialogOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scannedData, setScannedData] = useState<ScannedPayment | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [feeSummary, setFeeSummary] = useState<Map<string, FeeSummary>>(new Map());
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualMethod, setManualMethod] = useState("");
  const [manualRef, setManualRef] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [patternWarnings, setPatternWarnings] = useState<string[]>([]);
  const [quickRegister, setQuickRegister] = useState(false);
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newForm, setNewForm] = useState("");
  const [newStream, setNewStream] = useState("");
  const [newGender, setNewGender] = useState("male");
  const [registering, setRegistering] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editPayment, setEditPayment] = useState<PaymentRow | null>(null);
  const [editForm, setEditForm] = useState({ amount: "", method: "", status: "paid", description: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetchPayments();
    fetchStudents();
    fetchFeeSummary();
  }, []);

  const fetchStudents = async () => {
    const { data } = await supabase.from("profiles").select("id, first_name, last_name, registration_number, guardian_phone, form, stream").order("first_name");
    if (data) setStudents(data);
  };

  const fetchFeeSummary = async () => {
    const { data } = await supabase.rpc("get_student_fee_summary");
    if (data) {
      const map = new Map<string, FeeSummary>();
      for (const r of data as FeeSummary[]) map.set(r.profile_id, r);
      setFeeSummary(map);
    }
  };



  const fetchPayments = async () => {
    setLoading(true);
    const { data: paymentData } = await supabase
      .from("payments")
      .select("*")
      .order("created_at", { ascending: false });

    if (paymentData) {
      const profileIds = [...new Set(paymentData.map(p => p.student_profile_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, registration_number, form, stream")
        .in("id", profileIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      const enriched = paymentData.map(p => {
        const prof = profileMap.get(p.student_profile_id);
        return {
          ...p,
          studentName: prof ? titleCaseName(`${prof.first_name} ${prof.last_name}`) : "Unknown",
          regNo: prof?.registration_number || "N/A",
          studentClass: formatClass(prof),
        };
      });
      setPayments(enriched);
      setPayments(enriched);
    }
    fetchFeeSummary();
    setLoading(false);
  };

  const openEditPayment = (p: PaymentRow) => {
    setEditPayment(p);
    setEditForm({
      amount: String(p.amount ?? ""),
      method: p.method || "",
      status: p.status || "paid",
      description: p.description || "",
    });
  };

  const handleUpdatePayment = async () => {
    if (!editPayment) return;
    const amt = parseFloat(editForm.amount);
    if (isNaN(amt) || amt <= 0) {
      toast({ title: "Invalid amount", description: "Enter a positive amount.", variant: "destructive" });
      return;
    }
    setEditSaving(true);
    const { error } = await supabase
      .from("payments")
      .update({
        amount: amt,
        method: editForm.method || "Cash",
        status: editForm.status,
        description: editForm.description || null,
      })
      .eq("id", editPayment.id);
    setEditSaving(false);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Payment updated" });
    setEditPayment(null);
    fetchPayments();
  };

  const handleDeletePayment = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("payments").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Payment deleted" });
    setDeleteId(null);
    fetchPayments();
  };


  const handleDownloadReceipt = (p: PaymentRow) => {
    generateReceipt({
      receiptNo: p.receipt_number || p.id.slice(0, 12),
      studentName: p.studentName || "Unknown",
      regNo: p.regNo || "N/A",
      studentClass: p.studentClass,
      date: new Date(p.created_at).toLocaleDateString(),
      amount: `$${p.amount}`,
      method: p.method,
      description: p.description || undefined,
      verificationHash: p.verification_hash || undefined,
    });
    toast({ title: "Receipt Downloaded" });
  };

  const handleDownloadThermal = (p: PaymentRow) => {
    generateThermalReceipt({
      receiptNo: p.receipt_number || p.id.slice(0, 12),
      studentName: p.studentName || "Unknown",
      regNo: p.regNo || "N/A",
      studentClass: p.studentClass,
      date: new Date(p.created_at).toLocaleDateString(),
      amount: `$${p.amount}`,
      method: p.method,
      description: p.description || undefined,
      verificationHash: p.verification_hash || undefined,
    });
    toast({ title: "Thermal Receipt Downloaded" });
  };

  const handlePrint = (p: PaymentRow) => {
    printReceipt({
      receiptNo: p.receipt_number || p.id.slice(0, 12),
      studentName: p.studentName || "Unknown",
      regNo: p.regNo || "N/A",
      studentClass: p.studentClass,
      date: new Date(p.created_at).toLocaleDateString(),
      amount: `$${p.amount}`,
      method: p.method,
      description: p.description || undefined,
      verificationHash: p.verification_hash || undefined,
    });
  };

  const handlePrintThermal = (p: PaymentRow) => {
    generateThermalReceipt({
      receiptNo: p.receipt_number || p.id.slice(0, 12),
      studentName: p.studentName || "Unknown",
      regNo: p.regNo || "N/A",
      studentClass: p.studentClass,
      date: new Date(p.created_at).toLocaleDateString(),
      amount: `$${p.amount}`,
      method: p.method,
      description: p.description || undefined,
      verificationHash: p.verification_hash || undefined,
    }, "print");
  };

  const handleSlipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSlipFile(file);

    setScanning(true);
    setSlipDialogOpen(false);

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const resp = await supabase.functions.invoke("extract-payment", {
          body: { imageBase64: base64 },
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });

        if (resp.error) throw new Error(resp.error.message || "Scan failed");

        const payment = resp.data?.payment;
        const warnings: string[] = resp.data?.warnings || [];
        if (payment) {
          setScannedData(payment);
          setPatternWarnings(warnings);
          setManualAmount(payment.amount || "");
          setManualMethod(payment.method || "Bank Deposit");
          setManualRef(payment.reference_number || "");

          const extractedName = payment.student_name || payment.possible_student_name || payment.depositor_name || "";
          const match = findStrongStudentMatch(extractedName, students);
          if (match) {
            setSelectedStudentId(match.id);
            setNewFirstName(match.first_name);
            setNewLastName(match.last_name);
            setStudentSearch(`${match.first_name} ${match.last_name}`);
          } else {
            const parts = extractedName.trim().split(/\s+/);
            setNewFirstName(parts[0] || "");
            setNewLastName(parts.slice(1).join(" ") || "");
            setSelectedStudentId("");
            setStudentSearch(extractedName);
          }
          setConfirmDialogOpen(true);
        }
      } catch (err) {
        toast({ title: "Scan Failed", description: getErrorMessage(err), variant: "destructive" });
      } finally {
        setScanning(false);
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSavePayment = async () => {
    if (!manualAmount) {
      toast({ title: "Missing Info", description: "Enter amount.", variant: "destructive" });
      return;
    }
    if (!selectedStudentId && (!newFirstName.trim() || !newLastName.trim())) {
      toast({ title: "Missing Info", description: "Enter student first and last name.", variant: "destructive" });
      return;
    }

    setSaving(true);

    // Auto-register student if none selected
    let studentId = selectedStudentId;
    if (!studentId) {
      try {
        const { data, error: regErr } = await supabase.functions.invoke("manage-students", {
          body: {
            action: "create_student",
            firstName: newFirstName.trim(),
            lastName: newLastName.trim(),
            form: newForm || null,
            stream: newStream || null,
            gender: newGender,
          },
        });
        if (regErr) throw regErr;
        if (data?.error) throw new Error(data.error);
        const { data: newStudents } = await supabase.from("profiles")
          .select("id, first_name, last_name, registration_number, guardian_phone, form, stream")
          .ilike("first_name", newFirstName.trim())
          .ilike("last_name", newLastName.trim())
          .order("created_at", { ascending: false })
          .limit(1);
        if (newStudents && newStudents.length > 0) {
          studentId = newStudents[0].id;
          setStudents(prev => prev.find(s => s.id === studentId) ? prev : [...prev, newStudents[0]]);
        } else {
          throw new Error("Failed to create student record");
        }
      } catch (err) {
        toast({ title: "Auto-register failed", description: getErrorMessage(err), variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    let depositSlipUrl: string | null = null;

    // Upload deposit slip image to storage
    if (slipFile) {
      const fileName = `${Date.now()}-${slipFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("deposit-slips")
        .upload(fileName, slipFile);

      if (uploadError) {
        console.error("Slip upload error:", uploadError);
      } else {
        const { data: urlData } = supabase.storage
          .from("deposit-slips")
          .getPublicUrl(uploadData.path);
        depositSlipUrl = urlData.publicUrl;
      }
    }

    const { data: paymentData, error } = await supabase.from("payments").insert({
      student_profile_id: studentId,
      amount: parseFloat(manualAmount),
      method: manualMethod || "Bank Deposit",
      status: "paid",
      paynow_reference: manualRef || null,
      description: "Deposit slip payment",
      deposit_slip_url: depositSlipUrl,
      bank_name: scannedData?.bank_name || null,
      swift_code: scannedData?.swift_code || null,
      transaction_id_format: scannedData?.transaction_id_format || null,
    }).select().single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Send SMS notification to guardian
      const student = students.find(s => s.id === studentId);
      if (student?.guardian_phone) {
        try {
          await supabase.functions.invoke("send-notification", {
            body: {
              type: "payment",
              guardianPhone: student.guardian_phone,
              studentName: titleCaseName(`${student.first_name} ${student.last_name}`),
              amount: manualAmount,
              receiptNumber: paymentData?.receipt_number,
              method: manualMethod || "Bank Deposit",
            },
          });
        } catch {
          // Payment saved, notification failed silently
        }
      }
      toast({ title: "Payment Recorded", description: "Payment saved successfully." });
      setConfirmDialogOpen(false);
      setScannedData(null);
      setSlipFile(null);
      setPatternWarnings([]);
      setSelectedStudentId("");
      setNewFirstName("");
      setNewLastName("");
      setNewForm("");
      setNewStream("");
      setNewGender("male");
      setManualAmount("");
      setManualMethod("");
      setManualRef("");
      fetchPayments();
    }
    setSaving(false);
  };

  const handleQuickRegister = async () => {
    if (!newFirstName.trim() || !newLastName.trim()) {
      toast({ title: "Missing Info", description: "First and last name are required.", variant: "destructive" });
      return;
    }
    setRegistering(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-students", {
        body: {
          action: "create_student",
          firstName: newFirstName.trim(),
          lastName: newLastName.trim(),
          form: newForm || null,
          stream: newStream || null,
          gender: newGender,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      // Refresh students list and select the new student
      await fetchStudents();
      // Find the newly created student by name match (most recent)
      const { data: newStudents } = await supabase.from("profiles")
        .select("id, first_name, last_name, registration_number, guardian_phone, form, stream")
        .ilike("first_name", newFirstName.trim())
        .ilike("last_name", newLastName.trim())
        .order("created_at", { ascending: false })
        .limit(1);
      if (newStudents && newStudents.length > 0) {
        setSelectedStudentId(newStudents[0].id);
        setStudents(prev => {
          const exists = prev.find(s => s.id === newStudents[0].id);
          return exists ? prev : [...prev, newStudents[0]];
        });
      }
      toast({ title: "Student Registered", description: `${newFirstName} ${newLastName} added successfully.` });
      setQuickRegister(false);
      setNewFirstName("");
      setNewLastName("");
      setNewForm("");
      setNewStream("");
      setNewGender("male");
    } catch (err) {
      toast({ title: "Registration Failed", description: getErrorMessage(err), variant: "destructive" });
    }
    setRegistering(false);
  };

  const filteredStudents = students
    .filter(s => {
      if (studentSearch === "") return true;
      const queryTokens = lookupTokens(studentSearch);
      const target = normalizeLookupText(`${s.first_name} ${s.last_name} ${s.registration_number} ${s.form || ""} ${s.stream || ""}`);
      return queryTokens.every((token) => target.includes(token));
    })
    .slice(0, 80);

  const getPaidStudentList = (): PaidStudent[] => {
    const paidStatuses = ["paid", "completed", "confirmed"];
    const byStudent = new Map<string, PaidStudent>();
    for (const p of payments) {
      if (!paidStatuses.includes(p.status)) continue;
      const existing = byStudent.get(p.student_profile_id);
      if (existing) {
        existing.amount += Number(p.amount) || 0;
        if (new Date(p.created_at) > new Date(existing.date)) {
          existing.date = new Date(p.created_at).toLocaleDateString();
        }
      } else {
        byStudent.set(p.student_profile_id, {
          name: p.studentName || "Unknown",
          regNo: p.regNo || "N/A",
          studentClass: p.studentClass || "—",
          amount: Number(p.amount) || 0,
          date: new Date(p.created_at).toLocaleDateString(),
        });
      }
    }
    return Array.from(byStudent.values()).sort((a, b) => a.name.localeCompare(b.name));
  };

  const buildFeesByClassGroups = () => {
    const groups = new Map<string, {
      paid: { name: string; regNo: string; amount: number; expected: number; balance: number }[];
      unpaid: { name: string; regNo: string; paid: number; expected: number; balance: number }[];
    }>();
    for (const s of students) {
      const cls = formatClass(s) || "Unassigned";
      if (!groups.has(cls)) groups.set(cls, { paid: [], unpaid: [] });
      const g = groups.get(cls)!;
      const name = titleCaseName(`${s.first_name} ${s.last_name}`);
      const summary = feeSummary.get(s.id);
      const expected = summary?.total_fees || 0;
      const paid = summary?.total_paid || 0;
      const balance = expected - paid; // positive = owing
      const status = summary?.payment_status || "";
      const fullyPaid = status === "Paid in Full" || status === "Overpaid" || (expected > 0 && paid >= expected);
      if (fullyPaid) {
        g.paid.push({ name, regNo: s.registration_number, amount: paid, expected, balance: Math.max(0, balance) });
      } else {
        g.unpaid.push({ name, regNo: s.registration_number, paid, expected, balance: Math.max(0, balance) });
      }
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([className, v]) => ({ className, paid: v.paid, unpaid: v.unpaid }));
  };


  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-foreground">Payment Records</h2>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => {
              setScannedData({ depositor_name: "", bank_name: "", date: "", amount: "", method: "Cash", reference_number: "" });
              setManualAmount("");
              setManualMethod("Cash");
              setManualRef("");
              setSelectedStudentId("");
              setStudentSearch("");
              setSlipFile(null);
              setConfirmDialogOpen(true);
            }} className="gap-2">
              Record Payment
            </Button>
            <Button variant="outline" onClick={() => setBulkOpen(true)} className="gap-2">
              <Layers size={16} /> Bulk Entry
            </Button>
            <Button variant="outline" onClick={() => {
              const paid = getPaidStudentList();
              if (!paid.length) { toast({ title: "No paid students", variant: "destructive" }); return; }
              generatePaidLabels(paid);
              toast({ title: "Labels generated", description: `${paid.length} PAID labels.` });
            }} className="gap-2">
              <Tag size={16} /> PAID Labels
            </Button>
            <Button variant="outline" onClick={() => {
              const paid = getPaidStudentList();
              if (!paid.length) { toast({ title: "No paid students", variant: "destructive" }); return; }
              generatePaidStudentsList(paid);
              toast({ title: "List generated", description: `${paid.length} students.` });
            }} className="gap-2">
              <FileText size={16} /> Paid List PDF
            </Button>
            <Button variant="outline" onClick={() => {
              const groups = buildFeesByClassGroups();
              if (!groups.length) { toast({ title: "No students found", variant: "destructive" }); return; }
              generateFeesByClassPDF(groups);
              toast({ title: "PDF generated", description: `${groups.length} class(es).` });
            }} className="gap-2">
              <FileText size={16} /> Fees by Class PDF
            </Button>
            <Button onClick={() => setSlipDialogOpen(true)} className="gap-2">
              <Camera size={16} /> Scan Deposit Slip
            </Button>
          </div>
        </div>

        {scanning && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-center gap-3 py-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm font-medium">Scanning deposit slip with AI...</span>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">All Transactions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : payments.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">No payments recorded yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary">
                    <TableHead>Receipt #</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Reg No.</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.receipt_number || p.id.slice(0, 8)}</TableCell>
                      <TableCell>{p.studentName}</TableCell>
                      <TableCell>{p.regNo}</TableCell>
                      <TableCell>${p.amount}</TableCell>
                      <TableCell>{p.method}</TableCell>
                      <TableCell>{new Date(p.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Badge className={["paid","completed","confirmed"].includes(p.status) ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"}>
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {p.deposit_slip_url && (
                            <Button variant="ghost" size="icon" asChild>
                              <a href={p.deposit_slip_url} target="_blank" rel="noopener noreferrer" title="View Slip">
                                <Eye size={16} />
                              </a>
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical size={16} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditPayment(p)}>
                                <Pencil size={14} className="mr-2" /> Edit Payment
                              </DropdownMenuItem>
                              {(p.status === "paid" || p.status === "completed" || p.status === "confirmed") && (
                                <>
                                  <DropdownMenuItem onClick={() => handlePrint(p)}>
                                    <Printer size={14} className="mr-2" /> Print A4
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handlePrintThermal(p)}>
                                    <Printer size={14} className="mr-2" /> Print Thermal
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleDownloadReceipt(p)}>
                                    <Download size={14} className="mr-2" /> Download A4 PDF
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleDownloadThermal(p)}>
                                    <Download size={14} className="mr-2" /> Download Thermal PDF
                                  </DropdownMenuItem>
                                </>
                              )}
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteId(p.id)}>
                                <Trash2 size={14} className="mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>

                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Fees status grouped by class */}
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Fees Status by Class</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(() => {
              const groups = new Map<string, { paid: StudentProfile[]; unpaid: StudentProfile[] }>();
              for (const s of students) {
                const cls = formatClass(s) || "Unassigned";
                if (!groups.has(cls)) groups.set(cls, { paid: [], unpaid: [] });
                const bucket = groups.get(cls)!;
                const summary = feeSummary.get(s.id);
                const expected = summary?.total_fees || 0;
                const paid = summary?.total_paid || 0;
                const status = summary?.payment_status || "";
                const fullyPaid = status === "Paid in Full" || status === "Overpaid" || (expected > 0 && paid >= expected);
                if (fullyPaid) bucket.paid.push(s);
                else bucket.unpaid.push(s);
              }
              const sortedClasses = Array.from(groups.keys()).sort();
              if (!sortedClasses.length) {
                return <p className="text-center text-muted-foreground py-6 text-sm">No students found.</p>;
              }
              return sortedClasses.map((cls) => {
                const g = groups.get(cls)!;
                const total = g.paid.length + g.unpaid.length;
                const pct = total ? Math.round((g.paid.length / total) * 100) : 0;
                return (
                  <details key={cls} className="rounded-lg border bg-card">
                    <summary className="cursor-pointer list-none p-3 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="font-semibold truncate">{cls}</span>
                        <Badge variant="outline" className="text-[10px]">{total} student{total !== 1 ? "s" : ""}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-success text-success-foreground text-[10px]">{g.paid.length} fully paid</Badge>
                        <Badge variant="destructive" className="text-[10px]">{g.unpaid.length} outstanding</Badge>
                        <span className="text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                      </div>
                    </summary>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 pt-0 border-t">
                      <div>
                        <p className="text-xs font-semibold uppercase text-success mb-2">Fully Paid ({g.paid.length})</p>
                        {g.paid.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">None</p>
                        ) : (
                          <ul className="space-y-1 max-h-64 overflow-y-auto pr-1">
                            {g.paid.map(s => {
                              const sum = feeSummary.get(s.id);
                              return (
                                <li key={s.id} className="text-sm flex justify-between gap-2 border-b border-border/40 pb-1">
                                  <span className="truncate">{titleCaseName(`${s.first_name} ${s.last_name}`)}</span>
                                  <span className="font-mono text-xs text-success">${(sum?.total_paid || 0).toFixed(2)}</span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase text-destructive mb-2">Outstanding ({g.unpaid.length})</p>
                        {g.unpaid.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">None</p>
                        ) : (
                          <ul className="space-y-1 max-h-64 overflow-y-auto pr-1">
                            {g.unpaid.map(s => {
                              const sum = feeSummary.get(s.id);
                              const bal = Math.max(0, (sum?.total_fees || 0) - (sum?.total_paid || 0));
                              return (
                                <li key={s.id} className="text-sm flex justify-between gap-2 border-b border-border/40 pb-1">
                                  <span className="truncate">
                                    {titleCaseName(`${s.first_name} ${s.last_name}`)}
                                    <span className="text-[10px] text-muted-foreground ml-1">({s.registration_number})</span>
                                  </span>
                                  <span className="font-mono text-xs text-destructive">${bal.toFixed(2)}</span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  </details>
                );
              });
            })()}

          </CardContent>
        </Card>
      </div>

      {/* Upload Slip Dialog */}
      <Dialog open={slipDialogOpen} onOpenChange={setSlipDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scan Deposit Slip</DialogTitle>
            <DialogDescription>
              Take a photo or upload an image of the deposit slip. AI will extract the payment details automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div
              className="flex h-40 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 transition-colors hover:border-primary/50 hover:bg-muted/50"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">Click to upload or take photo</p>
              <p className="text-xs text-muted-foreground/70">JPG, PNG supported</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleSlipUpload}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Scanned Payment Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-success" /> Payment Details Extracted
            </DialogTitle>
            <DialogDescription>
              Review and confirm the details below. Select the correct student then save.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
          {scannedData && (
            <>
              <div className="space-y-2">
                <Label>Depositor / Student Name</Label>
                <Input
                  value={scannedData.depositor_name || ""}
                  onChange={(e) => setScannedData({ ...scannedData, depositor_name: e.target.value })}
                  placeholder="Name on deposit slip or student name"
                />
              </div>

              <div className="space-y-2">
                <Label>Bank</Label>
                <Input
                  value={scannedData.bank_name || ""}
                  onChange={(e) => setScannedData({ ...scannedData, bank_name: e.target.value })}
                  placeholder="e.g. Ecobank Zimbabwe"
                />
              </div>

              <div className="space-y-2">
                <Label>Payment Date</Label>
                <Input
                  value={scannedData.date || ""}
                  onChange={(e) => setScannedData({ ...scannedData, date: e.target.value })}
                  type="date"
                />
              </div>

              <div className="space-y-3 rounded-md border p-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">
                    {selectedStudentId ? "Existing Student (editable)" : "Student will be auto-registered"}
                  </p>
                  {selectedStudentId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => { setSelectedStudentId(""); }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">First Name *</Label>
                    <Input value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} placeholder="First name" />
                  </div>
                  <div>
                    <Label className="text-xs">Last Name *</Label>
                    <Input value={newLastName} onChange={(e) => setNewLastName(e.target.value)} placeholder="Last name" />
                  </div>
                </div>
                {!selectedStudentId && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Form</Label>
                        <Select value={newForm} onValueChange={(v) => { setNewForm(v); setNewStream(""); }}>
                          <SelectTrigger><SelectValue placeholder="Select form" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Form 1">Form 1</SelectItem>
                            <SelectItem value="Form 2">Form 2</SelectItem>
                            <SelectItem value="Form 3">Form 3</SelectItem>
                            <SelectItem value="Form 4">Form 4</SelectItem>
                            <SelectItem value="Form 5">Form 5</SelectItem>
                            <SelectItem value="Form 6">Form 6</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Stream</Label>
                        <Select value={newStream} onValueChange={setNewStream} disabled={!newForm}>
                          <SelectTrigger><SelectValue placeholder={newForm ? "Select stream" : "Pick form first"} /></SelectTrigger>
                          <SelectContent>
                            {(newForm === "Form 5" || newForm === "Form 6") ? (
                              <>
                                <SelectItem value="Sciences">Sciences</SelectItem>
                                <SelectItem value="Commercials">Commercials</SelectItem>
                                <SelectItem value="Arts">Arts</SelectItem>
                              </>
                            ) : (
                              <>
                                <SelectItem value="G1">G1</SelectItem>
                                <SelectItem value="G2">G2</SelectItem>
                                <SelectItem value="G22">G22</SelectItem>
                                <SelectItem value="Blue">Blue</SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Gender</Label>
                        <Select value={newGender} onValueChange={setNewGender}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Or link to existing student</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search student..."
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      className="pl-9 h-8 text-xs"
                    />
                  </div>
                  <Select value={selectedStudentId} onValueChange={(v) => {
                    setSelectedStudentId(v);
                    const s = students.find(x => x.id === v);
                    if (s) { setNewFirstName(s.first_name); setNewLastName(s.last_name); }
                  }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose existing (optional)" /></SelectTrigger>
                    <SelectContent>
                      {filteredStudents.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.first_name} {s.last_name} ({s.registration_number}){s.form || s.stream ? ` — ${formatClass(s)}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>


              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount ($) *</Label>
                  <Input value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} type="number" />
                </div>
                <div className="space-y-2">
                  <Label>Method</Label>
                  <Select value={manualMethod} onValueChange={setManualMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bank Deposit">Bank Deposit</SelectItem>
                      <SelectItem value="EcoCash">EcoCash</SelectItem>
                      <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Reference Number</Label>
                <Input value={manualRef} onChange={(e) => setManualRef(e.target.value)} placeholder="e.g. DEP-123456" />
              </div>
            </>
          )}
          </div>

          <DialogFooter className="flex-shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePayment} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="mt-6">
        <PaymentsBackupPanel onRestored={fetchPayments} />
      </div>

      <BulkPaymentDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        students={students}
        onSaved={fetchPayments}
      />

      {/* Edit Payment Dialog */}
      <Dialog open={!!editPayment} onOpenChange={(v) => !v && setEditPayment(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Payment</DialogTitle>
            <DialogDescription>
              {editPayment?.studentName} — {editPayment?.receipt_number || editPayment?.id.slice(0, 8)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Amount ($)</Label>
              <Input type="number" step="0.01" value={editForm.amount} onChange={(e) => setEditForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <Label>Method</Label>
              <Select value={editForm.method} onValueChange={(v) => setEditForm(f => ({ ...f, method: v }))}>
                <SelectTrigger><SelectValue placeholder="Method" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Bank Deposit">Bank Deposit</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="EcoCash">EcoCash</SelectItem>
                  <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                  <SelectItem value="Paynow">Paynow</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="voided">Voided</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Input value={editForm.description} onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPayment(null)} disabled={editSaving}>Cancel</Button>
            <Button onClick={handleUpdatePayment} disabled={editSaving}>
              {editSaving ? <Loader2 size={14} className="animate-spin mr-2" /> : null} Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Payment Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this payment?</DialogTitle>
            <DialogDescription>This action cannot be undone. The payment will be removed permanently.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeletePayment}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
};

export default AdminPayments;
