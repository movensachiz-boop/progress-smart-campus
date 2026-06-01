import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useTimetable } from '@/context/TimetableContext';
import { Teacher, FormLevel, TeacherClassAssignment } from '@/types/school';
import { v4 } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Users, Search, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminTeachers() {
  const { teachers, setTeachers, subjects, classes } = useTimetable();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Teacher | null>(null);
  const [form, setForm] = useState({
    name: '', title: 'Mr.', subjectIds: [] as string[],
    assignments: [] as TeacherClassAssignment[],
    forms: [] as FormLevel[], maxPeriodsPerWeek: 28,
  });

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', title: 'Mr.', subjectIds: [], assignments: [], forms: [], maxPeriodsPerWeek: 28 });
    setDialogOpen(true);
  };

  const openEdit = (t: Teacher) => {
    setEditing(t);
    setForm({
      name: t.name, title: t.title, subjectIds: [...t.subjectIds],
      assignments: t.assignments.map(a => ({ ...a, classIds: [...a.classIds] })),
      forms: [...t.forms], maxPeriodsPerWeek: t.maxPeriodsPerWeek,
    });
    setDialogOpen(true);
  };

  const save = () => {
    if (!form.name) { toast.error('Name is required'); return; }
    if (form.forms.length === 0) { toast.error('Select at least one form'); return; }
    if (form.subjectIds.length === 0) { toast.error('Select at least one subject'); return; }
    const teacherData: Teacher = { id: editing?.id || v4(), ...form };
    if (editing) {
      setTeachers(teachers.map(t => t.id === editing.id ? teacherData : t));
      toast.success(`${form.title} ${form.name} updated`);
    } else {
      setTeachers([...teachers, teacherData]);
      toast.success(`${form.title} ${form.name} added`);
    }
    setDialogOpen(false);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    setTeachers(teachers.filter(x => x.id !== deleteTarget.id));
    toast.success(`${deleteTarget.title} ${deleteTarget.name} removed`);
    setDeleteTarget(null);
  };

  const toggleSubject = (sId: string) => {
    setForm(f => {
      const has = f.subjectIds.includes(sId);
      const newSubjectIds = has ? f.subjectIds.filter(s => s !== sId) : [...f.subjectIds, sId];
      const newAssignments = has
        ? f.assignments.filter(a => a.subjectId !== sId)
        : [...f.assignments, { subjectId: sId, classIds: [] }];
      return { ...f, subjectIds: newSubjectIds, assignments: newAssignments };
    });
  };

  const toggleForm = (fl: FormLevel) => {
    setForm(f => ({ ...f, forms: f.forms.includes(fl) ? f.forms.filter(x => x !== fl) : [...f.forms, fl] }));
  };

  const toggleClassForSubject = (subjectId: string, classId: string) => {
    setForm(f => ({
      ...f,
      assignments: f.assignments.map(a =>
        a.subjectId === subjectId
          ? { ...a, classIds: a.classIds.includes(classId) ? a.classIds.filter(c => c !== classId) : [...a.classIds, classId] }
          : a
      ),
    }));
  };

  const selectAllClassesForSubject = (subjectId: string) => {
    const subj = subjects.find(s => s.id === subjectId);
    if (!subj) return;
    const relevantClassIds = classes.filter(c => form.forms.includes(c.form) && subj.forms.includes(c.form)).map(c => c.id);
    setForm(f => ({
      ...f,
      assignments: f.assignments.map(a =>
        a.subjectId === subjectId ? { ...a, classIds: [...relevantClassIds] } : a
      ),
    }));
  };

  const clearAllClassesForSubject = (subjectId: string) => {
    setForm(f => ({
      ...f,
      assignments: f.assignments.map(a =>
        a.subjectId === subjectId ? { ...a, classIds: [] } : a
      ),
    }));
  };

  const relevantClasses = classes.filter(c => form.forms.includes(c.form));

  const filtered = teachers.filter(t =>
    !search || `${t.title} ${t.name} ${t.subjectIds.map(sId => subjects.find(s => s.id === sId)?.code).join(' ')}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Teachers</h2>
            <p className="text-sm text-muted-foreground">{teachers.length} teachers · Manage staff and class assignments</p>
          </div>
          <Button onClick={openNew} size="sm"><Plus className="w-4 h-4 mr-1" /> Add Teacher</Button>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search teachers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>

        {filtered.length === 0 ? (
          <p className="text-center py-12 text-muted-foreground">No teachers found</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map(t => (
              <div key={t.id} className="bg-card rounded-xl border p-4 flex items-start justify-between group hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{t.title} {t.name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {t.subjectIds.map(sId => {
                        const subj = subjects.find(s => s.id === sId);
                        return subj ? <Badge key={sId} variant="secondary" className="text-[10px] px-1.5 py-0">{subj.code}</Badge> : null;
                      })}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                      <span>Forms: {t.forms.sort().join(', ')}</span>
                      <span>·</span>
                      <span>Max: {t.maxPeriodsPerWeek}/wk</span>
                    </div>
                    {t.assignments.some(a => a.classIds.length > 0) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {t.assignments.map(a => {
                          const subj = subjects.find(s => s.id === a.subjectId);
                          return a.classIds.length > 0 ? (
                            <span key={a.subjectId} className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent-foreground">
                              {subj?.code}: {a.classIds.join(', ')}
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => openEdit(t)} className="p-1.5 rounded-md hover:bg-muted"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={() => setDeleteTarget(t)} className="p-1.5 rounded-md hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? 'Edit Teacher' : 'Add Teacher'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Title</label>
                  <select className="w-full mt-1 px-3 py-2 border rounded-md text-sm bg-background" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}>
                    <option>Mr.</option><option>Mrs.</option><option>Ms.</option><option>Dr.</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground">Full Name</label>
                  <Input className="mt-1" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. John Moyo" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Max Periods/Week</label>
                <Input type="number" className="mt-1 w-32" min={1} max={40} value={form.maxPeriodsPerWeek} onChange={e => setForm(f => ({ ...f, maxPeriodsPerWeek: Number(e.target.value) }))} />
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
                <label className="text-xs text-muted-foreground mb-2 block">Subjects</label>
                <div className="flex flex-wrap gap-1.5">
                  {subjects.map(s => (
                    <button key={s.id} onClick={() => toggleSubject(s.id)}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${form.subjectIds.includes(s.id) ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:border-primary/50'}`}
                    >{s.code}</button>
                  ))}
                </div>
              </div>
              {form.assignments.length > 0 && relevantClasses.length > 0 && (
                <div className="space-y-3">
                  <label className="text-xs text-muted-foreground block font-semibold">Class Assignments per Subject</label>
                  {form.assignments.map(assignment => {
                    const subj = subjects.find(s => s.id === assignment.subjectId);
                    if (!subj) return null;
                    const classesForSubject = relevantClasses.filter(c => subj.forms.includes(c.form));
                    if (classesForSubject.length === 0) return null;
                    return (
                      <div key={assignment.subjectId} className="p-3 rounded-lg border bg-muted/30">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-medium">{subj.name} ({subj.code})</p>
                          <div className="flex gap-1">
                            <button onClick={() => selectAllClassesForSubject(assignment.subjectId)} className="text-[10px] text-primary hover:underline">All</button>
                            <span className="text-[10px] text-muted-foreground">·</span>
                            <button onClick={() => clearAllClassesForSubject(assignment.subjectId)} className="text-[10px] text-muted-foreground hover:underline">None</button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {classesForSubject.map(cls => (
                            <button key={cls.id} onClick={() => toggleClassForSubject(assignment.subjectId, cls.id)}
                              className={`px-2 py-0.5 text-xs rounded border transition-colors ${assignment.classIds.includes(cls.id) ? 'bg-accent text-accent-foreground border-accent' : 'bg-background text-muted-foreground border-border hover:border-accent/50'}`}
                            >{cls.id}</button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <Button onClick={save} className="w-full">{editing ? 'Update' : 'Add'} Teacher</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" /> Delete Teacher</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to remove <span className="font-semibold text-foreground">{deleteTarget?.title} {deleteTarget?.name}</span>? This will unassign them from all classes and timetable slots.
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
