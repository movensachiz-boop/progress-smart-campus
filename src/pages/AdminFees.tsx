import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, DollarSign } from "lucide-react";

interface FeeItem {
  id: string;
  item_name: string;
  category: string;
  form_levels: string[];
  learning_area: string | null;
  gender: string;
  amount: number;
  currency: string;
  notes: string | null;
  is_active: boolean;
  sort_order: number;
}

const CATEGORIES = ["fees", "uniforms", "books", "stationery"];
const GENDERS = ["all", "boys", "girls"];
const FORM_OPTIONS = ["1", "2", "3", "4", "5", "6"];
const LEARNING_AREAS = ["Sciences", "Commercials", "Arts"];

export default function AdminFees() {
  const [items, setItems] = useState<FeeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<FeeItem | null>(null);
  const [filterCategory, setFilterCategory] = useState("all");

  const [form, setForm] = useState({
    item_name: "",
    category: "fees",
    form_levels: [] as string[],
    learning_area: "" as string,
    gender: "all",
    amount: 0,
    notes: "",
    sort_order: 0,
  });

  const fetchItems = async () => {
    const { data, error } = await supabase
      .from("fee_requirements")
      .select("*")
      .order("category")
      .order("sort_order");
    if (error) { toast.error(error.message); return; }
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, []);

  const openAdd = () => {
    setEditItem(null);
    setForm({ item_name: "", category: "fees", form_levels: [], learning_area: "", gender: "all", amount: 0, notes: "", sort_order: 0 });
    setDialogOpen(true);
  };

  const openEdit = (item: FeeItem) => {
    setEditItem(item);
    setForm({
      item_name: item.item_name,
      category: item.category,
      form_levels: item.form_levels,
      learning_area: item.learning_area || "",
      gender: item.gender,
      amount: item.amount,
      notes: item.notes || "",
      sort_order: item.sort_order,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.item_name || form.form_levels.length === 0) {
      toast.error("Name and at least one form level are required");
      return;
    }
    const payload = {
      item_name: form.item_name,
      category: form.category,
      form_levels: form.form_levels,
      learning_area: form.learning_area || null,
      gender: form.gender,
      amount: form.amount,
      notes: form.notes || null,
      sort_order: form.sort_order,
    };

    if (editItem) {
      const { error } = await supabase.from("fee_requirements").update(payload).eq("id", editItem.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Item updated");
    } else {
      const { error } = await supabase.from("fee_requirements").insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("Item added");
    }
    setDialogOpen(false);
    fetchItems();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("fee_requirements").delete().eq("id", deleteId);
    if (error) { toast.error(error.message); return; }
    toast.success("Item deleted");
    setDeleteId(null);
    fetchItems();
  };

  const toggleFormLevel = (level: string) => {
    setForm(prev => ({
      ...prev,
      form_levels: prev.form_levels.includes(level)
        ? prev.form_levels.filter(l => l !== level)
        : [...prev.form_levels, level],
    }));
  };

  const filtered = filterCategory === "all" ? items : items.filter(i => i.category === filterCategory);

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <DollarSign className="text-primary" /> Fees & Requirements
            </h2>
            <p className="text-muted-foreground text-sm">Manage school fees, uniforms, and stationery requirements</p>
          </div>
          <div className="flex gap-2">
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={openAdd}><Plus size={16} className="mr-1" /> Add Item</Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Forms</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead className="text-right">Amount (USD)</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No items found</TableCell></TableRow>
                ) : filtered.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.item_name}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{item.category}</Badge></TableCell>
                    <TableCell>{item.form_levels.join(", ")}</TableCell>
                    <TableCell className="capitalize">{item.gender}</TableCell>
                    <TableCell>{item.learning_area || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{item.amount > 0 ? `$${item.amount}` : "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs max-w-[150px] truncate">{item.notes || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil size={14} /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteId(item.id)}><Trash2 size={14} /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editItem ? "Edit" : "Add"} Fee Item</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Item Name</Label><Input value={form.item_name} onChange={e => setForm(p => ({ ...p, item_name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Gender</Label>
                <Select value={form.gender} onValueChange={v => setForm(p => ({ ...p, gender: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{GENDERS.map(g => <SelectItem key={g} value={g} className="capitalize">{g}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Form Levels</Label>
              <div className="flex gap-3 mt-1">
                {FORM_OPTIONS.map(f => (
                  <label key={f} className="flex items-center gap-1.5 text-sm">
                    <Checkbox checked={form.form_levels.includes(f)} onCheckedChange={() => toggleFormLevel(f)} />
                    Form {f}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>Learning Area (A-Level only)</Label>
              <Select value={form.learning_area} onValueChange={v => setForm(p => ({ ...p, learning_area: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {LEARNING_AREAS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Amount (USD)</Label><Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} /></div>
              <div><Label>Sort Order</Label><Input type="number" value={form.sort_order} onChange={e => setForm(p => ({ ...p, sort_order: Number(e.target.value) }))} /></div>
            </div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={handleSave}>{editItem ? "Update" : "Add"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete this item?</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
