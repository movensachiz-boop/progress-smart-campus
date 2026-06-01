import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Cloud, CloudUpload, Download, Upload, RotateCcw, Trash2, Loader2, Save, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Snap {
  id: string;
  name: string;
  row_count: number;
  is_auto: boolean;
  created_at: string;
}

interface Props {
  onRestored: () => void;
}

const PaymentsBackupPanel = ({ onRestored }: Props) => {
  const { toast } = useToast();
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<Snap | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [saveName, setSaveName] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("payment_snapshots")
      .select("id,name,row_count,is_auto,created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) toast({ title: "Failed to load backups", description: error.message, variant: "destructive" });
    else setSnaps(data as Snap[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const fetchAllPayments = async () => {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  };

  const handleSave = async (auto = false, customName?: string) => {
    if (auto) setAutoSaving(true); else setSaving(true);
    try {
      const rows = await fetchAllPayments();
      const name = customName || (auto ? `Auto ${new Date().toLocaleString()}` : `Backup ${new Date().toLocaleString()}`);
      const { error } = await supabase.from("payment_snapshots").insert({
        name, snapshot_data: rows, row_count: rows.length, is_auto: auto,
      });
      if (error) throw error;
      toast({ title: "Backup saved", description: `${rows.length} payments backed up to cloud.` });
      setSaveName("");
      load();
    } catch (e) {
      toast({ title: "Backup failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      if (auto) setAutoSaving(false); else setSaving(false);
    }
  };

  const handleExport = async () => {
    try {
      const rows = await fetchAllPayments();
      const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), count: rows.length, payments: rows }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payments-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Exported", description: `${rows.length} payments downloaded as JSON.` });
    } catch (e) {
      toast({ title: "Export failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const restoreFromRows = async (rows: any[]) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      toast({ title: "Nothing to restore", variant: "destructive" });
      return;
    }
    // Insert any payments whose id is not already present
    const { data: existing } = await supabase.from("payments").select("id");
    const existingIds = new Set((existing || []).map((r: any) => r.id));
    const toInsert = rows
      .filter((r) => r && r.id && !existingIds.has(r.id))
      .map((r) => {
        // Drop server-generated fields that may conflict
        const { receipt_number, verification_hash, ...rest } = r;
        return rest;
      });
    if (toInsert.length === 0) {
      toast({ title: "Already up to date", description: "No missing payments to restore." });
      return;
    }
    const { error } = await supabase.from("payments").insert(toInsert);
    if (error) throw error;
    toast({ title: "Restored", description: `${toInsert.length} payments restored.` });
    onRestored();
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      const { data, error } = await supabase
        .from("payment_snapshots")
        .select("snapshot_data")
        .eq("id", restoreTarget.id)
        .maybeSingle();
      if (error) throw error;
      await restoreFromRows((data?.snapshot_data as any) || []);
      setRestoreOpen(false);
      setRestoreTarget(null);
    } catch (e) {
      toast({ title: "Restore failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setRestoring(false);
    }
  };

  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        const rows = Array.isArray(parsed) ? parsed : parsed.payments;
        await restoreFromRows(rows);
      } catch (e) {
        toast({ title: "Import failed", description: (e as Error).message, variant: "destructive" });
      }
    };
    reader.readAsText(file);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this backup?")) return;
    const { error } = await supabase.from("payment_snapshots").delete().eq("id", id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Backup deleted" }); load(); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cloud size={18} /> Payments Cloud Backup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Backup name (optional)"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            className="w-64"
          />
          <Button onClick={() => handleSave(false, saveName.trim() || undefined)} disabled={saving} className="gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}
            Backup Now
          </Button>
          <Button variant="outline" onClick={handleExport} className="gap-2">
            <Download size={14} /> Export JSON
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ""; }}
            />
            <span className="inline-flex items-center gap-2 cursor-pointer border rounded-md px-3 py-2 text-sm hover:bg-accent">
              <Upload size={14} /> Import JSON
            </span>
          </label>
        </div>

        <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground"><Loader2 className="inline animate-spin mr-2" size={14} /> Loading…</div>
          ) : snaps.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">No backups yet.</div>
          ) : snaps.map((s) => (
            <div key={s.id} className="flex items-center gap-3 p-3 text-sm">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(s.created_at).toLocaleString()} · {s.row_count} payments
                  {s.is_auto && <Badge variant="secondary" className="ml-2 text-[10px]">auto</Badge>}
                </div>
              </div>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => { setRestoreTarget(s); setRestoreOpen(true); }}>
                <RotateCcw size={12} /> Restore
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleDelete(s.id)} title="Delete">
                <Trash2 size={14} className="text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>

      <Dialog open={restoreOpen} onOpenChange={(v) => !restoring && setRestoreOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="text-warning" size={18} /> Restore Payments</DialogTitle>
            <DialogDescription>
              This will re-insert any payments from <strong>{restoreTarget?.name}</strong> that are missing from the current records ({restoreTarget?.row_count} in backup). Existing payments are left untouched.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreOpen(false)} disabled={restoring}>Cancel</Button>
            <Button onClick={handleRestore} disabled={restoring} className="gap-2">
              {restoring ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default PaymentsBackupPanel;
