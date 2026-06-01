import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useTimetable } from '@/context/TimetableContext';
import { SchoolClass, FormLevel, LearningArea } from '@/types/school';
import { v4 } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Pencil, Trash2, School, Check, RefreshCw, Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const FORMS: FormLevel[] = [1, 2, 3, 4, 5, 6];
const LEARNING_AREAS: LearningArea[] = ['Sciences', 'Commercials', 'Arts'];

interface ClassFormState {
  id: string; form: FormLevel; stream: string; learningArea?: LearningArea; subjectIds: string[];
}

export default function AdminClasses() {
  const { classes, setClasses, subjects } = useTimetable();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClassFormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SchoolClass | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [studentCounts, setStudentCounts] = useState<Record<string, { total: number; male: number; female: number }>>({});

  const loadCounts = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('form, stream, gender')
        .not('form', 'is', null)
        .not('stream', 'is', null);
      if (error) throw error;
      const counts: Record<string, { total: number; male: number; female: number }> = {};
      const missing: Record<string, { form: FormLevel; stream: string; learningArea?: LearningArea }> = {};
      for (const row of data || []) {
        const formNum = parseInt(row.form!, 10);
        if (isNaN(formNum) || formNum < 1 || formNum > 6) continue;
        const matched = classes.find(c =>
          c.form === formNum && (c.stream === row.stream || c.learningArea === row.stream)
        );
        let classId: string;
        if (matched) {
          classId = matched.id;
        } else {
          const isUpper = formNum >= 5;
          const area = isUpper ? (LEARNING_AREAS.find(a => a === row.stream || a.charAt(0) === row.stream)) : undefined;
          classId = isUpper && area ? `${formNum}${area.charAt(0)}` : `${formNum}${row.stream}`;
          if (!missing[classId]) {
            missing[classId] = {
              form: formNum as FormLevel,
              stream: isUpper && area ? area : row.stream!,
              learningArea: area,
            };
          }
        }
        if (!counts[classId]) counts[classId] = { total: 0, male: 0, female: 0 };
        counts[classId].total++;
        if (row.gender === 'female') counts[classId].female++;
        else if (row.gender === 'male') counts[classId].male++;
      }
      setStudentCounts(counts);

      // Auto-create label entries for any registered classes not yet in the list
      const toAdd = Object.entries(missing).filter(([id]) => !classes.some(c => c.id === id));
      if (toAdd.length > 0) {
        const newClasses = [...classes];
        for (const [id, info] of toAdd) {
          const isUpper = info.form >= 5;
          let classSubjects: string[];
          if (isUpper && info.learningArea) {
            const areaSubjects = subjects
              .filter(s => s.forms.includes(info.form) && s.learningAreas?.includes(info.learningArea!))
              .map(s => s.id);
            const compulsory = subjects
              .filter(s => s.forms.includes(info.form) && s.isCompulsory)
              .map(s => s.id);
            classSubjects = [...new Set([...compulsory, ...areaSubjects])];
          } else {
            classSubjects = subjects.filter(s => s.forms.includes(info.form)).map(s => s.id);
          }
          newClasses.push({ id, form: info.form, stream: info.stream, learningArea: info.learningArea, subjectIds: classSubjects });
        }
        setClasses(newClasses);
      }
    } catch (e) { /* ignore */ }
  };

  useEffect(() => { loadCounts(); }, [classes]);

  // Valid class definitions matching the timetable defaults exactly
  const VALID_LOWER_STREAMS = ['G1', 'G2', 'G22', 'Blue']; // Forms 1-4
  const VALID_UPPER_AREAS: LearningArea[] = ['Sciences', 'Commercials', 'Arts']; // Forms 5-6

  const getValidClassId = (formNum: number, stream: string): string | null => {
    if (formNum >= 1 && formNum <= 4) {
      if (VALID_LOWER_STREAMS.includes(stream)) return `${formNum}${stream}`;
    } else if (formNum >= 5 && formNum <= 6) {
      // Match learning area by first letter or full name
      const area = VALID_UPPER_AREAS.find(
        a => a === stream || a.charAt(0) === stream
      );
      if (area) return `${formNum}${area.charAt(0)}`;
    }
    return null;
  };

  const syncFromRegistrations = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('form, stream, gender')
        .not('form', 'is', null)
        .not('stream', 'is', null);
      if (error) throw error;

      // Count students per valid class only
      const counts: Record<string, { form: number; stream: string; count: number }> = {};
      let skipped = 0;
      for (const row of data || []) {
        const formNum = parseInt(row.form!, 10);
        if (isNaN(formNum) || formNum < 1 || formNum > 6) { skipped++; continue; }
        const classId = getValidClassId(formNum, row.stream!);
        if (!classId) { skipped++; continue; }
        const streamLabel = formNum >= 5
          ? (VALID_UPPER_AREAS.find(a => a.charAt(0) === classId.slice(-1)) || row.stream!)
          : row.stream!;
        if (!counts[classId]) counts[classId] = { form: formNum, stream: streamLabel, count: 0 };
        counts[classId].count++;
      }

      let added = 0;
      const newClasses = [...classes];
      const newCounts: Record<string, { total: number; male: number; female: number }> = {};

      // Re-scan with gender
      for (const row of data || []) {
        const formNum = parseInt(row.form!, 10);
        if (isNaN(formNum)) continue;
        const classId = getValidClassId(formNum, row.stream!);
        if (!classId) continue;
        if (!newCounts[classId]) newCounts[classId] = { total: 0, male: 0, female: 0 };
        newCounts[classId].total++;
        if ((row as any).gender === 'female') newCounts[classId].female++;
        else if ((row as any).gender === 'male') newCounts[classId].male++;
      }

      for (const [key, info] of Object.entries(counts)) {
        if (!newClasses.some(c => c.id === key)) {
          const isUpper = info.form >= 5;
          const area = isUpper ? VALID_UPPER_AREAS.find(a => a === info.stream) : undefined;

          let classSubjects: string[];
          if (isUpper && area) {
            const areaSubjects = subjects
              .filter(s => s.forms.includes(info.form as FormLevel) && s.learningAreas?.includes(area))
              .map(s => s.id);
            const compulsory = subjects
              .filter(s => s.forms.includes(info.form as FormLevel) && s.isCompulsory)
              .map(s => s.id);
            classSubjects = [...new Set([...compulsory, ...areaSubjects])];
          } else {
            classSubjects = subjects
              .filter(s => s.forms.includes(info.form as FormLevel))
              .map(s => s.id);
          }

          newClasses.push({
            id: key,
            form: info.form as FormLevel,
            stream: info.stream,
            learningArea: area,
            subjectIds: classSubjects,
          });
          added++;
        }
      }

      setStudentCounts(newCounts);
      if (added > 0) {
        setClasses(newClasses);
        toast.success(`Synced: ${added} new class(es) added from registrations`);
      } else {
        toast.info('All registered form/stream combinations already exist');
      }
      if (skipped > 0) {
        toast.warning(`${skipped} student(s) have invalid form/stream and were skipped`);
      }
    } catch (e: any) {
      toast.error('Failed to sync: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  const formGroups = FORMS.map(f => ({
    form: f, label: `Form ${f}`,
    classes: classes.filter(c => c.form === f).sort((a, b) => a.stream.localeCompare(b.stream)),
  }));

  const openAdd = () => { setEditing({ id: '', form: 1, stream: '', subjectIds: [] }); setDialogOpen(true); };
  const openEdit = (cls: SchoolClass) => { setEditing({ id: cls.id, form: cls.form, stream: cls.stream, learningArea: cls.learningArea, subjectIds: [...cls.subjectIds] }); setDialogOpen(true); };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); };

  const toggleSubject = (sId: string) => {
    if (!editing) return;
    setEditing(prev => prev ? { ...prev, subjectIds: prev.subjectIds.includes(sId) ? prev.subjectIds.filter(id => id !== sId) : [...prev.subjectIds, sId] } : prev);
  };

  const handleSave = async () => {
    if (!editing || !editing.stream.trim()) { toast.error('Stream name is required'); return; }
    const newStream = editing.stream.trim();
    const classId = `${editing.form}${newStream}`;
    if (classes.some(c => c.id === classId && c.id !== editing.id)) { toast.error(`Class ${classId} already exists`); return; }
    const updated: SchoolClass = { id: classId, form: editing.form, stream: newStream, learningArea: editing.form >= 5 ? editing.learningArea : undefined, subjectIds: editing.subjectIds };
    if (editing.id) {
      const original = classes.find(c => c.id === editing.id);
      setClasses(classes.map(c => c.id === editing.id ? updated : c));
      // Propagate rename to student registrations
      if (original && (original.stream !== newStream || original.form !== editing.form)) {
        try {
          const { error, count } = await supabase
            .from('profiles')
            .update({ form: String(editing.form), stream: newStream }, { count: 'exact' })
            .eq('form', String(original.form))
            .eq('stream', original.stream);
          if (error) throw error;
          toast.success(`Class updated · ${count ?? 0} student(s) re-assigned`);
        } catch (e: any) {
          toast.error('Class saved, but failed to update students: ' + e.message);
        }
      } else {
        toast.success('Class updated');
      }
    }
    else { setClasses([...classes, updated]); toast.success('Class added'); }
    closeDialog();
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    setClasses(classes.filter(c => c.id !== deleteTarget.id));
    toast.success(`Class ${deleteTarget.id} removed`);
    setDeleteTarget(null);
  };

  const subjectsForForm = (form: FormLevel) => subjects.filter(s => s.forms.includes(form));

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Classes</h2>
            <p className="text-sm text-muted-foreground">Manage class streams and subject allocations</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={syncFromRegistrations} disabled={syncing}>
              <RefreshCw className={`w-4 h-4 mr-1 ${syncing ? 'animate-spin' : ''}`} /> Sync from Registrations
            </Button>
            <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add Class</Button>
          </div>
        </div>

        <div className="space-y-8">
          {formGroups.map(group => (
            <div key={group.form}>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">{group.label}</h3>
              {group.classes.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No classes yet — <button className="underline" onClick={openAdd}>add one</button></p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                  {group.classes.map(cls => (
                    <div key={cls.id} className="bg-card rounded-xl border p-4 group relative">
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(cls)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setDeleteTarget(cls)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center"><School className="w-4 h-4 text-primary" /></div>
                        <div>
                          <p className="text-sm font-semibold">{cls.id}</p>
                          {cls.learningArea && <p className="text-xs text-accent-foreground">{cls.learningArea}</p>}
                        </div>
                        {studentCounts[cls.id] && (
                          <span className="ml-auto flex items-center gap-1.5 text-xs">
                            <span className="flex items-center gap-1 bg-muted px-1.5 py-0.5 rounded text-muted-foreground" title="Total"><Users className="w-3 h-3" />{studentCounts[cls.id].total}</span>
                            <span className="bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded font-medium" title="Boys">♂ {studentCounts[cls.id].male}</span>
                            <span className="bg-pink-500/10 text-pink-600 px-1.5 py-0.5 rounded font-medium" title="Girls">♀ {studentCounts[cls.id].female}</span>
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {cls.subjectIds.map(sId => {
                          const subj = subjects.find(s => s.id === sId);
                          return subj ? <span key={sId} className="px-1.5 py-0.5 bg-muted text-muted-foreground text-[10px] rounded font-medium">{subj.code}</span> : null;
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <Dialog open={dialogOpen} onOpenChange={open => !open && closeDialog()}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing?.id ? 'Edit Class' : 'Add Class'}</DialogTitle></DialogHeader>
            {editing && (
              <div className="space-y-4 py-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Form Level</label>
                  <Select value={String(editing.form)} onValueChange={v => setEditing(prev => prev ? { ...prev, form: Number(v) as FormLevel, subjectIds: [] } : prev)} disabled={!!editing.id}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{FORMS.map(f => <SelectItem key={f} value={String(f)}>Form {f}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Stream / Class Name</label>
                  <Input placeholder="e.g. Grey, Blue, G1..." value={editing.stream} onChange={e => setEditing(prev => prev ? { ...prev, stream: e.target.value } : prev)} className="h-9" />
                  <p className="text-[10px] text-muted-foreground mt-1">Class ID: <span className="font-mono font-semibold">{editing.form}{editing.stream.trim() || '...'}</span></p>
                </div>
                {editing.form >= 5 && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Learning Area</label>
                    <Select value={editing.learningArea || ''} onValueChange={v => setEditing(prev => prev ? { ...prev, learningArea: v as LearningArea } : prev)}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select area..." /></SelectTrigger>
                      <SelectContent>{LEARNING_AREAS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-muted-foreground">Subjects</label>
                    <div className="flex gap-2">
                      <button className="text-[10px] text-primary hover:underline" onClick={() => setEditing(prev => prev ? { ...prev, subjectIds: subjectsForForm(prev.form).map(s => s.id) } : prev)}>Select all</button>
                      <button className="text-[10px] text-muted-foreground hover:underline" onClick={() => setEditing(prev => prev ? { ...prev, subjectIds: [] } : prev)}>Clear</button>
                    </div>
                  </div>
                  <div className="border rounded-md p-3 space-y-2 max-h-52 overflow-y-auto bg-muted/20">
                    {subjectsForForm(editing.form).length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No subjects for Form {editing.form}.</p>
                    ) : (
                      subjectsForForm(editing.form).map(subj => (
                        <label key={subj.id} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox checked={editing.subjectIds.includes(subj.id)} onCheckedChange={() => toggleSubject(subj.id)} />
                          <span className="text-sm">{subj.name}</span>
                          <span className="text-[10px] text-muted-foreground font-mono ml-auto">{subj.code}</span>
                        </label>
                      ))
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{editing.subjectIds.length} subject(s) selected</p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button onClick={handleSave}><Check className="w-4 h-4 mr-1" />{editing?.id ? 'Save' : 'Add Class'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Delete Class</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Are you sure you want to remove <span className="font-semibold text-foreground">{deleteTarget?.id}</span>?</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete}><Trash2 className="w-4 h-4 mr-1" /> Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
