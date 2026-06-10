import { Fragment, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { generateFundRundown } from "@/lib/generateFundRundown";
import { Plus, FileDown, MessageSquare, Trash2, Wallet, TrendingDown, ChevronDown, ChevronRight } from "lucide-react";

interface Fund {
  id: string;
  source: string;
  reference: string | null;
  amount: number;
  currency: string;
  received_at: string;
  note: string | null;
}
interface Expense {
  id: string;
  fund_id: string;
  description: string;
  category: string | null;
  amount: number;
  spent_at: string;
}

const AdminFundTracker = () => {
  const { toast } = useToast();
  const [funds, setFunds] = useState<Fund[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [openFund, setOpenFund] = useState<string | null>(null);
  const [newFundOpen, setNewFundOpen] = useState(false);
  const [expenseFundId, setExpenseFundId] = useState<string | null>(null);
  const [smsOpen, setSmsOpen] = useState<string | null>(null);
  const [smsPhone, setSmsPhone] = useState("");
  const [sending, setSending] = useState(false);

  const [fSource, setFSource] = useState("");
  const [fRef, setFRef] = useState("");
  const [fAmount, setFAmount] = useState("");
  const [fNote, setFNote] = useState("");
  const [fCurrency, setFCurrency] = useState("USD");

  const [eDesc, setEDesc] = useState("");
  const [eCat, setECat] = useState("");
  const [eAmt, setEAmt] = useState("");

  const load = async () => {
    const { data: f } = await supabase.from("funds").select("*").order("received_at", { ascending: false });
    const { data: e } = await supabase.from("fund_expenses").select("*").order("spent_at", { ascending: false });
    setFunds((f || []) as Fund[]);
    setExpenses((e || []) as Expense[]);
  };
  useEffect(() => { load(); }, []);

  const expensesFor = (id: string) => expenses.filter((e) => e.fund_id === id);
  const spentFor = (id: string) => expensesFor(id).reduce((s, e) => s + Number(e.amount), 0);
  const balanceFor = (f: Fund) => Number(f.amount) - spentFor(f.id);

  const saveFund = async () => {
    if (!fSource.trim() || !fAmount) return toast({ title: "Source and amount required", variant: "destructive" });
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("funds").insert({
      source: fSource.trim(),
      reference: fRef.trim() || null,
      amount: parseFloat(fAmount),
      currency: fCurrency,
      note: fNote.trim() || null,
      created_by: user?.id,
    });
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Fund logged" });
    setFSource(""); setFRef(""); setFAmount(""); setFNote("");
    setNewFundOpen(false); load();
  };

  const saveExpense = async () => {
    if (!expenseFundId || !eDesc.trim() || !eAmt) return toast({ title: "Description and amount required", variant: "destructive" });
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("fund_expenses").insert({
      fund_id: expenseFundId,
      description: eDesc.trim(),
      category: eCat.trim() || null,
      amount: parseFloat(eAmt),
      created_by: user?.id,
    });
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    setEDesc(""); setECat(""); setEAmt("");
    setExpenseFundId(null); load();
  };

  const deleteFund = async (id: string) => {
    if (!confirm("Delete this fund and all its expenses?")) return;
    await supabase.from("funds").delete().eq("id", id);
    load();
  };
  const deleteExpense = async (id: string) => {
    await supabase.from("fund_expenses").delete().eq("id", id);
    load();
  };

  const downloadPdf = async (f: Fund) => {
    await generateFundRundown({
      source: f.source,
      reference: f.reference,
      amount: Number(f.amount),
      currency: f.currency,
      received_at: f.received_at,
      note: f.note,
      expenses: expensesFor(f.id).map((e) => ({
        description: e.description, category: e.category,
        amount: Number(e.amount), spent_at: e.spent_at,
      })),
    });
  };

  const sendSms = async (f: Fund) => {
    if (!smsPhone.trim()) return toast({ title: "Phone required", variant: "destructive" });
    setSending(true);
    const items = expensesFor(f.id);
    const spent = spentFor(f.id);
    const bal = Number(f.amount) - spent;
    const lines = items.slice(0, 10).map((e, i) => `${i + 1}. ${e.description} - ${f.currency} ${Number(e.amount).toFixed(2)}`).join("\n");
    const more = items.length > 10 ? `\n…and ${items.length - 10} more` : "";
    const msg = `FUND RUNDOWN\nSource: ${f.source}\nReceived: ${f.currency} ${Number(f.amount).toFixed(2)}\n\nUsed for:\n${lines || "(no expenses yet)"}${more}\n\nSpent: ${f.currency} ${spent.toFixed(2)}\nBalance: ${f.currency} ${bal.toFixed(2)}`;
    try {
      const { error } = await supabase.functions.invoke("send-notification", {
        body: {
          type: "custom",
          guardianPhone: smsPhone.trim(),
          studentName: "Fund Tracker",
          customMessage: msg,
        },
      });
      if (error) throw error;
      toast({ title: "SMS sent" });
      setSmsOpen(null); setSmsPhone("");
    } catch (err: any) {
      toast({ title: "SMS failed", description: err.message, variant: "destructive" });
    } finally { setSending(false); }
  };

  const totalReceived = funds.reduce((s, f) => s + Number(f.amount), 0);
  const totalSpent = expenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <DashboardLayout role="admin">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Fund Tracker</h1>
            <p className="text-sm text-muted-foreground">Log every amount received and exactly how it was used.</p>
          </div>
          <Button onClick={() => setNewFundOpen(true)} className="gap-2"><Plus size={16} /> Log Received Money</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4"><div className="flex items-center gap-3"><Wallet className="text-primary" /><div><div className="text-xs text-muted-foreground">Total Received</div><div className="text-xl font-bold">USD {totalReceived.toFixed(2)}</div></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><TrendingDown className="text-destructive" /><div><div className="text-xs text-muted-foreground">Total Spent</div><div className="text-xl font-bold">USD {totalSpent.toFixed(2)}</div></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><Wallet className="text-success" /><div><div className="text-xs text-muted-foreground">Balance</div><div className="text-xl font-bold">USD {(totalReceived - totalSpent).toFixed(2)}</div></div></div></Card>
        </div>

        <Card className="p-4">
          {funds.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No funds logged yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Ref</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {funds.map((f) => {
                  const opened = openFund === f.id;
                  const bal = balanceFor(f);
                  return (
                    <Fragment key={f.id}>
                      <TableRow className="cursor-pointer" onClick={() => setOpenFund(opened ? null : f.id)}>
                        <TableCell>{opened ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</TableCell>
                        <TableCell className="font-medium">{f.source}</TableCell>
                        <TableCell className="text-xs">{f.reference || "—"}</TableCell>
                        <TableCell className="text-xs">{new Date(f.received_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">{f.currency} {Number(f.amount).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{spentFor(f.id).toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={bal < 0 ? "destructive" : bal === 0 ? "secondary" : "default"}>
                            {f.currency} {bal.toFixed(2)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="ghost" title="Add expense" onClick={() => setExpenseFundId(f.id)}><Plus size={14} /></Button>
                            <Button size="sm" variant="ghost" title="PDF rundown" onClick={() => downloadPdf(f)}><FileDown size={14} /></Button>
                            <Button size="sm" variant="ghost" title="SMS rundown" onClick={() => setSmsOpen(f.id)}><MessageSquare size={14} /></Button>
                            <Button size="sm" variant="ghost" title="Delete" onClick={() => deleteFund(f.id)}><Trash2 size={14} className="text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {opened && (
                        <TableRow>
                          <TableCell colSpan={8} className="bg-muted/30">
                            {f.note && <div className="text-xs italic mb-2">Note: {f.note}</div>}
                            {expensesFor(f.id).length === 0 ? (
                              <div className="text-xs text-muted-foreground py-2">No expenses yet. Click + to add.</div>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Category</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead></TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {expensesFor(f.id).map((e) => (
                                    <TableRow key={e.id}>
                                      <TableCell className="text-xs">{new Date(e.spent_at).toLocaleDateString()}</TableCell>
                                      <TableCell className="text-xs">{e.description}</TableCell>
                                      <TableCell className="text-xs">{e.category || "—"}</TableCell>
                                      <TableCell className="text-right text-xs">{f.currency} {Number(e.amount).toFixed(2)}</TableCell>
                                      <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => deleteExpense(e.id)}><Trash2 size={12} className="text-destructive" /></Button></TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      {/* New fund dialog */}
      <Dialog open={newFundOpen} onOpenChange={setNewFundOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log Received Money</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Source *</Label><Input value={fSource} onChange={(e) => setFSource(e.target.value)} placeholder="e.g. Donor, Parent contribution, Grant" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount *</Label><Input type="number" value={fAmount} onChange={(e) => setFAmount(e.target.value)} /></div>
              <div><Label>Currency</Label><Input value={fCurrency} onChange={(e) => setFCurrency(e.target.value)} /></div>
            </div>
            <div><Label>Reference</Label><Input value={fRef} onChange={(e) => setFRef(e.target.value)} placeholder="Receipt / txn ID" /></div>
            <div><Label>Note</Label><Textarea value={fNote} onChange={(e) => setFNote(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter><Button onClick={saveFund}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Expense dialog */}
      <Dialog open={!!expenseFundId} onOpenChange={(v) => !v && setExpenseFundId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Description *</Label><Input value={eDesc} onChange={(e) => setEDesc(e.target.value)} placeholder="What was the money used for?" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount *</Label><Input type="number" value={eAmt} onChange={(e) => setEAmt(e.target.value)} /></div>
              <div><Label>Category</Label><Input value={eCat} onChange={(e) => setECat(e.target.value)} placeholder="Food, Transport…" /></div>
            </div>
          </div>
          <DialogFooter><Button onClick={saveExpense}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SMS dialog */}
      <Dialog open={!!smsOpen} onOpenChange={(v) => !v && setSmsOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send Rundown via SMS</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Phone (e.g. 0772123456 or +263772123456)</Label>
            <Input value={smsPhone} onChange={(e) => setSmsPhone(e.target.value)} />
          </div>
          <DialogFooter>
            <Button disabled={sending} onClick={() => {
              const f = funds.find((x) => x.id === smsOpen);
              if (f) sendSms(f);
            }}>{sending ? "Sending…" : "Send"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdminFundTracker;
