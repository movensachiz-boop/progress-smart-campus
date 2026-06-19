import { useState, useEffect } from "react";
import { formatClass, titleCaseName } from "@/lib/normalize";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Download, Loader2, CreditCard, Smartphone, Building2, DollarSign, CheckCircle2, Printer } from "lucide-react";
import { generateReceipt, generateThermalReceipt, printReceipt } from "@/lib/generateReceipt";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Payment {
  id: string;
  amount: number;
  currency: string;
  method: string;
  status: string;
  receipt_number: string | null;
  description: string | null;
  created_at: string;
  verification_hash: string | null;
}

interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  registration_number: string;
  balance: number;
  form?: string | null;
  stream?: string | null;
  gender?: string;
  is_beginner?: boolean;
  residency?: string;
}

const StudentPayments = () => {
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [termFees, setTermFees] = useState(0);
  const [loading, setLoading] = useState(true);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("ecocash");
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [bankRef, setBankRef] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [lastPayment, setLastPayment] = useState<Payment | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, registration_number, balance, form, stream, gender, is_beginner, residency")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileData) setProfile(profileData);

    if (profileData) {
      const { data: paymentData } = await supabase
        .from("payments")
        .select("*")
        .eq("student_profile_id", profileData.id)
        .order("created_at", { ascending: false });
      if (paymentData) setPayments(paymentData);

      if (profileData.form) {
        const { data: feeItems } = await supabase
          .from("fee_requirements")
          .select("*")
          .eq("is_active", true);
        if (feeItems) {
          const formNum = profileData.form;
          const stream = profileData.stream || "";
          const studentGender = profileData.gender === "female" ? "girls" : "boys";
          const isBeginner = !!profileData.is_beginner;
          const residency = profileData.residency || "day";
          const learningArea = ["Sciences", "Commercials", "Arts"].includes(stream) ? stream : null;
          const applicable = feeItems.filter((item: any) => {
            if (item.category !== "fees" && !isBeginner) return false;
            if (item.beginner_only && !isBeginner) return false;
            if (item.returning_only && isBeginner) return false;
            if (!item.form_levels.includes(formNum)) return false;
            if (item.gender !== "all" && item.gender !== studentGender) return false;
            if (item.residency && item.residency !== "all" && item.residency !== residency) return false;
            if (item.learning_area) return item.learning_area === learningArea;
            return true;
          });
          setTermFees(applicable.reduce((sum: number, i: any) => sum + Number(i.amount), 0));
        }
      }
    }
    setLoading(false);
  };

  const handlePay = async () => {
    if (!profile) return;
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }

    if (paymentMethod === "ecocash" && !phone) {
      toast({ title: "Enter your EcoCash number", variant: "destructive" });
      return;
    }
    if (paymentMethod === "visa" && (!cardNumber || !cardExpiry || !cardCvv)) {
      toast({ title: "Complete card details", variant: "destructive" });
      return;
    }

    setSubmitting(true);

    const methodLabel =
      paymentMethod === "ecocash" ? "EcoCash" :
      paymentMethod === "visa" ? "Visa Card" : "Bank Transfer";

    const { data, error } = await supabase
      .from("payments")
      .insert({
        student_profile_id: profile.id,
        amount: numAmount,
        method: methodLabel,
        status: paymentMethod === "bank" ? "pending" : "confirmed",
        phone: paymentMethod === "ecocash" ? phone : null,
        description: "School Fees Payment",
      })
      .select()
      .single();

    setSubmitting(false);

    if (error) {
      toast({ title: "Payment failed", description: error.message, variant: "destructive" });
      return;
    }

    setLastPayment(data);
    setPayDialogOpen(false);
    setSuccessDialogOpen(true);
    resetForm();
    loadData();
    toast({ title: "Payment recorded", description: `${methodLabel} payment of $${numAmount.toFixed(2)} submitted.` });
  };

  const resetForm = () => {
    setAmount("");
    setPhone("");
    setCardNumber("");
    setCardExpiry("");
    setCardCvv("");
    setBankRef("");
    setPaymentMethod("ecocash");
  };

  const handleDownloadReceipt = (p: Payment) => {
    generateReceipt({
      receiptNo: p.receipt_number || p.id.slice(0, 8),
      studentName: profile ? titleCaseName(`${profile.first_name} ${profile.last_name}`) : "Student",
      regNo: profile?.registration_number || "N/A",
      studentClass: formatClass(profile),
      date: new Date(p.created_at).toLocaleDateString(),
      amount: `$${p.amount.toFixed(2)}`,
      method: p.method,
      description: p.description || undefined,
      verificationHash: p.verification_hash || undefined,
    });
    toast({ title: "Receipt Downloaded" });
  };

  const handleDownloadThermal = (p: Payment) => {
    generateThermalReceipt({
      receiptNo: p.receipt_number || p.id.slice(0, 8),
      studentName: profile ? titleCaseName(`${profile.first_name} ${profile.last_name}`) : "Student",
      regNo: profile?.registration_number || "N/A",
      studentClass: formatClass(profile),
      date: new Date(p.created_at).toLocaleDateString(),
      amount: `$${p.amount.toFixed(2)}`,
      method: p.method,
      description: p.description || undefined,
      verificationHash: p.verification_hash || undefined,
    });
    toast({ title: "Thermal Receipt Downloaded" });
  };

  const handlePrint = (p: Payment) => {
    printReceipt({
      receiptNo: p.receipt_number || p.id.slice(0, 8),
      studentName: profile ? titleCaseName(`${profile.first_name} ${profile.last_name}`) : "Student",
      regNo: profile?.registration_number || "N/A",
      studentClass: formatClass(profile),
      date: new Date(p.created_at).toLocaleDateString(),
      amount: `$${p.amount.toFixed(2)}`,
      method: p.method,
      description: p.description || undefined,
      verificationHash: p.verification_hash || undefined,
    });
  };

  const statusColor = (s: string) =>
    s === "confirmed" ? "bg-success text-success-foreground" :
    s === "pending" ? "bg-warning text-warning-foreground" :
    "bg-destructive text-destructive-foreground";

  return (
    <DashboardLayout role="student">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-foreground">My Payments</h2>
          <Button onClick={() => setPayDialogOpen(true)} className="gap-2">
            <DollarSign size={16} /> Make Payment
          </Button>
        </div>

        {(() => {
          const totalPaid = payments
            .filter((p) => p.status === "paid" || p.status === "completed" || p.status === "confirmed")
            .reduce((s, p) => s + Number(p.amount), 0);
          const outstanding = Math.max(0, termFees - totalPaid);
          return (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="shadow-card"><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Term Fees</p>
                <p className="text-2xl font-bold">${termFees.toFixed(2)}</p>
              </CardContent></Card>
              <Card className="shadow-card"><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Paid</p>
                <p className="text-2xl font-bold text-success">${totalPaid.toFixed(2)}</p>
              </CardContent></Card>
              <Card className="shadow-card"><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className={`text-2xl font-bold ${outstanding > 0 ? "text-warning" : "text-success"}`}>${outstanding.toFixed(2)}</p>
              </CardContent></Card>
            </div>
          );
        })()}

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Payment History</CardTitle>
            <CardDescription>All payments recorded against your account</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Loading...</p>
            ) : payments.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No payments recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Receipt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.receipt_number || p.id.slice(0, 8)}</TableCell>
                      <TableCell>{new Date(p.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>{p.method}</TableCell>
                      <TableCell className="text-right font-medium">${Number(p.amount).toFixed(2)}</TableCell>
                      <TableCell><Badge className={statusColor(p.status) + " capitalize"}>{p.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => handleDownloadReceipt(p)} title="Download A4"><Download size={14} /></Button>
                          <Button size="sm" variant="ghost" onClick={() => handlePrint(p)} title="Print"><Printer size={14} /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Make Payment Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Make a Payment</DialogTitle>
            <DialogDescription>Choose your preferred payment method</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Amount (USD)</Label>
              <Input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} min="1" />
            </div>

            <Tabs value={paymentMethod} onValueChange={setPaymentMethod}>
              <TabsList className="w-full">
                <TabsTrigger value="ecocash" className="flex-1 gap-1"><Smartphone size={14} /> EcoCash</TabsTrigger>
                <TabsTrigger value="visa" className="flex-1 gap-1"><CreditCard size={14} /> Visa</TabsTrigger>
                <TabsTrigger value="bank" className="flex-1 gap-1"><Building2 size={14} /> Bank</TabsTrigger>
              </TabsList>

              <TabsContent value="ecocash" className="space-y-3 pt-2">
                <div>
                  <Label>EcoCash Number</Label>
                  <Input placeholder="07XX XXX XXX" value={phone} onChange={e => setPhone(e.target.value)} />
                </div>
                <p className="text-xs text-muted-foreground">
                  You will receive a prompt on your phone to confirm the payment.
                </p>
              </TabsContent>

              <TabsContent value="visa" className="space-y-3 pt-2">
                <div>
                  <Label>Card Number</Label>
                  <Input placeholder="4242 4242 4242 4242" value={cardNumber} onChange={e => setCardNumber(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Expiry</Label>
                    <Input placeholder="MM/YY" value={cardExpiry} onChange={e => setCardExpiry(e.target.value)} />
                  </div>
                  <div>
                    <Label>CVV</Label>
                    <Input placeholder="123" type="password" value={cardCvv} onChange={e => setCardCvv(e.target.value)} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Visa, Mastercard and Zimswitch cards accepted.
                </p>
              </TabsContent>

              <TabsContent value="bank" className="space-y-3 pt-2">
                <Card className="bg-secondary/50">
                  <CardContent className="pt-4 text-sm space-y-1">
                    <p><strong>Bank:</strong> CBZ Bank</p>
                    <p><strong>Account Name:</strong> PCC School Fees</p>
                    <p><strong>Account No:</strong> 0123456789</p>
                    <p><strong>Branch:</strong> Harare Main</p>
                  </CardContent>
                </Card>
                <div>
                  <Label>Bank Reference / POP Number</Label>
                  <Input placeholder="Enter reference" value={bankRef} onChange={e => setBankRef(e.target.value)} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Bank transfers are verified within 24–48 hours.
                </p>
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Cancel</Button>
            <Button onClick={handlePay} disabled={submitting} className="gap-2">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <DollarSign size={16} />}
              {submitting ? "Processing..." : "Pay Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <DialogContent className="sm:max-w-sm text-center">
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle2 size={48} className="text-success" />
            <DialogTitle>Payment Submitted!</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {lastPayment?.method === "Bank Transfer"
                ? "Your bank transfer is pending verification."
                : `Your ${lastPayment?.method} payment of $${lastPayment?.amount.toFixed(2)} has been confirmed.`}
            </p>
            {lastPayment?.receipt_number && (
              <p className="text-sm font-medium">Receipt: {lastPayment.receipt_number}</p>
            )}
            <Button onClick={() => setSuccessDialogOpen(false)} className="mt-2">Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default StudentPayments;
