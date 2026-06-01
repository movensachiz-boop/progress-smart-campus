import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useTimetable } from '@/context/TimetableContext';
import { Subject, FormLevel, LearningArea } from '@/types/school';
import { v4 } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, BookOpen, Search, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminSubjects() {
  const { subjects, setSubjects } = useTimetable();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Subject | null>(null);
  const [form, setForm] = useState({
    name: '', code: '', forms: [] as FormLevel[], learningAreas: [] as LearningArea[],
    periodsPerWeek: 4, isCompulsory: false,
  });

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', code: '', forms: [], learningAreas: [], periodsPerWeek: 4, isCompulsory: false });
    setDialogOpen(true);
  };

  const openEdit = (s: Subject) => {
    setEditing(s);
    setForm({ name: s.name, code: s.code, forms: [...s.forms], learningAreas: s.learningAreas ? [...s.learningAreas] : [], periodsPerWeek: s.periodsPerWeek, isCompulsory: s.isCompulsory });
    setDialogOpen(true);
  };

  const save = () => {
    if (!form.name || !form.code) { toast.error('Name and code are required'); return; }
    if (form.forms.length === 0) { toast.error('Select at least one form'); return; }
    // Check for duplicate code
    if (subjects.some(s => s.code === form.code && s.id !== editing?.id)) {
      toast.error(`Subject code "${form.code}" already exists`);
      return;
    }
    const subjectData: Subject = {
      id: editing?.id || v4(), name: form.name, code: form.code, forms: form.forms,
      learningAreas: form.learningAreas.length > 0 ? form.learningAreas : undefined,
      periodsPerWeek: form.periodsPerWeek, isCompulsory: form.isCompulsory,
    };
    if (editing) {
      setSubjects(subjects.map(s => s.id === editing.id ? subjectData : s));
      toast.success(`${form.name} updated`);
    } else {
      setSubjects([...subjects, subjectData]);
      toast.success(`${form.name} added`);
    }
    setDialogOpen(false);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    setSubjects(subjects.filter(x => x.id !== deleteTarget.id));
    toast.success(`${deleteTarget.name} removed`);
    setDeleteTarget(null);
  };

  const toggleForm = (fl: FormLevel) => {
    setForm(f => ({ ...f, forms: f.forms.includes(fl) ? f.forms.filter(x => x !== fl) : [...f.forms, fl] }));
  };

  const toggleArea = (a: LearningArea) => {
    setForm(f => ({ ...f, learningAreas: f.learningAreas.includes(a) ? f.learningAreas.filter(x => x !== a) : [...f.learningAreas, a] }));
  };

  const filtered = subjects.filter(s =>
    !search || `${s.name} ${s.code}`.toLowerCase().includes(search.toLowerCase())
  );
  const lower = filtered.filter(s => s.forms.some(f => f <= 4));
  const upper = filtered.filter(s => s.forms.some(f => f >= 5));

  const SubjectCard = ({ s, variant }: { s: Subject; variant: 'primary' | 'accent' }) => (
    <div className="bg-card rounded-xl border p-4 flex items-center justify-between group hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-md flex items-center justify-center ${variant === 'primary' ? 'bg-primary/10' : 'bg-accent/10'}`}>
          <BookOpen className={`w-3.5 h-3.5 ${variant === 'primary' ? 'text-primary' : 'text-accent-foreground'}`} />
        </div>
        <div>
          <p className="text-sm font-medium">{s.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{s.code}</Badge>
            <span className="text-[10px] text-muted-foreground">{s.periodsPerWeek}/wk</span>
            {s.isCompulsory && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">Core</Badge>}
          </div>
          <div className="flex gap-0.5 mt-1">
            {s.forms.sort().map(f => (
              <span key={f} className="w-5 h-5 text-[10px] rounded bg-muted flex items-center justify-center text-muted-foreground">{f}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => openEdit(s)} className="p-1.5 rounded-md hover:bg-muted"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button>
        <button onClick={() => setDeleteTarget(s)} className="p-1.5 rounded-md hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
      </div>
    </div>
  );

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Subjects</h2>
            <p className="text-sm text-muted-foreground">{subjects.length} subjects · ZIMSEC-aligned</p>
          </div>
          <Button onClick={openNew} size="sm"><Plus className="w-4 h-4 mr-1" /> Add Subject</Button>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search subjects..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>

        {filtered.length === 0 ? (
          <p className="text-center py-12 text-muted-foreground">No subjects found</p>
        ) : (
          <div className="space-y-6">
            {lower.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">O-Level (Form 1–4) · {lower.length}</h3>
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {lower.map(s => <SubjectCard key={s.id} s={s} variant="primary" />)}
                </div>
              </div>
            )}
            {upper.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">A-Level (Form 5–6) · {upper.length}</h3>
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {upper.map(s => <SubjectCard key={s.id} s={s} variant="accent" />)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? 'Edit Subject' : 'Add Subject'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground">Name</label>
                  <Input className="mt-1" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Mathematics" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Code</label>
                  <Input className="mt-1" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="MATH" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Periods/Week</label>
                  <Input type="number" className="mt-1" min={1} max={10} value={form.periodsPerWeek} onChange={e => setForm(f => ({ ...f, periodsPerWeek: Number(e.target.value) }))} />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.isCompulsory} onChange={e => setForm(f => ({ ...f, isCompulsory: e.target.checked }))} className="rounded" />
                    Compulsory
                  </label>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-2 block">Forms</label>
                <div className="flex gap-1.5">
                  {([1,2,3,4,5,6] as FormLevel[]).map(fl => (
                    <button key={fl} onClick={() => toggleForm(fl)}
                      className={`w-10 h-10 text-sm rounded-md border transition-colors ${form.forms.includes(fl) ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border'}`}
                    >{fl}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-2 block">Learning Areas (A-Level)</label>
                <div className="flex gap-1.5">
                  {(['Sciences','Commercials','Arts'] as LearningArea[]).map(a => (
                    <button key={a} onClick={() => toggleArea(a)}
                      className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${form.learningAreas.includes(a) ? 'bg-accent text-accent-foreground border-accent' : 'bg-muted text-muted-foreground border-border'}`}
                    >{a}</button>
                  ))}
                </div>
              </div>
              <Button onClick={save} className="w-full">{editing ? 'Update' : 'Add'} Subject</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" /> Delete Subject</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete <span className="font-semibold text-foreground">{deleteTarget?.name}</span> ({deleteTarget?.code})? This will also remove it from any teacher assignments and class allocations.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
