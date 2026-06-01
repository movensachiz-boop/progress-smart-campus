import { useState, useEffect } from "react";
import { formatClass, titleCaseName } from "@/lib/normalize";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Package, Receipt as ReceiptIcon } from "lucide-react";
import { generateInventoryReceipt, InventoryReceiptItem } from "@/lib/generateInventoryReceipt";

interface Item { id: string; name: string; category: string; price: number; stock_quantity: number; gender: string; notes: string | null; }
interface Sale { id: string; receipt_number: string; total_amount: number; method: string; items: any; created_at: string; }

export default function StudentInventory() {
  const [items, setItems] = useState<Item[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
      setProfile(prof);
      const [it, sa] = await Promise.all([
        supabase.from("inventory_items").select("*").eq("is_active", true).order("category").order("name"),
        prof ? supabase.from("inventory_sales").select("*").eq("student_profile_id", prof.id).order("created_at", { ascending: false }) : Promise.resolve({ data: [] } as any),
      ]);
      setItems((it.data as any) || []);
      setSales((sa.data as any) || []);
      setLoading(false);
    })();
  }, []);

  const downloadReceipt = async (sale: Sale) => {
    const receiptItems: InventoryReceiptItem[] = (sale.items as any[]).map(i => ({ name: i.name, quantity: i.quantity, unit_price: i.unit_price, subtotal: i.subtotal }));
    await generateInventoryReceipt({
      receiptNo: sale.receipt_number,
      studentName: profile ? titleCaseName(`${profile.first_name} ${profile.last_name}`) : "Customer",
      regNo: profile?.registration_number || "—",
      studentClass: formatClass(profile),
      date: new Date(sale.created_at).toLocaleDateString(),
      method: sale.method,
      items: receiptItems,
      total: Number(sale.total_amount),
    });
  };

  const cats = ["uniforms", "books", "stationery", "other"];

  return (
    <DashboardLayout role="student">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Package className="text-primary" /> School Shop</h2>
          <p className="text-sm text-muted-foreground">Browse uniforms, books and stationery. Visit the bursar to purchase.</p>
        </div>

        <Tabs defaultValue="catalog">
          <TabsList>
            <TabsTrigger value="catalog">Catalog</TabsTrigger>
            <TabsTrigger value="purchases">My Purchases ({sales.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="catalog">
            {loading ? <p className="text-center text-muted-foreground py-8">Loading...</p> :
              cats.map(cat => {
                const catItems = items.filter(i => i.category === cat);
                if (catItems.length === 0) return null;
                return (
                  <Card key={cat} className="mb-4">
                    <CardHeader><CardTitle className="capitalize text-base">{cat}</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {catItems.map(i => (
                          <div key={i.id} className="border rounded-lg p-3 hover:shadow-md transition">
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-medium text-sm">{i.name}</div>
                              {i.gender !== "all" && <Badge variant="outline" className="text-xs capitalize">{i.gender}</Badge>}
                            </div>
                            {i.notes && <p className="text-xs text-muted-foreground mt-1">{i.notes}</p>}
                            <div className="mt-2 flex items-center justify-between">
                              <span className="font-semibold text-primary">US${Number(i.price).toFixed(2)}</span>
                              <Badge variant={i.stock_quantity > 0 ? "secondary" : "destructive"} className="text-xs">
                                {i.stock_quantity > 0 ? `In stock: ${i.stock_quantity}` : "Out of stock"}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            }
          </TabsContent>

          <TabsContent value="purchases">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Receipt</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead className="text-right">Receipt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No purchases yet</TableCell></TableRow> :
                      sales.map(s => (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-xs">{s.receipt_number}</TableCell>
                          <TableCell>{new Date(s.created_at).toLocaleDateString()}</TableCell>
                          <TableCell className="text-xs">{((s.items as any[]) || []).map(i => `${i.name} x${i.quantity}`).join(", ")}</TableCell>
                          <TableCell className="font-semibold">US${Number(s.total_amount).toFixed(2)}</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" onClick={() => downloadReceipt(s)}><ReceiptIcon size={14} /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
