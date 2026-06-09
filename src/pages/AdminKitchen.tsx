import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
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
import { ChefHat, Plus, Pencil, Trash2, FileDown, PackagePlus, PackageMinus, Utensils, ListPlus } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  generateKitchenReport, KitchenStockRow, KitchenReceiptRow, KitchenIssueRow, KitchenMealRow,
} from "@/lib/generateKitchenReport";

interface Item {
  id: string; name: string; category: string; unit: string;
  stock_quantity: number; low_stock_threshold: number;
  unit_cost: number; currency: string; supplier: string | null;
  notes: string | null; is_active: boolean;
}
interface Receipt {
  id: string; receipt_number: string; item_id: string; quantity: number;
  unit_cost: number; total_cost: number; supplier: string | null;
  delivery_date: string; invoice_number: string | null; notes: string | null;
}
interface Issue {
  id: string; issue_number: string; item_id: string; quantity: number;
  purpose: string | null; issue_date: string; notes: string | null;
}
interface MealIng { item_id: string; name?: string; unit?: string; quantity: number; unit_cost: number; }
interface Meal {
  id: string; meal_number: string; meal_name: string; meal_type: string;
  meal_date: string; portions_served: number; total_cost: number;
  cost_per_portion: number; ingredients: MealIng[]; notes: string | null;
}

const CATEGORIES = ["ingredient", "dry_goods", "vegetables", "meat", "dairy", "beverage", "supplies", "other"];
const UNITS = ["kg", "g", "L", "ml", "pcs", "pkt", "tin", "tray", "bag", "box"];
const MEAL_TYPES = ["breakfast", "lunch", "supper", "snack"];

export default function AdminKitchen() {
  const [tab, setTab] = useState("items");
  const [items, setItems] = useState<Item[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);

  // Item dialog
  const [itemDlg, setItemDlg] = useState(false);
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [itemForm, setItemForm] = useState({ name: "", category: "ingredient", unit: "kg", stock_quantity: 0, low_stock_threshold: 5, unit_cost: 0, supplier: "", notes: "" });

  // Receipt dialog
  const [rxDlg, setRxDlg] = useState(false);
  const [rxForm, setRxForm] = useState({ item_id: "", quantity: 0, unit_cost: 0, supplier: "", delivery_date: new Date().toISOString().split("T")[0], invoice_number: "", notes: "" });

  // Issue dialog
  const [issDlg, setIssDlg] = useState(false);
  const [issForm, setIssForm] = useState({ item_id: "", quantity: 0, purpose: "", issue_date: new Date().toISOString().split("T")[0], notes: "" });

  // Meal dialog
  const [mealDlg, setMealDlg] = useState(false);
  const [mealForm, setMealForm] = useState({ meal_name: "", meal_type: "lunch", meal_date: new Date().toISOString().split("T")[0], portions_served: 0, notes: "" });
  const [mealIngs, setMealIngs] = useState<MealIng[]>([]);

  // Bulk item entry
  const [bulkDlg, setBulkDlg] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const [it, rx, iss, ml] = await Promise.all([
      supabase.from("kitchen_items").select("*").order("name"),
      supabase.from("kitchen_receipts").select("*").order("delivery_date", { ascending: false }).limit(500),
      supabase.from("kitchen_issues").select("*").order("issue_date", { ascending: false }).limit(500),
      supabase.from("kitchen_meals").select("*").order("meal_date", { ascending: false }).limit(500),
    ]);
    setItems((it.data as any) || []);
    setReceipts((rx.data as any) || []);
    setIssues((iss.data as any) || []);
    setMeals((ml.data as any) || []);
    setLoading(false);
  };
  useEffect(() => { fetchAll(); }, []);

  const itemMap = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);

  // ─── Items ───
  const openAddItem = () => {
    setEditItem(null);
    setItemForm({ name: "", category: "ingredient", unit: "kg", stock_quantity: 0, low_stock_threshold: 5, unit_cost: 0, supplier: "", notes: "" });
    setItemDlg(true);
  };
  const openEditItem = (i: Item) => {
    setEditItem(i);
    setItemForm({ name: i.name, category: i.category, unit: i.unit, stock_quantity: Number(i.stock_quantity), low_stock_threshold: Number(i.low_stock_threshold), unit_cost: Number(i.unit_cost), supplier: i.supplier || "", notes: i.notes || "" });
    setItemDlg(true);
  };
  const saveItem = async () => {
    if (!itemForm.name.trim()) return toast.error("Name is required");
    const payload = {
      name: itemForm.name.trim(),
      category: itemForm.category,
      unit: itemForm.unit,
      stock_quantity: Number(itemForm.stock_quantity),
      low_stock_threshold: Number(itemForm.low_stock_threshold),
      unit_cost: Number(itemForm.unit_cost),
      supplier: itemForm.supplier.trim() || null,
      notes: itemForm.notes.trim() || null,
    };
    const { error } = editItem
      ? await supabase.from("kitchen_items").update(payload).eq("id", editItem.id)
      : await supabase.from("kitchen_items").insert(payload as any);
    if (error) return toast.error(error.message);
    toast.success(editItem ? "Item updated" : "Item added");
    setItemDlg(false); fetchAll();
  };
  const deleteItem = async (id: string) => {
    if (!confirm("Delete this item? Linked receipts/issues will block deletion.")) return;
    const { error } = await supabase.from("kitchen_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); fetchAll();
  };

  // ─── Bulk add items ───
  const openBulk = () => {
    setBulkText("");
    setBulkDlg(true);
  };
  const saveBulk = async () => {
    const lines = bulkText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return toast.error("Paste at least one item");
    const rows: any[] = [];
    const errors: string[] = [];
    lines.forEach((line, idx) => {
      // Skip header row if present
      if (idx === 0 && /^name\s*,/i.test(line)) return;
      const parts = line.split(",").map(p => p.trim());
      const [name, category, unit, qty, cost, threshold, supplier, notes] = parts;
      if (!name) { errors.push(`Line ${idx + 1}: missing name`); return; }
      const cat = (category || "ingredient").toLowerCase();
      const un = (unit || "kg").toLowerCase();
      if (!CATEGORIES.includes(cat)) { errors.push(`Line ${idx + 1}: invalid category "${category}" (use: ${CATEGORIES.join(", ")})`); return; }
      if (!UNITS.includes(un)) { errors.push(`Line ${idx + 1}: invalid unit "${unit}" (use: ${UNITS.join(", ")})`); return; }
      rows.push({
        name,
        category: cat,
        unit: un,
        stock_quantity: Number(qty) || 0,
        unit_cost: Number(cost) || 0,
        low_stock_threshold: Number(threshold) || 5,
        supplier: supplier || null,
        notes: notes || null,
      });
    });
    if (errors.length) return toast.error(errors.slice(0, 3).join(" | "));
    if (rows.length === 0) return toast.error("Nothing to add");
    setBulkSaving(true);
    const { error } = await supabase.from("kitchen_items").insert(rows as any);
    setBulkSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${rows.length} items added`);
    setBulkDlg(false); fetchAll();
  };

  // ─── Receipts ───
  const openReceipt = () => {
    setRxForm({ item_id: items[0]?.id || "", quantity: 0, unit_cost: items[0]?.unit_cost || 0, supplier: items[0]?.supplier || "", delivery_date: new Date().toISOString().split("T")[0], invoice_number: "", notes: "" });
    setRxDlg(true);
  };
  const saveReceipt = async () => {
    if (!rxForm.item_id) return toast.error("Pick an item");
    if (!Number(rxForm.quantity)) return toast.error("Quantity required");
    const total = Number(rxForm.quantity) * Number(rxForm.unit_cost);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("kitchen_receipts").insert({
      item_id: rxForm.item_id,
      quantity: Number(rxForm.quantity),
      unit_cost: Number(rxForm.unit_cost),
      total_cost: total,
      supplier: rxForm.supplier.trim() || null,
      delivery_date: rxForm.delivery_date,
      invoice_number: rxForm.invoice_number.trim() || null,
      notes: rxForm.notes.trim() || null,
      received_by: user?.id || null,
    } as any);
    if (error) return toast.error(error.message);
    // Also refresh unit cost on the item to keep latest price
    if (Number(rxForm.unit_cost) > 0) {
      await supabase.from("kitchen_items").update({ unit_cost: Number(rxForm.unit_cost) }).eq("id", rxForm.item_id);
    }
    toast.success("Stock received"); setRxDlg(false); fetchAll();
  };

  // ─── Issues ───
  const openIssue = () => {
    setIssForm({ item_id: items[0]?.id || "", quantity: 0, purpose: "", issue_date: new Date().toISOString().split("T")[0], notes: "" });
    setIssDlg(true);
  };
  const saveIssue = async () => {
    if (!issForm.item_id) return toast.error("Pick an item");
    if (!Number(issForm.quantity)) return toast.error("Quantity required");
    const it = itemMap.get(issForm.item_id);
    if (it && Number(issForm.quantity) > Number(it.stock_quantity)) {
      if (!confirm(`Only ${it.stock_quantity} ${it.unit} in stock. Continue anyway?`)) return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("kitchen_issues").insert({
      item_id: issForm.item_id,
      quantity: Number(issForm.quantity),
      purpose: issForm.purpose.trim() || null,
      issue_date: issForm.issue_date,
      notes: issForm.notes.trim() || null,
      issued_by: user?.id || null,
    } as any);
    if (error) return toast.error(error.message);
    toast.success("Stock issued"); setIssDlg(false); fetchAll();
  };

  // ─── Meals ───
  const openMeal = () => {
    setMealForm({ meal_name: "", meal_type: "lunch", meal_date: new Date().toISOString().split("T")[0], portions_served: 0, notes: "" });
    setMealIngs([]);
    setMealDlg(true);
  };
  const addMealIng = () => {
    const first = items[0];
    if (!first) return toast.error("Add items first");
    setMealIngs(prev => [...prev, { item_id: first.id, quantity: 0, unit_cost: Number(first.unit_cost), unit: first.unit, name: first.name }]);
  };
  const updMealIng = (i: number, patch: Partial<MealIng>) => {
    setMealIngs(prev => prev.map((x, k) => {
      if (k !== i) return x;
      const next = { ...x, ...patch };
      if (patch.item_id) {
        const it = itemMap.get(patch.item_id);
        if (it) { next.unit_cost = Number(it.unit_cost); next.unit = it.unit; next.name = it.name; }
      }
      return next;
    }));
  };
  const rmMealIng = (i: number) => setMealIngs(prev => prev.filter((_, k) => k !== i));
  const mealTotalCost = mealIngs.reduce((s, x) => s + Number(x.quantity || 0) * Number(x.unit_cost || 0), 0);
  const mealCostPerPortion = mealForm.portions_served > 0 ? mealTotalCost / mealForm.portions_served : 0;

  const saveMeal = async () => {
    if (!mealForm.meal_name.trim()) return toast.error("Meal name required");
    if (mealIngs.length === 0) return toast.error("Add at least one ingredient");
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("kitchen_meals").insert({
      meal_name: mealForm.meal_name.trim(),
      meal_type: mealForm.meal_type,
      meal_date: mealForm.meal_date,
      portions_served: Number(mealForm.portions_served) || 0,
      total_cost: mealTotalCost,
      cost_per_portion: mealCostPerPortion,
      ingredients: mealIngs.map(x => ({ item_id: x.item_id, name: x.name, unit: x.unit, quantity: Number(x.quantity), unit_cost: Number(x.unit_cost) })),
      notes: mealForm.notes.trim() || null,
      prepared_by: user?.id || null,
    } as any);
    if (error) return toast.error(error.message);
    toast.success("Meal recorded — ingredients deducted from stock");
    setMealDlg(false); fetchAll();
  };

  // ─── PDFs ───
  const exportStock = async () => {
    const rows: KitchenStockRow[] = items.map(i => ({
      name: i.name, category: i.category, unit: i.unit,
      stock_quantity: Number(i.stock_quantity), low_stock_threshold: Number(i.low_stock_threshold),
      unit_cost: Number(i.unit_cost), currency: i.currency, supplier: i.supplier,
    }));
    await generateKitchenReport({ kind: "stock", title: "Kitchen Stock On Hand", rows });
  };
  const exportReceipts = async () => {
    const rows: KitchenReceiptRow[] = receipts.map(r => ({
      receipt_number: r.receipt_number, date: r.delivery_date,
      item: itemMap.get(r.item_id)?.name || "—", unit: itemMap.get(r.item_id)?.unit || "",
      quantity: Number(r.quantity), unit_cost: Number(r.unit_cost), total_cost: Number(r.total_cost),
      supplier: r.supplier, invoice: r.invoice_number,
    }));
    await generateKitchenReport({ kind: "receipts", title: "Kitchen Stock Receipts (Deliveries In)", rows });
  };
  const exportIssues = async () => {
    const rows: KitchenIssueRow[] = issues.map(r => ({
      issue_number: r.issue_number, date: r.issue_date,
      item: itemMap.get(r.item_id)?.name || "—", unit: itemMap.get(r.item_id)?.unit || "",
      quantity: Number(r.quantity), purpose: r.purpose,
    }));
    await generateKitchenReport({ kind: "issues", title: "Kitchen Stock Usage (Issues Out)", rows });
  };
  const exportMeals = async () => {
    const rows: KitchenMealRow[] = meals.map(m => ({
      meal_number: m.meal_number, date: m.meal_date, meal_name: m.meal_name, meal_type: m.meal_type,
      portions_served: Number(m.portions_served), total_cost: Number(m.total_cost), cost_per_portion: Number(m.cost_per_portion),
    }));
    await generateKitchenReport({ kind: "meals", title: "Meals Served & Per-Portion Costing", rows });
  };

  // ─── Dashboard numbers ───
  const totalStockValue = items.reduce((s, i) => s + Number(i.stock_quantity) * Number(i.unit_cost), 0);
  const lowStockCount = items.filter(i => Number(i.stock_quantity) <= Number(i.low_stock_threshold)).length;

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2"><ChefHat className="text-primary" /> Kitchen Stock Management</h2>
            <p className="text-sm text-muted-foreground">Ingredients, deliveries, daily usage, and meals served</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={openAddItem} className="gap-2"><Plus size={16} /> Item</Button>
            <Button variant="outline" onClick={openBulk} className="gap-2"><ListPlus size={16} /> Bulk Add</Button>
            <Button variant="outline" onClick={openReceipt} className="gap-2"><PackagePlus size={16} /> Receive</Button>
            <Button variant="outline" onClick={openIssue} className="gap-2"><PackageMinus size={16} /> Issue</Button>
            <Button onClick={openMeal} className="gap-2"><Utensils size={16} /> Record Meal</Button>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Items tracked</p>
            <p className="text-2xl font-bold">{items.length}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Stock value</p>
            <p className="text-2xl font-bold">US${totalStockValue.toFixed(2)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Low-stock alerts</p>
            <p className={`text-2xl font-bold ${lowStockCount > 0 ? "text-destructive" : ""}`}>{lowStockCount}</p>
          </CardContent></Card>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="items">Items ({items.length})</TabsTrigger>
            <TabsTrigger value="receipts">Deliveries ({receipts.length})</TabsTrigger>
            <TabsTrigger value="issues">Usage ({issues.length})</TabsTrigger>
            <TabsTrigger value="meals">Meals ({meals.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="items">
            <Card><CardContent className="p-3">
              <div className="flex justify-end mb-2">
                <Button size="sm" variant="outline" onClick={exportStock} className="gap-2"><FileDown size={14} /> Stock PDF</Button>
              </div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Item</TableHead><TableHead>Category</TableHead><TableHead>Unit</TableHead>
                  <TableHead>On hand</TableHead><TableHead>Unit Cost</TableHead><TableHead>Value</TableHead>
                  <TableHead>Supplier</TableHead><TableHead className="text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {loading ? <TableRow><TableCell colSpan={8} className="text-center py-6">Loading...</TableCell></TableRow> :
                    items.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No items yet</TableCell></TableRow> :
                    items.map(i => {
                      const low = Number(i.stock_quantity) <= Number(i.low_stock_threshold);
                      return (
                        <TableRow key={i.id}>
                          <TableCell className="font-medium">{i.name}</TableCell>
                          <TableCell><Badge variant="outline" className="capitalize">{i.category.replace("_", " ")}</Badge></TableCell>
                          <TableCell>{i.unit}</TableCell>
                          <TableCell>
                            <span className={low ? "text-destructive font-semibold" : ""}>{Number(i.stock_quantity)}</span>
                            {low && <Badge variant="destructive" className="ml-2 text-xs">Low</Badge>}
                          </TableCell>
                          <TableCell>US${Number(i.unit_cost).toFixed(2)}</TableCell>
                          <TableCell>US${(Number(i.stock_quantity) * Number(i.unit_cost)).toFixed(2)}</TableCell>
                          <TableCell className="text-xs">{i.supplier || "—"}</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" onClick={() => openEditItem(i)}><Pencil size={14} /></Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteItem(i.id)}><Trash2 size={14} /></Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="receipts">
            <Card><CardContent className="p-3">
              <div className="flex justify-end mb-2">
                <Button size="sm" variant="outline" onClick={exportReceipts} className="gap-2"><FileDown size={14} /> Deliveries PDF</Button>
              </div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>KRC #</TableHead><TableHead>Date</TableHead><TableHead>Item</TableHead>
                  <TableHead>Qty</TableHead><TableHead>Unit Cost</TableHead><TableHead>Total</TableHead>
                  <TableHead>Supplier</TableHead><TableHead>Invoice</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {receipts.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No deliveries recorded</TableCell></TableRow> :
                    receipts.map(r => {
                      const it = itemMap.get(r.item_id);
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">{r.receipt_number}</TableCell>
                          <TableCell>{r.delivery_date}</TableCell>
                          <TableCell>{it?.name || "—"}</TableCell>
                          <TableCell>{Number(r.quantity)} {it?.unit}</TableCell>
                          <TableCell>US${Number(r.unit_cost).toFixed(2)}</TableCell>
                          <TableCell className="font-semibold">US${Number(r.total_cost).toFixed(2)}</TableCell>
                          <TableCell className="text-xs">{r.supplier || "—"}</TableCell>
                          <TableCell className="text-xs">{r.invoice_number || "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="issues">
            <Card><CardContent className="p-3">
              <div className="flex justify-end mb-2">
                <Button size="sm" variant="outline" onClick={exportIssues} className="gap-2"><FileDown size={14} /> Usage PDF</Button>
              </div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>KIS #</TableHead><TableHead>Date</TableHead><TableHead>Item</TableHead>
                  <TableHead>Qty</TableHead><TableHead>Purpose</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {issues.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No issues recorded</TableCell></TableRow> :
                    issues.map(r => {
                      const it = itemMap.get(r.item_id);
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">{r.issue_number}</TableCell>
                          <TableCell>{r.issue_date}</TableCell>
                          <TableCell>{it?.name || "—"}</TableCell>
                          <TableCell>{Number(r.quantity)} {it?.unit}</TableCell>
                          <TableCell className="text-xs">{r.purpose || "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="meals">
            <Card><CardContent className="p-3">
              <div className="flex justify-end mb-2">
                <Button size="sm" variant="outline" onClick={exportMeals} className="gap-2"><FileDown size={14} /> Meals PDF</Button>
              </div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Meal #</TableHead><TableHead>Date</TableHead><TableHead>Meal</TableHead>
                  <TableHead>Type</TableHead><TableHead>Portions</TableHead>
                  <TableHead>Total Cost</TableHead><TableHead>Cost/portion</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {meals.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No meals recorded</TableCell></TableRow> :
                    meals.map(m => (
                      <TableRow key={m.id}>
                        <TableCell className="font-mono text-xs">{m.meal_number}</TableCell>
                        <TableCell>{m.meal_date}</TableCell>
                        <TableCell>{m.meal_name}</TableCell>
                        <TableCell className="capitalize">{m.meal_type}</TableCell>
                        <TableCell>{m.portions_served}</TableCell>
                        <TableCell className="font-semibold">US${Number(m.total_cost).toFixed(2)}</TableCell>
                        <TableCell>US${Number(m.cost_per_portion).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Item Dialog */}
      <Dialog open={itemDlg} onOpenChange={setItemDlg}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editItem ? "Edit Item" : "Add Item"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label>
                <Select value={itemForm.category} onValueChange={v => setItemForm({ ...itemForm, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Unit</Label>
                <Select value={itemForm.unit} onValueChange={v => setItemForm({ ...itemForm, unit: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>On hand</Label><Input type="number" step="0.01" value={itemForm.stock_quantity} onChange={e => setItemForm({ ...itemForm, stock_quantity: Number(e.target.value) })} /></div>
              <div><Label>Low alert</Label><Input type="number" step="0.01" value={itemForm.low_stock_threshold} onChange={e => setItemForm({ ...itemForm, low_stock_threshold: Number(e.target.value) })} /></div>
              <div><Label>Unit Cost</Label><Input type="number" step="0.01" value={itemForm.unit_cost} onChange={e => setItemForm({ ...itemForm, unit_cost: Number(e.target.value) })} /></div>
            </div>
            <div><Label>Supplier</Label><Input value={itemForm.supplier} onChange={e => setItemForm({ ...itemForm, supplier: e.target.value })} /></div>
            <div><Label>Notes</Label><Input value={itemForm.notes} onChange={e => setItemForm({ ...itemForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDlg(false)}>Cancel</Button>
            <Button onClick={saveItem}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Dialog */}
      <Dialog open={rxDlg} onOpenChange={setRxDlg}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Receive Stock (Delivery In)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Item</Label>
              <Select value={rxForm.item_id} onValueChange={v => {
                const it = itemMap.get(v);
                setRxForm({ ...rxForm, item_id: v, unit_cost: Number(it?.unit_cost) || rxForm.unit_cost, supplier: it?.supplier || rxForm.supplier });
              }}>
                <SelectTrigger><SelectValue placeholder="Pick item" /></SelectTrigger>
                <SelectContent className="max-h-72">{items.map(i => <SelectItem key={i.id} value={i.id}>{i.name} ({i.unit})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Quantity</Label><Input type="number" step="0.01" value={rxForm.quantity} onChange={e => setRxForm({ ...rxForm, quantity: Number(e.target.value) })} /></div>
              <div><Label>Unit Cost (US$)</Label><Input type="number" step="0.01" value={rxForm.unit_cost} onChange={e => setRxForm({ ...rxForm, unit_cost: Number(e.target.value) })} /></div>
            </div>
            <div className="text-sm bg-muted p-2 rounded">Total: <b>US${(Number(rxForm.quantity) * Number(rxForm.unit_cost)).toFixed(2)}</b></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Date</Label><Input type="date" value={rxForm.delivery_date} onChange={e => setRxForm({ ...rxForm, delivery_date: e.target.value })} /></div>
              <div><Label>Invoice #</Label><Input value={rxForm.invoice_number} onChange={e => setRxForm({ ...rxForm, invoice_number: e.target.value })} /></div>
            </div>
            <div><Label>Supplier</Label><Input value={rxForm.supplier} onChange={e => setRxForm({ ...rxForm, supplier: e.target.value })} /></div>
            <div><Label>Notes</Label><Input value={rxForm.notes} onChange={e => setRxForm({ ...rxForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRxDlg(false)}>Cancel</Button>
            <Button onClick={saveReceipt}>Save & Add Stock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Issue Dialog */}
      <Dialog open={issDlg} onOpenChange={setIssDlg}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Issue Stock (Usage Out)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Item</Label>
              <Select value={issForm.item_id} onValueChange={v => setIssForm({ ...issForm, item_id: v })}>
                <SelectTrigger><SelectValue placeholder="Pick item" /></SelectTrigger>
                <SelectContent className="max-h-72">{items.map(i => <SelectItem key={i.id} value={i.id}>{i.name} — {Number(i.stock_quantity)} {i.unit}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Quantity</Label><Input type="number" step="0.01" value={issForm.quantity} onChange={e => setIssForm({ ...issForm, quantity: Number(e.target.value) })} /></div>
              <div><Label>Date</Label><Input type="date" value={issForm.issue_date} onChange={e => setIssForm({ ...issForm, issue_date: e.target.value })} /></div>
            </div>
            <div><Label>Purpose</Label><Input placeholder="e.g. Lunch for Form 4" value={issForm.purpose} onChange={e => setIssForm({ ...issForm, purpose: e.target.value })} /></div>
            <div><Label>Notes</Label><Input value={issForm.notes} onChange={e => setIssForm({ ...issForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssDlg(false)}>Cancel</Button>
            <Button onClick={saveIssue}>Save & Deduct Stock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Meal Dialog */}
      <Dialog open={mealDlg} onOpenChange={setMealDlg}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Record Meal Served</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid md:grid-cols-4 gap-3">
              <div className="md:col-span-2"><Label>Meal name</Label><Input placeholder="e.g. Sadza & beans" value={mealForm.meal_name} onChange={e => setMealForm({ ...mealForm, meal_name: e.target.value })} /></div>
              <div><Label>Type</Label>
                <Select value={mealForm.meal_type} onValueChange={v => setMealForm({ ...mealForm, meal_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MEAL_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Date</Label><Input type="date" value={mealForm.meal_date} onChange={e => setMealForm({ ...mealForm, meal_date: e.target.value })} /></div>
            </div>
            <div><Label>Portions served</Label><Input type="number" value={mealForm.portions_served} onChange={e => setMealForm({ ...mealForm, portions_served: Number(e.target.value) })} /></div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>Ingredients used</Label>
                <Button size="sm" variant="outline" onClick={addMealIng} className="gap-1"><Plus size={14} /> Add</Button>
              </div>
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Unit</TableHead>
                    <TableHead>Unit Cost</TableHead><TableHead>Subtotal</TableHead><TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {mealIngs.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground text-sm">No ingredients added</TableCell></TableRow> :
                      mealIngs.map((x, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Select value={x.item_id} onValueChange={v => updMealIng(i, { item_id: v })}>
                              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>{items.map(it => <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>)}</SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell><Input type="number" step="0.01" className="h-8 w-20" value={x.quantity} onChange={e => updMealIng(i, { quantity: Number(e.target.value) })} /></TableCell>
                          <TableCell className="text-xs">{x.unit}</TableCell>
                          <TableCell><Input type="number" step="0.01" className="h-8 w-24" value={x.unit_cost} onChange={e => updMealIng(i, { unit_cost: Number(e.target.value) })} /></TableCell>
                          <TableCell className="text-sm">US${(Number(x.quantity) * Number(x.unit_cost)).toFixed(2)}</TableCell>
                          <TableCell><Button size="sm" variant="ghost" onClick={() => rmMealIng(i)}><Trash2 size={14} /></Button></TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-muted rounded-lg p-3">
              <div><p className="text-xs text-muted-foreground">Total cost</p><p className="text-lg font-bold">US${mealTotalCost.toFixed(2)}</p></div>
              <div><p className="text-xs text-muted-foreground">Cost per portion</p><p className="text-lg font-bold text-primary">US${mealCostPerPortion.toFixed(2)}</p></div>
            </div>
            <div><Label>Notes</Label><Input value={mealForm.notes} onChange={e => setMealForm({ ...mealForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMealDlg(false)}>Cancel</Button>
            <Button onClick={saveMeal}>Save Meal & Deduct Ingredients</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Add Items Dialog */}
      <Dialog open={bulkDlg} onOpenChange={setBulkDlg}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Bulk Add Kitchen Items</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Paste one item per line as comma-separated values:</p>
              <p className="font-mono text-xs bg-muted p-2 rounded">name, category, unit, quantity, unit_cost, low_alert, supplier, notes</p>
              <p className="text-xs">
                <b>Categories:</b> {CATEGORIES.join(", ")}<br />
                <b>Units:</b> {UNITS.join(", ")}<br />
                Only <i>name</i> is required. Header row is auto-skipped.
              </p>
            </div>
            <div>
              <Label>Items (CSV)</Label>
              <Textarea
                rows={12}
                placeholder={`Rice, dry_goods, kg, 50, 1.20, 10, Local Mart\nCooking Oil, ingredient, L, 20, 3.50, 5, Local Mart\nTomatoes, vegetables, kg, 15, 0.80, 5`}
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {bulkText.split(/\r?\n/).filter(l => l.trim()).length} line(s) ready
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDlg(false)} disabled={bulkSaving}>Cancel</Button>
            <Button onClick={saveBulk} disabled={bulkSaving} className="gap-2">
              {bulkSaving ? "Saving..." : <><ListPlus size={14} /> Add Items</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
