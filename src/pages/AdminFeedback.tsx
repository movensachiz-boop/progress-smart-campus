import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Star, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  id: string;
  user_id: string | null;
  role: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
  author?: string;
};

const AdminFeedback = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("app_feedback")
        .select("id, user_id, role, rating, comment, created_at")
        .order("created_at", { ascending: false });
      const list = (data || []) as Row[];
      const uids = Array.from(new Set(list.map(r => r.user_id).filter(Boolean))) as string[];
      if (uids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name")
          .in("user_id", uids);
        const nameMap = new Map<string, string>();
        (profs || []).forEach((p: any) => nameMap.set(p.user_id, `${p.first_name || ""} ${p.last_name || ""}`.trim()));
        list.forEach(r => { if (r.user_id) r.author = nameMap.get(r.user_id) || ""; });
      }
      setRows(list);
      setLoading(false);
    })();
  }, []);

  const total = rows.length;
  const avg = total ? rows.reduce((s, r) => s + r.rating, 0) / total : 0;
  const dist = [1,2,3,4,5].map(n => rows.filter(r => r.rating === n).length);

  return (
    <DashboardLayout role="admin">
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold">App Feedback</h2>
          <p className="text-sm text-muted-foreground">Ratings and comments from users about the system.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Average rating</div>
            <div className="flex items-center gap-2 mt-1">
              <div className="text-3xl font-bold">{avg.toFixed(1)}</div>
              <div className="flex">
                {[1,2,3,4,5].map(n => (
                  <Star key={n} size={18} className={n <= Math.round(avg) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"} />
                ))}
              </div>
            </div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total responses</div>
            <div className="text-3xl font-bold mt-1">{total}</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-2">Distribution</div>
            <div className="space-y-1">
              {[5,4,3,2,1].map(n => {
                const c = dist[n-1];
                const pct = total ? (c / total) * 100 : 0;
                return (
                  <div key={n} className="flex items-center gap-2 text-xs">
                    <span className="w-3">{n}</span>
                    <Star size={12} className="fill-yellow-400 text-yellow-400" />
                    <div className="flex-1 h-2 bg-muted rounded">
                      <div className="h-full bg-yellow-400 rounded" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-6 text-right">{c}</span>
                  </div>
                );
              })}
            </div>
          </CardContent></Card>
        </div>

        {loading ? (
          <div className="p-8 text-center"><Loader2 className="inline animate-spin mr-2" size={16}/>Loading…</div>
        ) : rows.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">No feedback yet.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {rows.map(r => (
              <Card key={r.id}><CardContent className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex">
                      {[1,2,3,4,5].map(n => (
                        <Star key={n} size={14} className={n <= r.rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"} />
                      ))}
                    </div>
                    <span className="text-sm font-medium">{r.author || "Anonymous"}</span>
                    {r.role && <span className="text-xs px-2 py-0.5 rounded bg-secondary capitalize">{r.role}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                </div>
                {r.comment && <p className="mt-2 text-sm whitespace-pre-wrap">{r.comment}</p>}
              </CardContent></Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AdminFeedback;
