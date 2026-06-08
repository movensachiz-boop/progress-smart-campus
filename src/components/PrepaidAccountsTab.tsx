import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Wallet, PackageCheck, ArrowLeft, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { generatePrepaidReport } from "@/lib/generatePrepaidReport";

interface PrepaidAccount {
  id: string;
  supplier_name: string;
  item_name: string;
  unit: string | null;
  default_unit_price: number;
  currency: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

interface PrepaidEntry {
  id: string;
  account_id: string;
  entry_type: "deposit" | "delivery";
  amount: number;
  quantity: number;
  unit_price: number;
  note: string | null;
  occurred_on: string;
  created_at: string;
}

export default function PrepaidAccountsTab() {
  const [accounts, setAccounts] = useState<PrepaidAccount[]>([]);
  const [entries, setEntries] = useState<PrepaidEntry[]>([]);
  const [selected, setSelected] = useState<PrepaidAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [openNew, setOpenNew] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const [a, e] = await Promise.all([
      supabase.from("prepaid_accounts" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("prepaid_entries" as any).select("*").order("occurred_on", { ascending: false }),
    ]);
    if (!a.error) setAccounts((a.data || []) as any);
    if (!e.error) setEntries((e.data || []) as any);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const summaries = useMemo(() => {
    const map: Record<string, { deposits: number; deliveriesValue: number; deliveredQty: number; lastDate?: string }> = {};
    for (const a of accounts) map[a.id] = { deposits: 0, deliveriesValue: 0, deliveredQty: 0 };
    for (const e of entries) {
      const s = map[e.account_id];
      if (!s) continue;
      if (e.entry_type === "deposit") s.deposits += Number(e.amount) || 0;
      else {
        s.deliveriesValue += (Number(e.quantity) || 0) * (Number(e.unit_price) || 0);
        s.deliveredQty += Number(e.quantity) || 0;
      }
      if (!s.lastDate || e.occurred_on > s.lastDate) s.lastDate = e.occurred_on;
    }
    return map;
  }, [accounts, entries]);

  if (selected) {
    return (
      <AccountDetail
        account={selected}
        entries={entries.filter((e) => e.account_id === selected.id)}
        onBack={() => setSelected(null)}
        onChange={fetchAll}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Prepaid Supplier Accounts</CardTitle>
            <CardDescription>
              Track upfront payments to suppliers (e.g. bread) and reconcile against goods delivered.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => {
              const rows = accounts.map(a => {
                const s = summaries[a.id] || { deposits: 0, deliveriesValue: 0, deliveredQty: 0 };
                const acctEntries = entries
                  .filter(e => e.account_id === a.id)
                  .map(e => ({
                    date: e.occurred_on,
                    type: e.entry_type,
                    amount: Number(e.amount) || 0,
                    quantity: Number(e.quantity) || 0,
                    unitPrice: Number(e.unit_price) || 0,
                    note: e.note,
                  }));
                return {
                  supplier: a.supplier_name,
                  item: a.item_name,
                  unit: a.unit,
                  currency: a.currency,
                  unitPrice: Number(a.default_unit_price) || 0,
                  totalPaid: s.deposits,
                  deliveredQty: s.deliveredQty,
                  deliveredValue: s.deliveriesValue,
                  balance: s.deposits - s.deliveriesValue,
                  entries: acctEntries,
                  notes: a.notes,
                };
              });
              if (rows.length === 0) { toast({ title: "No accounts to report" }); return; }
              generatePrepaidReport(rows);
            }}>
              <FileDown size={16} className="mr-1" /> PDF Report
            </Button>
            <Dialog open={openNew} onOpenChange={setOpenNew}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus size={16} className="mr-1" /> New Account</Button>
              </DialogTrigger>
              <NewAccountDialog onSaved={() => { setOpenNew(false); fetchAll(); }} />
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No prepaid accounts yet. Create one to start tracking.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total Paid</TableHead>
                    <TableHead className="text-right">Delivered (qty)</TableHead>
                    <TableHead className="text-right">Delivered Value</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((a) => {
                    const s = summaries[a.id] || { deposits: 0, deliveriesValue: 0, deliveredQty: 0 };
                    const balance = s.deposits - s.deliveriesValue;
                    const owedGoodsQty = a.default_unit_price > 0 ? balance / a.default_unit_price : 0;
                    return (
                      <TableRow key={a.id} className="cursor-pointer" onClick={() => setSelected(a)}>
                        <TableCell className="font-medium">{a.supplier_name}</TableCell>
                        <TableCell>
                          {a.item_name}
                          {a.unit ? <span className="text-muted-foreground"> / {a.unit}</span> : null}
                        </TableCell>
                        <TableCell className="text-right">{a.currency} {Number(a.default_unit_price).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{a.currency} {s.deposits.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{s.deliveredQty}</TableCell>
                        <TableCell className="text-right">{a.currency} {s.deliveriesValue.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          {balance > 0.001 ? (
                            <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
                              Supplier owes {a.currency} {balance.toFixed(2)}
                              {owedGoodsQty > 0 ? ` (~${owedGoodsQty.toFixed(1)} ${a.unit || "units"})` : ""}
                            </Badge>
                          ) : balance < -0.001 ? (
                            <Badge variant="destructive">We owe {a.currency} {Math.abs(balance).toFixed(2)}</Badge>
                          ) : (
                            <Badge variant="secondary">Settled</Badge>
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="ghost" onClick={() => setSelected(a)}>Open</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NewAccountDialog({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({
    supplier_name: "",
    item_name: "",
    unit: "loaves",
    default_unit_price: "",
    currency: "USD",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.supplier_name.trim() || !form.item_name.trim()) {
      toast({ title: "Supplier and item are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("prepaid_accounts" as any).insert({
      supplier_name: form.supplier_name.trim(),
      item_name: form.item_name.trim(),
      unit: form.unit.trim() || null,
      default_unit_price: Number(form.default_unit_price) || 0,
      currency: form.currency || "USD",
      notes: form.notes.trim() || null,
    });
    setSaving(false);
    if (error) { toast({ title: "Failed to create", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Account created" });
    onSaved();
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New Prepaid Account</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Supplier name</Label>
          <Input value={form.supplier_name} onChange={(e) => setForm({ ...form, supplier_name: e.target.value })} placeholder="e.g. Lobels Bread" />
        </div>
        <div>
          <Label>Item</Label>
          <Input value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} placeholder="e.g. Bread" />
        </div>
        <div>
          <Label>Unit</Label>
          <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="loaves, crates..." />
        </div>
        <div>
          <Label>Default unit price</Label>
          <Input type="number" step="0.01" value={form.default_unit_price} onChange={(e) => setForm({ ...form, default_unit_price: e.target.value })} />
        </div>
        <div>
          <Label>Currency</Label>
          <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="ZWG">ZWG</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Create"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function AccountDetail({
  account, entries, onBack, onChange,
}: {
  account: PrepaidAccount;
  entries: PrepaidEntry[];
  onBack: () => void;
  onChange: () => void;
}) {
  const [openDeposit, setOpenDeposit] = useState(false);
  const [openDelivery, setOpenDelivery] = useState(false);

  const totalPaid = entries.filter(e => e.entry_type === "deposit").reduce((s, e) => s + Number(e.amount), 0);
  const deliveredQty = entries.filter(e => e.entry_type === "delivery").reduce((s, e) => s + Number(e.quantity), 0);
  const deliveredValue = entries.filter(e => e.entry_type === "delivery").reduce((s, e) => s + Number(e.quantity) * Number(e.unit_price), 0);
  const balance = totalPaid - deliveredValue;
  const owedQty = account.default_unit_price > 0 ? balance / account.default_unit_price : 0;

  const removeEntry = async (id: string) => {
    if (!confirm("Delete this entry?")) return;
    const { error } = await supabase.from("prepaid_entries" as any).delete().eq("id", id);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    onChange();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft size={16} className="mr-1" /> Back</Button>
        <div className="flex gap-2">
          <Dialog open={openDeposit} onOpenChange={setOpenDeposit}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Wallet size={16} className="mr-1" /> Record Payment</Button>
            </DialogTrigger>
            <EntryDialog account={account} type="deposit" onSaved={() => { setOpenDeposit(false); onChange(); }} />
          </Dialog>
          <Dialog open={openDelivery} onOpenChange={setOpenDelivery}>
            <DialogTrigger asChild>
              <Button size="sm"><PackageCheck size={16} className="mr-1" /> Record Delivery</Button>
            </DialogTrigger>
            <EntryDialog account={account} type="delivery" onSaved={() => { setOpenDelivery(false); onChange(); }} />
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{account.supplier_name} — {account.item_name}</CardTitle>
          <CardDescription>
            Default price: {account.currency} {Number(account.default_unit_price).toFixed(2)}{account.unit ? ` per ${account.unit}` : ""}
            {account.notes ? ` • ${account.notes}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Summary label="Total Paid" value={`${account.currency} ${totalPaid.toFixed(2)}`} />
          <Summary label="Delivered Qty" value={`${deliveredQty} ${account.unit || ""}`.trim()} />
          <Summary label="Delivered Value" value={`${account.currency} ${deliveredValue.toFixed(2)}`} />
          <Summary
            label="Balance"
            value={
              balance > 0.001
                ? `Supplier owes ${account.currency} ${balance.toFixed(2)}${owedQty > 0 ? ` (~${owedQty.toFixed(1)} ${account.unit || "units"})` : ""}`
                : balance < -0.001
                  ? `We owe ${account.currency} ${Math.abs(balance).toFixed(2)}`
                  : "Settled"
            }
            tone={balance > 0.001 ? "warn" : balance < -0.001 ? "bad" : "ok"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Ledger</CardTitle></CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount Paid</TableHead>
                    <TableHead className="text-right">Qty Received</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => {
                    const value = e.entry_type === "delivery" ? Number(e.quantity) * Number(e.unit_price) : Number(e.amount);
                    return (
                      <TableRow key={e.id}>
                        <TableCell>{e.occurred_on}</TableCell>
                        <TableCell>
                          {e.entry_type === "deposit" ? (
                            <Badge variant="outline">Payment</Badge>
                          ) : (
                            <Badge className="bg-blue-100 text-blue-900 hover:bg-blue-100">Delivery</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{e.entry_type === "deposit" ? `${account.currency} ${Number(e.amount).toFixed(2)}` : "—"}</TableCell>
                        <TableCell className="text-right">{e.entry_type === "delivery" ? e.quantity : "—"}</TableCell>
                        <TableCell className="text-right">{e.entry_type === "delivery" ? `${account.currency} ${Number(e.unit_price).toFixed(2)}` : "—"}</TableCell>
                        <TableCell className="text-right">{account.currency} {value.toFixed(2)}</TableCell>
                        <TableCell className="text-muted-foreground">{e.note || ""}</TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => removeEntry(e.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  const toneCls =
    tone === "warn" ? "border-amber-300 bg-amber-50 text-amber-900"
    : tone === "bad" ? "border-red-300 bg-red-50 text-red-900"
    : "bg-muted/30";
  return (
    <div className={`rounded-md border p-3 ${toneCls}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-sm font-semibold mt-1">{value}</div>
    </div>
  );
}

function EntryDialog({
  account, type, onSaved,
}: {
  account: PrepaidAccount;
  type: "deposit" | "delivery";
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    amount: "",
    quantity: "",
    unit_price: String(account.default_unit_price || ""),
    note: "",
    occurred_on: today,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const payload: any = {
      account_id: account.id,
      entry_type: type,
      occurred_on: form.occurred_on,
      note: form.note.trim() || null,
      amount: type === "deposit" ? Number(form.amount) || 0 : 0,
      quantity: type === "delivery" ? Number(form.quantity) || 0 : 0,
      unit_price: type === "delivery" ? (Number(form.unit_price) || 0) : 0,
    };
    const { error } = await supabase.from("prepaid_entries" as any).insert(payload);
    setSaving(false);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: type === "deposit" ? "Payment recorded" : "Delivery recorded" });
    onSaved();
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{type === "deposit" ? "Record Payment to Supplier" : "Record Goods Received"}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Date</Label>
          <Input type="date" value={form.occurred_on} onChange={(e) => setForm({ ...form, occurred_on: e.target.value })} />
        </div>
        {type === "deposit" ? (
          <div>
            <Label>Amount paid ({account.currency})</Label>
            <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} autoFocus />
          </div>
        ) : (
          <>
            <div>
              <Label>Quantity received {account.unit ? `(${account.unit})` : ""}</Label>
              <Input type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} autoFocus />
            </div>
            <div className="col-span-2">
              <Label>Unit price at delivery ({account.currency})</Label>
              <Input type="number" step="0.01" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />
              <p className="text-xs text-muted-foreground mt-1">
                Value of this delivery: {account.currency} {((Number(form.quantity) || 0) * (Number(form.unit_price) || 0)).toFixed(2)}
              </p>
            </div>
          </>
        )}
        <div className="col-span-2">
          <Label>Note (optional)</Label>
          <Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
