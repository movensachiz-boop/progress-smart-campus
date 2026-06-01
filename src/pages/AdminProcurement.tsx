import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, FileDown, CheckCircle2, FileText, Truck, Package, ShoppingCart, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { generateProcurementDoc, ProcurementLineItem } from "@/lib/generateProcurementDoc";

type Item = ProcurementLineItem;

interface Supplier {
  id: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  is_active: boolean;
}
interface Requisition {
  id: string;
  requisition_number: string;
  requested_by: string;
  department?: string;
  purpose?: string;
  items: Item[];
  total_amount: number;
  currency: string;
  status: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
}
interface PurchaseOrder {
  id: string;
  po_number: string;
  requisition_id?: string;
  supplier_id?: string;
  supplier_name?: string;
  items: Item[];
  total_amount: number;
  currency: string;
  status: string;
  expected_delivery?: string;
  notes?: string;
  created_at: string;
}
interface GRN {
  id: string;
  grn_number: string;
  purchase_order_id?: string;
  supplier_name?: string;
  items: Item[];
  received_by?: string;
  received_date: string;
  notes?: string;
  created_at: string;
  total_amount?: number;
  currency?: string;
  receipt_urls?: string[];
}

const emptyItem = (): Item => ({ description: "", quantity: 1, unit_price: 0, unit: "pcs" });

const sumItems = (items: Item[]) =>
  items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);

function ItemsEditor({
  items,
  setItems,
  showCost = true,
  currency = "USD",
}: {
  items: Item[];
  setItems: (i: Item[]) => void;
  showCost?: boolean;
  currency?: string;
}) {
  const update = (idx: number, patch: Partial<Item>) => {
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const total = sumItems(items);
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-20">Qty</TableHead>
              <TableHead className="w-20">Unit</TableHead>
              {showCost && <TableHead className="w-28">Unit Price</TableHead>}
              {showCost && <TableHead className="w-28 text-right">Total</TableHead>}
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it, idx) => (
              <TableRow key={idx}>
                <TableCell>{idx + 1}</TableCell>
                <TableCell>
                  <Input
                    value={it.description}
                    onChange={(e) => update(idx, { description: e.target.value })}
                    placeholder="Item description"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min="0"
                    value={it.quantity}
                    onChange={(e) => update(idx, { quantity: Number(e.target.value) })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={it.unit || ""}
                    onChange={(e) => update(idx, { unit: e.target.value })}
                    placeholder="pcs"
                  />
                </TableCell>
                {showCost && (
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={it.unit_price}
                      onChange={(e) => update(idx, { unit_price: Number(e.target.value) })}
                    />
                  </TableCell>
                )}
                {showCost && (
                  <TableCell className="text-right font-medium">
                    {currency} {((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)).toFixed(2)}
                  </TableCell>
                )}
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setItems(items.filter((_, i) => i !== idx))}
                    disabled={items.length <= 1}
                  >
                    <Trash2 size={16} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => setItems([...items, emptyItem()])}>
          <Plus size={14} /> Add Item
        </Button>
        {showCost && (
          <div className="text-lg font-bold text-primary">
            Grand Total: {currency} {total.toFixed(2)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminProcurement() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") || "requisitions");
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t) setTab(t);
  }, [searchParams]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [pos, setPOs] = useState<PurchaseOrder[]>([]);
  const [grns, setGRNs] = useState<GRN[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const [s, r, p, g] = await Promise.all([
      supabase.from("suppliers").select("*").order("name"),
      supabase.from("requisitions").select("*").order("created_at", { ascending: false }),
      supabase.from("purchase_orders").select("*").order("created_at", { ascending: false }),
      supabase.from("goods_received").select("*").order("created_at", { ascending: false }),
    ]);
    if (s.data) setSuppliers(s.data as any);
    if (r.data) setRequisitions(r.data as any);
    if (p.data) setPOs(p.data as any);
    if (g.data) setGRNs(g.data as any);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  // Stats
  const stats = useMemo(() => {
    const pendingReqs = requisitions.filter((r) => r.status === "pending").length;
    const reqValue = requisitions.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    const poValue = pos.reduce((s, p) => s + Number(p.total_amount || 0), 0);
    return { pendingReqs, reqValue, poValue, suppliers: suppliers.length };
  }, [requisitions, pos, suppliers]);

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Procurement</h1>
          <p className="text-sm text-muted-foreground">
            Process pre-requisitions, issue purchase orders, manage suppliers, and record goods received.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatBox icon={<FileText size={18} />} label="Pending Requisitions" value={stats.pendingReqs} />
          <StatBox icon={<ShoppingCart size={18} />} label="Total Requisition Value" value={`USD ${stats.reqValue.toFixed(2)}`} />
          <StatBox icon={<Truck size={18} />} label="Total PO Value" value={`USD ${stats.poValue.toFixed(2)}`} />
          <StatBox icon={<Package size={18} />} label="Suppliers" value={stats.suppliers} />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-4 w-full md:w-auto">
            <TabsTrigger value="requisitions">Requisitions</TabsTrigger>
            <TabsTrigger value="pos">Purchase Orders</TabsTrigger>
            <TabsTrigger value="grn">Goods Received</TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          </TabsList>

          <TabsContent value="requisitions" className="mt-4">
            <RequisitionsTab data={requisitions} onChange={fetchAll} />
          </TabsContent>
          <TabsContent value="pos" className="mt-4">
            <POsTab data={pos} requisitions={requisitions} suppliers={suppliers} onChange={fetchAll} />
          </TabsContent>
          <TabsContent value="grn" className="mt-4">
            <GRNTab data={grns} pos={pos} onChange={fetchAll} />
          </TabsContent>
          <TabsContent value="suppliers" className="mt-4">
            <SuppliersTab data={suppliers} onChange={fetchAll} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function StatBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: any }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">{icon}</div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-bold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ──────── Requisitions ──────── */
function RequisitionsTab({ data, onChange }: { data: Requisition[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Requisition | null>(null);
  const [form, setForm] = useState({
    requested_by: "",
    department: "",
    purpose: "",
    currency: "USD",
    notes: "",
  });
  const [items, setItems] = useState<Item[]>([emptyItem()]);

  const reset = () => {
    setEditing(null);
    setForm({ requested_by: "", department: "", purpose: "", currency: "USD", notes: "" });
    setItems([emptyItem()]);
  };

  const openEdit = (r: Requisition) => {
    setEditing(r);
    setForm({
      requested_by: r.requested_by || "",
      department: r.department || "",
      purpose: r.purpose || "",
      currency: r.currency || "USD",
      notes: r.notes || "",
    });
    setItems((r.items && r.items.length ? r.items : [emptyItem()]) as Item[]);
    setOpen(true);
  };

  const submit = async () => {
    if (!form.requested_by.trim()) {
      toast({ title: "Requested by is required", variant: "destructive" });
      return;
    }
    if (items.some((i) => !i.description.trim())) {
      toast({ title: "All items need a description", variant: "destructive" });
      return;
    }
    const total = sumItems(items);
    const payload = {
      requested_by: form.requested_by,
      department: form.department || null,
      purpose: form.purpose || null,
      items: items as any,
      total_amount: total,
      currency: form.currency,
      notes: form.notes || null,
    };
    if (editing) {
      const { error } = await supabase
        .from("requisitions")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", editing.id);
      if (error) {
        toast({ title: "Failed", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Requisition updated" });
    } else {
      const { error } = await supabase.from("requisitions").insert({ ...payload, status: "pending" });
      if (error) {
        toast({ title: "Failed", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Requisition created" });
    }
    setOpen(false);
    reset();
    onChange();
  };

  const approve = async (r: Requisition) => {
    const { error } = await supabase
      .from("requisitions")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", r.id);
    if (error) return toast({ title: error.message, variant: "destructive" });
    toast({ title: "Requisition approved" });
    onChange();
  };

  const reject = async (r: Requisition) => {
    const { error } = await supabase.from("requisitions").update({ status: "rejected" }).eq("id", r.id);
    if (error) return toast({ title: error.message, variant: "destructive" });
    onChange();
  };

  const remove = async (r: Requisition) => {
    if (!confirm(`Delete ${r.requisition_number}?`)) return;
    const { error } = await supabase.from("requisitions").delete().eq("id", r.id);
    if (error) return toast({ title: error.message, variant: "destructive" });
    onChange();
  };

  const downloadPDF = (r: Requisition) =>
    generateProcurementDoc({
      docType: "REQUISITION",
      number: r.requisition_number,
      date: new Date(r.created_at).toLocaleDateString(),
      currency: r.currency,
      requestedBy: r.requested_by,
      department: r.department,
      purpose: r.purpose,
      items: r.items || [],
      notes: r.notes,
    });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Pre-Requisitions</CardTitle>
          <CardDescription>Submit requests for procurement with auto-calculated totals</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
          <DialogTrigger asChild>
            <Button onClick={() => reset()}><Plus size={16} /> New Requisition</Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? `Edit ${editing.requisition_number}` : "New Pre-Requisition"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Requested By *</Label>
                  <Input value={form.requested_by} onChange={(e) => setForm({ ...form, requested_by: e.target.value })} />
                </div>
                <div>
                  <Label>Department</Label>
                  <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. Science Lab" />
                </div>
              </div>
              <div>
                <Label>Purpose</Label>
                <Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="What is this for?" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Currency</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="ZWL">ZWL</SelectItem>
                      <SelectItem value="ZAR">ZAR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Items</Label>
                <ItemsEditor items={items} setItems={setItems} currency={form.currency} />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit}>{editing ? "Save Changes" : "Create Requisition"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Requested By</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No requisitions yet</TableCell></TableRow>
              )}
              {data.map((r) => {
                const edited = r.updated_at && new Date(r.updated_at).getTime() - new Date(r.created_at).getTime() > 2000;
                return (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <span>{r.requisition_number}</span>
                      {edited && (
                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5" title={`Edited ${new Date(r.updated_at!).toLocaleString()}`}>
                          Edited
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>{r.requested_by}</TableCell>
                  <TableCell>{r.department || "—"}</TableCell>
                  <TableCell>{(r.items || []).length}</TableCell>
                  <TableCell className="text-right font-semibold">{r.currency} {Number(r.total_amount).toFixed(2)}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {r.status === "pending" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => approve(r)}><CheckCircle2 size={14} /></Button>
                          <Button size="sm" variant="outline" onClick={() => reject(r)}>Reject</Button>
                        </>
                      )}
                      <Button size="sm" variant="outline" onClick={() => openEdit(r)}><Pencil size={14} /></Button>
                      <Button size="sm" variant="outline" onClick={() => downloadPDF(r)}><FileDown size={14} /></Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(r)}><Trash2 size={14} /></Button>
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ──────── Purchase Orders ──────── */
function POsTab({
  data,
  requisitions,
  suppliers,
  onChange,
}: {
  data: PurchaseOrder[];
  requisitions: Requisition[];
  suppliers: Supplier[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reqId, setReqId] = useState<string>("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [items, setItems] = useState<Item[]>([emptyItem()]);
  const [form, setForm] = useState({ currency: "USD", expected_delivery: "", notes: "" });

  const approvedReqs = requisitions.filter((r) => r.status === "approved");

  const onPickReq = (id: string) => {
    setReqId(id);
    const r = requisitions.find((x) => x.id === id);
    if (r) {
      setItems(r.items?.length ? r.items : [emptyItem()]);
      setForm((f) => ({ ...f, currency: r.currency }));
    }
  };

  const submit = async () => {
    if (!supplierId) return toast({ title: "Choose a supplier", variant: "destructive" });
    const supplier = suppliers.find((s) => s.id === supplierId);
    const total = sumItems(items);
    const { error } = await supabase.from("purchase_orders").insert({
      requisition_id: reqId || null,
      supplier_id: supplierId,
      supplier_name: supplier?.name,
      items: items as any,
      total_amount: total,
      currency: form.currency,
      expected_delivery: form.expected_delivery || null,
      notes: form.notes || null,
      status: "issued",
    });
    if (error) return toast({ title: error.message, variant: "destructive" });
    if (reqId) {
      await supabase.from("requisitions").update({ status: "ordered" }).eq("id", reqId);
    }
    toast({ title: "Purchase order created" });
    setOpen(false);
    setReqId(""); setSupplierId(""); setItems([emptyItem()]);
    setForm({ currency: "USD", expected_delivery: "", notes: "" });
    onChange();
  };

  const downloadPDF = (p: PurchaseOrder) =>
    generateProcurementDoc({
      docType: "PURCHASE ORDER",
      number: p.po_number,
      date: new Date(p.created_at).toLocaleDateString(),
      currency: p.currency,
      supplierName: p.supplier_name,
      expectedDelivery: p.expected_delivery,
      items: p.items || [],
      notes: p.notes,
    });

  const setStatus = async (p: PurchaseOrder, status: string) => {
    const { error } = await supabase.from("purchase_orders").update({ status }).eq("id", p.id);
    if (error) return toast({ title: error.message, variant: "destructive" });
    onChange();
  };

  const remove = async (p: PurchaseOrder) => {
    if (!confirm(`Delete ${p.po_number}?`)) return;
    await supabase.from("purchase_orders").delete().eq("id", p.id);
    onChange();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Purchase Orders</CardTitle>
          <CardDescription>Issue POs to suppliers from approved requisitions</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus size={16} /> New PO</Button></DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Create Purchase Order</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>From Requisition (optional)</Label>
                  <Select value={reqId} onValueChange={onPickReq}>
                    <SelectTrigger><SelectValue placeholder="Select approved requisition" /></SelectTrigger>
                    <SelectContent>
                      {approvedReqs.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No approved requisitions</div>}
                      {approvedReqs.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.requisition_number} — {r.requested_by}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Supplier *</Label>
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger><SelectValue placeholder="Choose supplier" /></SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Currency</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="ZWL">ZWL</SelectItem>
                      <SelectItem value="ZAR">ZAR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Expected Delivery</Label>
                  <Input type="date" value={form.expected_delivery} onChange={(e) => setForm({ ...form, expected_delivery: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Items</Label>
                <ItemsEditor items={items} setItems={setItems} currency={form.currency} />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit}>Issue PO</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No purchase orders</TableCell></TableRow>
              )}
              {data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.po_number}</TableCell>
                  <TableCell>{new Date(p.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>{p.supplier_name || "—"}</TableCell>
                  <TableCell>{(p.items || []).length}</TableCell>
                  <TableCell className="text-right font-semibold">{p.currency} {Number(p.total_amount).toFixed(2)}</TableCell>
                  <TableCell>{p.expected_delivery || "—"}</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {p.status !== "completed" && (
                        <Button size="sm" variant="outline" onClick={() => setStatus(p, "completed")}>Mark Complete</Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => downloadPDF(p)}><FileDown size={14} /></Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(p)}><Trash2 size={14} /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ──────── GRN ──────── */
function GRNTab({ data, pos, onChange }: { data: GRN[]; pos: PurchaseOrder[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [poId, setPoId] = useState("");
  const [items, setItems] = useState<Item[]>([emptyItem()]);
  const [currency, setCurrency] = useState("USD");
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ received_by: "", received_date: new Date().toISOString().slice(0, 10), notes: "", supplier_name: "" });

  const onPickPO = (id: string) => {
    setPoId(id);
    const p = pos.find((x) => x.id === id);
    if (p) {
      setItems(p.items?.length ? p.items : [emptyItem()]);
      setCurrency(p.currency || "USD");
      setForm((f) => ({ ...f, supplier_name: p.supplier_name || "" }));
    }
  };

  const submit = async () => {
    if (items.some((i) => !i.description.trim())) {
      toast({ title: "All items need a description", variant: "destructive" });
      return;
    }
    setUploading(true);
    const po = pos.find((x) => x.id === poId);
    const total = sumItems(items);

    // Upload receipts first
    const receipt_urls: string[] = [];
    for (const file of receiptFiles) {
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("grn-receipts").upload(path, file);
      if (upErr) {
        toast({ title: "Receipt upload failed", description: upErr.message, variant: "destructive" });
        setUploading(false);
        return;
      }
      receipt_urls.push(path);
    }

    const { error } = await supabase.from("goods_received").insert({
      purchase_order_id: poId || null,
      supplier_name: po?.supplier_name || form.supplier_name || null,
      items: items as any,
      received_by: form.received_by || null,
      received_date: form.received_date,
      notes: form.notes || null,
      total_amount: total,
      currency,
      receipt_urls,
    });
    setUploading(false);
    if (error) return toast({ title: error.message, variant: "destructive" });
    if (poId) await supabase.from("purchase_orders").update({ status: "received" }).eq("id", poId);
    toast({ title: "Goods received recorded" });
    setOpen(false);
    setPoId(""); setItems([emptyItem()]); setReceiptFiles([]); setCurrency("USD");
    setForm({ received_by: "", received_date: new Date().toISOString().slice(0, 10), notes: "", supplier_name: "" });
    onChange();
  };

  const downloadPDF = (g: GRN) => {
    const po = pos.find((p) => p.id === g.purchase_order_id);
    return generateProcurementDoc({
      docType: "GOODS RECEIVED NOTE",
      number: g.grn_number,
      date: new Date(g.received_date).toLocaleDateString(),
      currency: g.currency || "USD",
      supplierName: g.supplier_name,
      receivedBy: g.received_by,
      poNumber: po?.po_number,
      items: g.items || [],
      notes: g.notes,
    });
  };

  const viewReceipt = async (path: string) => {
    const { data: signed } = await supabase.storage.from("grn-receipts").createSignedUrl(path, 300);
    if (signed?.signedUrl) window.open(signed.signedUrl, "_blank");
  };

  const remove = async (g: GRN) => {
    if (!confirm(`Delete ${g.grn_number}?`)) return;
    if (g.receipt_urls?.length) {
      await supabase.storage.from("grn-receipts").remove(g.receipt_urls);
    }
    await supabase.from("goods_received").delete().eq("id", g.id);
    onChange();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Goods Received Notes</CardTitle>
          <CardDescription>Record deliveries with pricing and upload receipt evidence</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus size={16} /> New GRN</Button></DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Record Goods Received</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Purchase Order (optional)</Label>
                <Select value={poId} onValueChange={onPickPO}>
                  <SelectTrigger><SelectValue placeholder="Select PO" /></SelectTrigger>
                  <SelectContent>
                    {pos.map((p) => <SelectItem key={p.id} value={p.id}>{p.po_number} — {p.supplier_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {!poId && (
                <div>
                  <Label>Supplier Name</Label>
                  <Input value={form.supplier_name} onChange={(e) => setForm({ ...form, supplier_name: e.target.value })} />
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Received By</Label>
                  <Input value={form.received_by} onChange={(e) => setForm({ ...form, received_by: e.target.value })} />
                </div>
                <div>
                  <Label>Date Received</Label>
                  <Input type="date" value={form.received_date} onChange={(e) => setForm({ ...form, received_date: e.target.value })} />
                </div>
                <div>
                  <Label>Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="ZWL">ZWL</SelectItem>
                      <SelectItem value="ZAR">ZAR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Items Received (with prices)</Label>
                <ItemsEditor items={items} setItems={setItems} showCost={true} currency={currency} />
              </div>
              <div>
                <Label>Upload Receipts / Invoices (evidence)</Label>
                <Input
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  onChange={(e) => setReceiptFiles(Array.from(e.target.files || []))}
                />
                {receiptFiles.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {receiptFiles.length} file(s) selected: {receiptFiles.map((f) => f.name).join(", ")}
                  </div>
                )}
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={uploading}>Cancel</Button>
              <Button onClick={submit} disabled={uploading}>{uploading ? "Saving..." : "Save GRN"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>GRN #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Received By</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Receipts</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No goods received yet</TableCell></TableRow>
              )}
              {data.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-mono text-xs">{g.grn_number}</TableCell>
                  <TableCell>{new Date(g.received_date).toLocaleDateString()}</TableCell>
                  <TableCell>{g.supplier_name || "—"}</TableCell>
                  <TableCell>{g.received_by || "—"}</TableCell>
                  <TableCell>{(g.items || []).length}</TableCell>
                  <TableCell className="text-right font-medium">
                    {g.currency || "USD"} {Number(g.total_amount || 0).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {g.receipt_urls?.length ? (
                      <div className="flex gap-1 flex-wrap">
                        {g.receipt_urls.map((u, i) => (
                          <Button key={i} size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => viewReceipt(u)}>
                            #{i + 1}
                          </Button>
                        ))}
                      </div>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => downloadPDF(g)}><FileDown size={14} /></Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(g)}><Trash2 size={14} /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ──────── Suppliers ──────── */
function SuppliersTab({ data, onChange }: { data: Supplier[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: "", contact_person: "", phone: "", email: "", address: "", notes: "" });

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", contact_person: "", phone: "", email: "", address: "", notes: "" });
    setOpen(true);
  };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({
      name: s.name, contact_person: s.contact_person || "", phone: s.phone || "",
      email: s.email || "", address: s.address || "", notes: s.notes || "",
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) return toast({ title: "Name required", variant: "destructive" });
    const payload = { ...form };
    if (editing) {
      const { error } = await supabase.from("suppliers").update(payload).eq("id", editing.id);
      if (error) return toast({ title: error.message, variant: "destructive" });
    } else {
      const { error } = await supabase.from("suppliers").insert(payload);
      if (error) return toast({ title: error.message, variant: "destructive" });
    }
    toast({ title: editing ? "Supplier updated" : "Supplier added" });
    setOpen(false);
    onChange();
  };

  const remove = async (s: Supplier) => {
    if (!confirm(`Delete ${s.name}?`)) return;
    await supabase.from("suppliers").delete().eq("id", s.id);
    onChange();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Suppliers</CardTitle>
          <CardDescription>Vendors and their contact details</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew}><Plus size={16} /> New Supplier</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit Supplier" : "New Supplier"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Contact Person</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
                <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              </div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit}>{editing ? "Save" : "Add"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No suppliers yet</TableCell></TableRow>
              )}
              {data.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.contact_person || "—"}</TableCell>
                  <TableCell>{s.phone || "—"}</TableCell>
                  <TableCell>{s.email || "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => openEdit(s)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(s)}><Trash2 size={14} /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    ordered: "bg-blue-100 text-blue-800",
    issued: "bg-blue-100 text-blue-800",
    received: "bg-purple-100 text-purple-800",
    completed: "bg-green-100 text-green-800",
  };
  return <Badge className={map[status] || "bg-gray-100 text-gray-800"} variant="secondary">{status}</Badge>;
}
