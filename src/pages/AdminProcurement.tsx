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
import { Plus, Trash2, FileDown, CheckCircle2, FileText, Truck, Package, ShoppingCart, Pencil, Receipt, Camera, Loader2, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { generateProcurementDoc, ProcurementLineItem } from "@/lib/generateProcurementDoc";
import CameraCaptureDialog from "@/components/CameraCaptureDialog";
import PhoneCameraPairDialog from "@/components/PhoneCameraPairDialog";
import { Smartphone } from "lucide-react";
import PrepaidAccountsTab from "@/components/PrepaidAccountsTab";

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
  image_url?: string | null;
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
interface PaymentVoucher {
  id: string;
  voucher_number: string;
  purchase_order_id?: string;
  supplier_name?: string;
  paid_to: string;
  paid_by: string;
  received_by: string;
  amount: number;
  currency: string;
  method: string;
  payment_date: string;
  notes?: string;
  created_at: string;
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
  const [vouchers, setVouchers] = useState<PaymentVoucher[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const [s, r, p, g, v] = await Promise.all([
      supabase.from("suppliers").select("*").order("name"),
      supabase.from("requisitions").select("*").order("created_at", { ascending: false }),
      supabase.from("purchase_orders").select("*").order("created_at", { ascending: false }),
      supabase.from("goods_received").select("*").order("created_at", { ascending: false }),
      supabase.from("payment_vouchers").select("*").order("created_at", { ascending: false }),
    ]);
    if (s.data) setSuppliers(s.data as any);
    if (r.data) setRequisitions(r.data as any);
    if (p.data) setPOs(p.data as any);
    if (g.data) setGRNs(g.data as any);
    if (v.data) setVouchers(v.data as any);
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
          <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full md:w-auto">
            <TabsTrigger value="requisitions">Requisitions</TabsTrigger>
            <TabsTrigger value="pos">Purchase Orders</TabsTrigger>
            <TabsTrigger value="grn">Goods Received</TabsTrigger>
            <TabsTrigger value="vouchers">Payment Vouchers</TabsTrigger>
            <TabsTrigger value="prepaid">Prepaid Accounts</TabsTrigger>
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
          <TabsContent value="vouchers" className="mt-4">
            <VouchersTab data={vouchers} pos={pos} onChange={fetchAll} />
          </TabsContent>
          <TabsContent value="prepaid" className="mt-4">
            <PrepaidAccountsTab />
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
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [signedPreview, setSignedPreview] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [phonePairOpen, setPhonePairOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [viewImage, setViewImage] = useState<string | null>(null);

  const reset = () => {
    setEditing(null);
    setForm({ requested_by: "", department: "", purpose: "", currency: "USD", notes: "" });
    setItems([emptyItem()]);
    setImageUrl(null);
    setSignedPreview(null);
  };

  const signUrl = async (path: string) => {
    const { data } = await supabase.storage.from("requisition-scans").createSignedUrl(path, 3600);
    return data?.signedUrl || null;
  };

  const openEdit = async (r: Requisition) => {
    setEditing(r);
    setForm({
      requested_by: r.requested_by || "",
      department: r.department || "",
      purpose: r.purpose || "",
      currency: r.currency || "USD",
      notes: r.notes || "",
    });
    setItems((r.items && r.items.length ? r.items : [emptyItem()]) as Item[]);
    setImageUrl(r.image_url || null);
    setSignedPreview(r.image_url ? await signUrl(r.image_url) : null);
    setOpen(true);
  };

  const handleScan = async (dataUrl: string) => {
    setScanning(true);
    try {
      // Upload image to storage
      const blob = await (await fetch(dataUrl)).blob();
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error: upErr } = await supabase.storage.from("requisition-scans").upload(path, blob, { contentType: "image/jpeg" });
      if (upErr) {
        toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
        return;
      }
      setImageUrl(path);
      setSignedPreview(await signUrl(path));

      // OCR — pass storage path so function fetches image server-side (avoids large request body)
      const { data, error } = await supabase.functions.invoke("extract-requisition", {
        body: { imagePath: path },
      });
      if (error) {
        toast({ title: "OCR failed", description: error.message, variant: "destructive" });
        return;
      }
      setForm((f) => ({
        requested_by: data.requested_by || f.requested_by,
        department: data.department || f.department,
        purpose: data.purpose || f.purpose,
        currency: data.currency || f.currency,
        notes: data.notes || f.notes,
      }));
      if (Array.isArray(data.items) && data.items.length) {
        setItems(data.items.map((it: any) => ({
          description: String(it.description || ""),
          quantity: Number(it.quantity) || 1,
          unit: String(it.unit || "pcs"),
          unit_price: Number(it.unit_price) || 0,
        })));
      }
      toast({ title: "Scan complete", description: "Please verify the extracted details before saving." });
    } finally {
      setScanning(false);
    }
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
      image_url: imageUrl,
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
              <div className="rounded-md border border-dashed p-3 flex items-center justify-between gap-3 bg-muted/30">
                <div className="text-sm">
                  <div className="font-medium flex items-center gap-2"><Camera size={14} /> Scan paper requisition</div>
                  <div className="text-xs text-muted-foreground">Take a photo to auto-fill items, then verify before saving.</div>
                </div>
                <div className="flex items-center gap-2">
                  {signedPreview && (
                    <button type="button" onClick={() => setViewImage(signedPreview)} className="h-12 w-12 rounded border overflow-hidden">
                      <img src={signedPreview} alt="Scan" className="h-full w-full object-cover" />
                    </button>
                  )}
                  <Button type="button" variant="outline" onClick={() => setScanOpen(true)} disabled={scanning}>
                    {scanning ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                    {imageUrl ? "Re-scan" : "Scan"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setPhonePairOpen(true)} disabled={scanning} title="Scan QR with phone to capture from phone camera">
                    <Smartphone size={14} /> Use Phone
                  </Button>
                </div>
              </div>
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
                <Label>Items {scanning && <span className="text-xs text-muted-foreground">(extracting…)</span>}</Label>
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
        <CameraCaptureDialog
          open={scanOpen}
          onOpenChange={setScanOpen}
          onCapture={handleScan}
          title="Scan Requisition"
          description="Capture a clear photo of the paper requisition form."
        />
        <PhoneCameraPairDialog
          open={phonePairOpen}
          onOpenChange={setPhonePairOpen}
          onPhotos={async (photos) => { if (photos[0]) await handleScan(photos[0]); }}
          title="Use Phone Camera for Requisition"
        />
        <Dialog open={!!viewImage} onOpenChange={(v) => !v && setViewImage(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>Requisition Scan</DialogTitle></DialogHeader>
            {viewImage && <img src={viewImage} alt="Requisition scan" className="w-full h-auto rounded" />}
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
                      {r.image_url && (
                        <Button size="sm" variant="outline" title="View scan" onClick={async () => {
                          const url = await signUrl(r.image_url!);
                          if (url) setViewImage(url);
                        }}><Eye size={14} /></Button>
                      )}
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

/* ──────── Payment Vouchers ──────── */
function VouchersTab({ data, pos, onChange }: { data: PaymentVoucher[]; pos: PurchaseOrder[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [poId, setPoId] = useState("");
  const [form, setForm] = useState({
    paid_to: "",
    paid_by: "",
    received_by: "",
    amount: 0,
    currency: "USD",
    method: "cash",
    payment_date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const reset = () => {
    setPoId("");
    setForm({ paid_to: "", paid_by: "", received_by: "", amount: 0, currency: "USD", method: "cash", payment_date: new Date().toISOString().slice(0, 10), notes: "" });
  };

  const onPickPO = (id: string) => {
    setPoId(id);
    const p = pos.find((x) => x.id === id);
    if (p) {
      setForm((f) => ({
        ...f,
        paid_to: p.supplier_name || f.paid_to,
        amount: Number(p.total_amount) || f.amount,
        currency: p.currency || f.currency,
      }));
    }
  };

  const submit = async () => {
    if (!form.paid_to.trim() || !form.paid_by.trim() || !form.received_by.trim()) {
      toast({ title: "Paid To, Paid By and Received By are required", variant: "destructive" });
      return;
    }
    if (!form.amount || form.amount <= 0) {
      toast({ title: "Amount must be greater than zero", variant: "destructive" });
      return;
    }
    const po = pos.find((p) => p.id === poId);
    const { error } = await supabase.from("payment_vouchers").insert({
      purchase_order_id: poId || null,
      supplier_name: po?.supplier_name || form.paid_to,
      paid_to: form.paid_to,
      paid_by: form.paid_by,
      received_by: form.received_by,
      amount: form.amount,
      currency: form.currency,
      method: form.method,
      payment_date: form.payment_date,
      notes: form.notes || null,
    });
    if (error) return toast({ title: error.message, variant: "destructive" });
    toast({ title: "Payment voucher created" });
    setOpen(false);
    reset();
    onChange();
  };

  const downloadPDF = (v: PaymentVoucher) => {
    const po = pos.find((p) => p.id === v.purchase_order_id);
    return generateProcurementDoc({
      docType: "PAYMENT VOUCHER",
      number: v.voucher_number,
      date: new Date(v.payment_date).toLocaleDateString(),
      currency: v.currency,
      paidTo: v.paid_to,
      paidBy: v.paid_by,
      receivedBy: v.received_by,
      paymentMethod: v.method,
      amount: Number(v.amount),
      poNumber: po?.po_number,
      supplierName: v.supplier_name,
      items: [
        {
          description: po
            ? `Payment for Purchase Order ${po.po_number}${po.supplier_name ? ` — ${po.supplier_name}` : ""}`
            : `Payment to ${v.paid_to}`,
          quantity: 1,
          unit: "lot",
          unit_price: Number(v.amount),
        },
      ],
      notes: v.notes,
    });
  };

  const remove = async (v: PaymentVoucher) => {
    if (!confirm(`Delete ${v.voucher_number}?`)) return;
    await supabase.from("payment_vouchers").delete().eq("id", v.id);
    onChange();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Payment Vouchers</CardTitle>
          <CardDescription>Record money handover for purchase orders — who paid out and who received</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
          <DialogTrigger asChild><Button><Plus size={16} /> New Voucher</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New Payment Voucher</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Related Purchase Order (optional)</Label>
                <Select value={poId} onValueChange={onPickPO}>
                  <SelectTrigger><SelectValue placeholder="Select PO to auto-fill" /></SelectTrigger>
                  <SelectContent>
                    {pos.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No purchase orders</div>}
                    {pos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.po_number} — {p.supplier_name} — {p.currency} {Number(p.total_amount).toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Paid To (Payee / Supplier) *</Label>
                  <Input value={form.paid_to} onChange={(e) => setForm({ ...form, paid_to: e.target.value })} placeholder="Supplier or person being paid" />
                </div>
                <div>
                  <Label>Paid By (Handover) *</Label>
                  <Input value={form.paid_by} onChange={(e) => setForm({ ...form, paid_by: e.target.value })} placeholder="Staff who handed over the money" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Received By *</Label>
                  <Input value={form.received_by} onChange={(e) => setForm({ ...form, received_by: e.target.value })} placeholder="Person who received the money" />
                </div>
                <div>
                  <Label>Payment Date</Label>
                  <Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Amount *</Label>
                  <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
                </div>
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
                  <Label>Method</Label>
                  <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="mobile_money">Mobile Money</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Reference, cheque number, etc." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit}><Receipt size={14} /> Save Voucher</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Voucher #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>PO #</TableHead>
                <TableHead>Paid To</TableHead>
                <TableHead>Paid By</TableHead>
                <TableHead>Received By</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No payment vouchers yet</TableCell></TableRow>
              )}
              {data.map((v) => {
                const po = pos.find((p) => p.id === v.purchase_order_id);
                return (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono text-xs">{v.voucher_number}</TableCell>
                    <TableCell>{new Date(v.payment_date).toLocaleDateString()}</TableCell>
                    <TableCell className="font-mono text-xs">{po?.po_number || "—"}</TableCell>
                    <TableCell>{v.paid_to}</TableCell>
                    <TableCell>{v.paid_by}</TableCell>
                    <TableCell>{v.received_by}</TableCell>
                    <TableCell className="capitalize text-xs">{v.method.replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-right font-semibold">{v.currency} {Number(v.amount).toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => downloadPDF(v)}><FileDown size={14} /></Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(v)}><Trash2 size={14} /></Button>
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
