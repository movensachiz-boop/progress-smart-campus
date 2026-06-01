import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Cloud, CloudUpload, Download, Upload, RotateCcw, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTimetable } from '@/context/TimetableContext';
import { toast } from 'sonner';

interface Snapshot {
  id: string;
  name: string;
  is_auto: boolean;
  created_at: string;
}

export default function TimetableBackupPanel() {
  const { config, subjects, teachers, classes, timetable, setConfig, setSubjects, setTeachers, setClasses } = useTimetable();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoSyncedAt, setAutoSyncedAt] = useState<string | null>(null);
  const [openRestore, setOpenRestore] = useState(false);
  const [openSave, setOpenSave] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const autoTimer = useRef<NodeJS.Timeout | null>(null);

  const buildPayload = () => ({
    version: 1,
    exportedAt: new Date().toISOString(),
    config, subjects, teachers, classes, timetable,
  });

  const applyPayload = (data: any) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid backup');
    if (data.config) setConfig(data.config);
    if (data.subjects) setSubjects(data.subjects);
    if (data.teachers) setTeachers(data.teachers);
    if (data.classes) setClasses(data.classes);
    if (data.timetable) {
      try { localStorage.setItem('tt_timetable', JSON.stringify(data.timetable)); } catch {}
    }
  };

  const loadSnapshots = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('timetable_snapshots')
      .select('id,name,is_auto,created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    setLoading(false);
    if (error) { toast.error('Failed to load backups'); return; }
    setSnapshots(data || []);
  };

  const saveToCloud = async (name: string, isAuto = false) => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('timetable_snapshots').insert({
      name, snapshot_data: buildPayload() as any, is_auto: isAuto, created_by: user?.id || null,
    });
    setSaving(false);
    if (error) { if (!isAuto) toast.error('Cloud save failed'); return false; }
    if (isAuto) setAutoSyncedAt(new Date().toISOString());
    else toast.success(`Saved "${name}" to cloud`);
    return true;
  };

  const restoreSnapshot = async (id: string) => {
    const { data, error } = await supabase
      .from('timetable_snapshots').select('snapshot_data').eq('id', id).maybeSingle();
    if (error || !data) { toast.error('Failed to load backup'); return; }
    try {
      applyPayload(data.snapshot_data);
      toast.success('Restored from cloud — reloading...');
      setTimeout(() => window.location.reload(), 600);
    } catch (e: any) {
      toast.error(e.message || 'Restore failed');
    }
  };

  const deleteSnapshot = async (id: string) => {
    const { error } = await supabase.from('timetable_snapshots').delete().eq('id', id);
    if (error) { toast.error('Delete failed'); return; }
    setSnapshots(s => s.filter(x => x.id !== id));
    toast.success('Backup deleted');
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(buildPayload(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timetable-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported backup file');
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      applyPayload(data);
      toast.success('Imported — reloading...');
      setTimeout(() => window.location.reload(), 600);
    } catch (e: any) {
      toast.error('Invalid backup file');
    }
  };

  // Auto-save to cloud (debounced) whenever data changes
  useEffect(() => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(() => {
      saveToCloud(`Auto-save ${new Date().toLocaleString()}`, true);
    }, 10000); // 10s after last change
    return () => { if (autoTimer.current) clearTimeout(autoTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, subjects, teachers, classes, timetable]);

  return (
    <div className="bg-card rounded-xl border p-6">
      <div className="flex items-center gap-2 mb-1">
        <Cloud className="w-4 h-4 text-primary" />
        <h3 className="text-base font-semibold">Cloud Backup & Export</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Auto-saved to cloud every 10s after changes. Export a JSON file as an extra offline backup.
        {autoSyncedAt && (
          <span className="inline-flex items-center gap-1 ml-2 text-success">
            <CheckCircle2 className="w-3 h-3" /> synced {new Date(autoSyncedAt).toLocaleTimeString()}
          </span>
        )}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" onClick={() => { setSnapshotName(`Manual ${new Date().toLocaleString()}`); setOpenSave(true); }}>
          <CloudUpload className="w-4 h-4 mr-1.5" /> Save to Cloud
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setOpenRestore(true); loadSnapshots(); }}>
          <RotateCcw className="w-4 h-4 mr-1.5" /> Restore from Cloud
        </Button>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="w-4 h-4 mr-1.5" /> Export JSON
        </Button>
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload className="w-4 h-4 mr-1.5" /> Import JSON
        </Button>
      </div>
      <input ref={fileRef} type="file" accept="application/json" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ''; }} />

      {/* Save dialog */}
      <Dialog open={openSave} onOpenChange={setOpenSave}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Save Backup to Cloud</DialogTitle></DialogHeader>
          <Input value={snapshotName} onChange={e => setSnapshotName(e.target.value)} placeholder="Backup name" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenSave(false)}>Cancel</Button>
            <Button disabled={saving || !snapshotName.trim()} onClick={async () => {
              const ok = await saveToCloud(snapshotName.trim());
              if (ok) setOpenSave(false);
            }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore dialog */}
      <Dialog open={openRestore} onOpenChange={setOpenRestore}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Restore from Cloud</DialogTitle></DialogHeader>
          {loading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              <Loader2 className="w-5 h-5 mx-auto animate-spin" /> Loading...
            </div>
          ) : snapshots.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No backups yet.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto space-y-1.5">
              {snapshots.map(s => (
                <div key={s.id} className="flex items-center justify-between gap-2 p-2 border rounded-md text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(s.created_at).toLocaleString()}{s.is_auto ? ' · auto' : ''}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => restoreSnapshot(s.id)}>Restore</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteSnapshot(s.id)}>Delete</Button>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenRestore(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
