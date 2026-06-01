import { useState, useEffect } from "react";
import { formatClass, titleCaseName } from "@/lib/normalize";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, ShoppingCart, Trash2, Printer, Receipt as ReceiptIcon, Package } from "lucide-react";
import { generateInventoryReceipt, generateInventoryThermalReceipt, InventoryReceiptItem } from "@/lib/generateInventoryReceipt";

interface Item {
  id: string; name: string; category: string; price: number; currency: string;
  stock_quantity: number; low_stock_threshold: number; gender: string;
  form_levels: string[]; notes: string | null; is_active: boolean; sort_order: number;
}

interface Profile { id: string; first_name: string; last_name: string; registration_number: string; form: string | null; stream: string | null; }
interface Sale {
  id: string; receipt_number: string; student_profile_id: string | null;
  total_amount: number; method: string; status: string; items: any; created_at: string;
}

const CATEGORIES = ["uniforms", "books", "stationery", "other"];

export default function AdminInventory() {
  const [tab, setTab] = useState("items");
  const [items, setItems] = useState<Item[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Item dialog
  const [itemDialog, setItemDialog] = useState(false);
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [itemForm, setItemForm] = useState({ name: "", category: "uniforms", price: 0, stock_quantity: 0, low_stock_threshold: 5, gender: "all", notes: "" });

  // Sale dialog
  const [saleDialog, setSaleDialog] = useState(false);
  const [saleStudent, setSaleStudent] = useState<string>("");
  const [saleMethod, setSaleMethod] = useState("cash");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [itemSearch, setItemSearch] = useState("");
  const [listSearch, setListSearch] = useState("");

  const fetchAll = async () => {
    const [it, sa, pr] = await Promise.all([
      supabase.from("inventory_items").select("*").order("category").order("name"),
      supabase.from("inventory_sales").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("profiles").select("id, first_name, last_name, registration_number, form, stream").order("first_name"),
    ]);
    setItems((it.data as any) || []);
    setSales((sa.data as any) || []);
    setProfiles((pr.data as any) || []);
    setLoading(false);
  };
  useEffect(() => { fetchAll(); }, []);

  // ── Items ──
  const openAddItem = () => { setEditItem(null); setItemForm({ name: "", category: "uniforms", price: 0, stock_quantity: 0, low_stock_threshold: 5, gender: "all", notes: "" }); setItemDialog(true); };
  const openEditItem = (i: Item) => {
    setEditItem(i);
    setItemForm({ name: i.name, category: i.category, price: i.price, stock_quantity: i.stock_quantity, low_stock_threshold: i.low_stock_threshold, gender: i.gender, notes: i.notes || "" });
    setItemDialog(true);
  };
  const saveItem = async () => {
    if (!itemForm.name.trim()) return toast.error("Name is required");
    const payload = { ...itemForm, price: Number(itemForm.price), stock_quantity: Number(itemForm.stock_quantity), low_stock_threshold: Number(itemForm.low_stock_threshold) };
    const { error } = editItem
      ? await supabase.from("inventory_items").update(payload).eq("id", editItem.id)
      : await supabase.from("inventory_items").insert(payload as any);
    if (error) return toast.error(error.message);
    toast.success(editItem ? "Item updated" : "Item added");
    setItemDialog(false); fetchAll();
  };
  const deleteItem = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    const { error } = await supabase.from("inventory_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); fetchAll();
  };

  // ── Sale ──
  const cartItems = Object.entries(cart).map(([id, qty]) => {
    const it = items.find(i => i.id === id)!;
    return { id, name: it?.name || "", price: it?.price || 0, qty, subtotal: (it?.price || 0) * qty, stock: it?.stock_quantity || 0 };
  }).filter(c => c.qty > 0);
  const cartTotal = cartItems.reduce((s, c) => s + c.subtotal, 0);

  const setQty = (id: string, qty: number) => setCart(c => ({ ...c, [id]: Math.max(0, qty) }));

  const completeSale = async () => {
    if (!saleStudent) return toast.error("Select a student");
    if (cartItems.length === 0) return toast.error("Cart is empty");
    const itemsJson = cartItems.map(c => ({ item_id: c.id, name: c.name, quantity: c.qty, unit_price: c.price, subtotal: c.subtotal }));
    const { data, error } = await supabase.from("inventory_sales").insert({
      student_profile_id: saleStudent,
      total_amount: cartTotal,
      method: saleMethod,
      status: "paid",
      items: itemsJson,
    } as any).select().single();
    if (error) return toast.error(error.message);
    toast.success(`Sale recorded: ${data.receipt_number}`);
    const stu = profiles.find(p => p.id === saleStudent);
    const receiptItems: InventoryReceiptItem[] = cartItems.map(c => ({ name: c.name, quantity: c.qty, unit_price: c.price, subtotal: c.subtotal }));
    await generateInventoryThermalReceipt({
      receiptNo: data.receipt_number,
      studentName: stu ? titleCaseName(`${stu.first_name} ${stu.last_name}`) : "Customer",
      regNo: stu?.registration_number || "—",
      studentClass: formatClass(stu),
      date: new Date().toLocaleDateString(),
      method: saleMethod,
      items: receiptItems,
      total: cartTotal,
    });
    setSaleDialog(false); setCart({}); setSaleStudent(""); fetchAll();
  };

  const reprintSale = async (sale: Sale, thermal = false) => {
    const stu = profiles.find(p => p.id === sale.student_profile_id);
    const items: InventoryReceiptItem[] = (sale.items as any[]).map(i => ({ name: i.name, quantity: i.quantity, unit_price: i.unit_price, subtotal: i.subtotal }));
    const data = {
      receiptNo: sale.receipt_number,
      studentName: stu ? titleCaseName(`${stu.first_name} ${stu.last_name}`) : "Customer",
      regNo: stu?.registration_number || "—",
      studentClass: formatClass(stu),
      date: new Date(sale.created_at).toLocaleDateString(),
      method: sale.method,
      items,
      total: Number(sale.total_amount),
    };
    if (thermal) await generateInventoryThermalReceipt(data);
    else await generateInventoryReceipt(data);
  };

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2"><Package className="text-primary" /> Inventory</h2>
            <p className="text-sm text-muted-foreground">Manage stock, record sales, and print receipts</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setSaleDialog(true)} className="gap-2"><ShoppingCart size={16} /> New Sale</Button>
            <Button variant="outline" onClick={openAddItem} className="gap-2"><Plus size={16} /> Add Item</Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="items">Items ({items.length})</TabsTrigger>
            <TabsTrigger value="sales">Sales ({sales.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="items">
            <Card>
              <CardContent className="p-3 sm:p-4">
                <Input
                  placeholder="Search items by name, category, or notes..."
                  value={listSearch}
                  onChange={e => setListSearch(e.target.value)}
                  className="mb-3 max-w-md"
                />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Gender</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      if (loading) return <TableRow><TableCell colSpan={6} className="text-center py-6">Loading...</TableCell></TableRow>;
                      const q = listSearch.trim().toLowerCase();
                      const list = items.filter(i =>
                        !q ||
                        i.name.toLowerCase().includes(q) ||
                        i.category.toLowerCase().includes(q) ||
                        (i.notes || "").toLowerCase().includes(q) ||
                        i.gender.toLowerCase().includes(q)
                      );
                      if (list.length === 0) return <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No items found</TableCell></TableRow>;
                      return list.map(i => (
                        <TableRow key={i.id}>
                          <TableCell className="font-medium">{i.name}</TableCell>
                          <TableCell><Badge variant="outline" className="capitalize">{i.category}</Badge></TableCell>
                          <TableCell>US${Number(i.price).toFixed(2)}</TableCell>
                          <TableCell>
                            <span className={i.stock_quantity <= i.low_stock_threshold ? "text-destructive font-semibold" : ""}>
                              {i.stock_quantity}
                            </span>
                            {i.stock_quantity <= i.low_stock_threshold && <Badge variant="destructive" className="ml-2 text-xs">Low</Badge>}
                          </TableCell>
                          <TableCell className="capitalize">{i.gender}</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" onClick={() => openEditItem(i)}><Pencil size={14} /></Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteItem(i.id)}><Trash2 size={14} /></Button>
                          </TableCell>
                        </TableRow>
                      ));
                    })()}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sales">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Receipt</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead className="text-right">Receipt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No sales yet</TableCell></TableRow> :
                      sales.map(s => {
                        const stu = profiles.find(p => p.id === s.student_profile_id);
                        const itemsArr = (s.items as any[]) || [];
                        return (
                          <TableRow key={s.id}>
                            <TableCell className="font-mono text-xs">{s.receipt_number}</TableCell>
                            <TableCell>{new Date(s.created_at).toLocaleDateString()}</TableCell>
                            <TableCell>{stu ? titleCaseName(`${stu.first_name} ${stu.last_name}`) : "—"}</TableCell>
                            <TableCell className="text-xs">{itemsArr.map(i => `${i.name} x${i.quantity}`).join(", ")}</TableCell>
                            <TableCell className="font-semibold">US${Number(s.total_amount).toFixed(2)}</TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="ghost" onClick={() => reprintSale(s)} title="A4 PDF"><ReceiptIcon size={14} /></Button>
                              <Button size="sm" variant="ghost" onClick={() => reprintSale(s, true)} title="80mm thermal"><Printer size={14} /></Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Item Dialog */}
      <Dialog open={itemDialog} onOpenChange={setItemDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editItem ? "Edit Item" : "Add Item"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select value={itemForm.category} onValueChange={v => setItemForm({ ...itemForm, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Gender</Label>
                <Select value={itemForm.gender} onValueChange={v => setItemForm({ ...itemForm, gender: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="boys">Boys</SelectItem>
                    <SelectItem value="girls">Girls</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Price (US$)</Label><Input type="number" step="0.01" value={itemForm.price} onChange={e => setItemForm({ ...itemForm, price: Number(e.target.value) })} /></div>
              <div><Label>Stock</Label><Input type="number" value={itemForm.stock_quantity} onChange={e => setItemForm({ ...itemForm, stock_quantity: Number(e.target.value) })} /></div>
              <div><Label>Low alert</Label><Input type="number" value={itemForm.low_stock_threshold} onChange={e => setItemForm({ ...itemForm, low_stock_threshold: Number(e.target.value) })} /></div>
            </div>
            <div><Label>Notes</Label><Input value={itemForm.notes} onChange={e => setItemForm({ ...itemForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialog(false)}>Cancel</Button>
            <Button onClick={saveItem}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sale Dialog */}
      <Dialog open={saleDialog} onOpenChange={setSaleDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Sale</DialogTitle></DialogHeader>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Customer (Student)</Label>
              <Select value={saleStudent} onValueChange={setSaleStudent}>
                <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.first_name} {p.last_name} ({p.registration_number})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={saleMethod} onValueChange={setSaleMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="ecocash">EcoCash</SelectItem>
                  <SelectItem value="bank">Bank Transfer</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2 gap-2">
              <h4 className="font-semibold">Items</h4>
              <Input
                placeholder="Search items by name or category..."
                value={itemSearch}
                onChange={e => setItemSearch(e.target.value)}
                className="h-8 max-w-xs"
              />
            </div>
            <div className="border rounded-lg max-h-72 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead className="w-24">Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const q = itemSearch.trim().toLowerCase();
                    const filtered = items.filter(i =>
                      i.is_active && (
                        !q ||
                        i.name.toLowerCase().includes(q) ||
                        i.category.toLowerCase().includes(q) ||
                        (i.notes || "").toLowerCase().includes(q)
                      )
                    );
                    if (filtered.length === 0) return (
                      <TableRow><TableCell colSpan={4} className="text-center py-4 text-muted-foreground text-sm">No items match "{itemSearch}"</TableCell></TableRow>
                    );
                    return filtered.map(i => (
                      <TableRow key={i.id}>
                        <TableCell className="text-sm">{i.name} <Badge variant="outline" className="ml-1 text-xs capitalize">{i.category}</Badge></TableCell>
                        <TableCell>US${Number(i.price).toFixed(2)}</TableCell>
                        <TableCell>{i.stock_quantity}</TableCell>
                        <TableCell><Input type="number" min={0} value={cart[i.id] || 0} onChange={e => setQty(i.id, Number(e.target.value))} className="h-8" /></TableCell>
                      </TableRow>
                    ));
                  })()}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="mt-4 p-3 bg-muted rounded-lg flex items-center justify-between">
            <span className="font-semibold">Total</span>
            <span className="text-2xl font-bold text-primary">US${cartTotal.toFixed(2)}</span>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSaleDialog(false)}>Cancel</Button>
            <Button onClick={completeSale} className="gap-2"><ReceiptIcon size={16} /> Complete & Print</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
