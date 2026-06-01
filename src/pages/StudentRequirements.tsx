import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, Shirt, BookOpen, Package } from "lucide-react";

interface FeeItem {
  id: string;
  item_name: string;
  category: string;
  form_levels: string[];
  learning_area: string | null;
  gender: string;
  amount: number;
  notes: string | null;
}

const categoryIcons: Record<string, any> = {
  fees: DollarSign,
  uniforms: Shirt,
  books: BookOpen,
  stationery: Package,
};

const categoryColors: Record<string, string> = {
  fees: "bg-primary/10 text-primary",
  uniforms: "bg-blue-500/10 text-blue-600",
  books: "bg-amber-500/10 text-amber-600",
  stationery: "bg-emerald-500/10 text-emerald-600",
};

export default function StudentRequirements() {
  const [items, setItems] = useState<FeeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedForm, setSelectedForm] = useState("1");
  const [selectedArea, setSelectedArea] = useState("all");

  useEffect(() => {
    const fetchItems = async () => {
      const { data } = await supabase
        .from("fee_requirements")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      setItems(data || []);
      setLoading(false);
    };
    fetchItems();
  }, []);

  const isUpperForm = ["5", "6"].includes(selectedForm);

  const filtered = items.filter(item => {
    if (!item.form_levels.includes(selectedForm)) return false;
    if (isUpperForm && item.learning_area && selectedArea !== "all" && item.learning_area !== selectedArea) return false;
    if (!isUpperForm && item.learning_area) return false;
    return true;
  });

  const byCategory = (cat: string, gender?: string) =>
    filtered.filter(i => i.category === cat && (gender ? (i.gender === gender || i.gender === "all") : true));

  const totalFees = byCategory("fees").reduce((sum, i) => sum + i.amount, 0);

  const renderItems = (catItems: FeeItem[]) => (
    <div className="space-y-2">
      {catItems.map(item => (
        <div key={item.id} className="flex justify-between items-center py-2 px-3 rounded-lg bg-muted/50">
          <div>
            <span className="font-medium text-sm">{item.item_name}</span>
            {item.gender !== "all" && (
              <Badge variant="outline" className="ml-2 text-xs capitalize">{item.gender}</Badge>
            )}
            {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
          </div>
          {item.amount > 0 && (
            <span className="font-mono font-semibold text-sm">US${item.amount}</span>
          )}
        </div>
      ))}
      {catItems.length === 0 && (
        <p className="text-muted-foreground text-sm text-center py-4">No items for this selection</p>
      )}
    </div>
  );

  return (
    <DashboardLayout role="student">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Fees & Requirements</h2>
          <p className="text-muted-foreground text-sm">View school fees, uniforms, books, and stationery requirements for 2026</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Select value={selectedForm} onValueChange={v => { setSelectedForm(v); if (!["5","6"].includes(v)) setSelectedArea("all"); }}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["1","2","3","4","5","6"].map(f => <SelectItem key={f} value={f}>Form {f}</SelectItem>)}
            </SelectContent>
          </Select>
          {isUpperForm && (
            <Select value={selectedArea} onValueChange={setSelectedArea}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Areas</SelectItem>
                <SelectItem value="Sciences">Sciences</SelectItem>
                <SelectItem value="Commercials">Commercials</SelectItem>
                <SelectItem value="Arts">Arts</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Total fees card */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <DollarSign className="text-primary" size={24} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Fees for Form {selectedForm}{isUpperForm && selectedArea !== "all" ? ` (${selectedArea})` : ""}</p>
              <p className="text-2xl font-bold text-foreground">US${totalFees}</p>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <p className="text-center text-muted-foreground py-8">Loading requirements...</p>
        ) : (
          <Tabs defaultValue="fees">
            <TabsList className="grid grid-cols-4 w-full max-w-md">
              <TabsTrigger value="fees">Fees</TabsTrigger>
              <TabsTrigger value="uniforms">Uniforms</TabsTrigger>
              <TabsTrigger value="books">Books</TabsTrigger>
              <TabsTrigger value="stationery">Stationery</TabsTrigger>
            </TabsList>

            {["fees", "uniforms", "books", "stationery"].map(cat => {
              const Icon = categoryIcons[cat];
              const catItems = byCategory(cat);
              const boysItems = catItems.filter(i => i.gender === "boys" || i.gender === "all");
              const girlsItems = catItems.filter(i => i.gender === "girls" || i.gender === "all");
              const hasGenderSplit = catItems.some(i => i.gender !== "all");

              return (
                <TabsContent key={cat} value={cat}>
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 capitalize">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${categoryColors[cat]}`}>
                          <Icon size={16} />
                        </div>
                        {cat}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {hasGenderSplit ? (
                        <div className="grid md:grid-cols-2 gap-6">
                          <div>
                            <h4 className="font-semibold text-sm mb-3 text-blue-600">👦 Boys</h4>
                            {renderItems(boysItems)}
                          </div>
                          <div>
                            <h4 className="font-semibold text-sm mb-3 text-pink-600">👧 Girls</h4>
                            {renderItems(girlsItems)}
                          </div>
                        </div>
                      ) : (
                        renderItems(catItems)
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
