import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Users } from 'lucide-react';
import { TimetableSlot, Subject, Teacher, SchoolClass } from '@/types/school';

interface SlotEditDialogProps {
  slot: TimetableSlot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjects: Subject[];
  teachers: Teacher[];
  classes: SchoolClass[];
  onSave: (slotId: string, updates: Partial<TimetableSlot>, combinedClassIds?: string[]) => void;
  allSlots: TimetableSlot[];
}

export default function SlotEditDialog({
  slot, open, onOpenChange, subjects, teachers, classes, onSave, allSlots,
}: SlotEditDialogProps) {
  const [subjectId, setSubjectId] = useState<string>('');
  const [teacherId, setTeacherId] = useState<string>('');
  const [combined, setCombined] = useState<string[]>([]);

  useEffect(() => {
    if (slot) {
      setSubjectId(slot.subjectId || '');
      setTeacherId(slot.teacherId || '');
      setCombined(slot.combinedClassIds || []);
    }
  }, [slot]);

  const cls = classes.find(c => c.id === slot?.classId);

  const availableSubjects = useMemo(() => {
    if (!cls) return subjects;
    return subjects.filter(s => cls.subjectIds.includes(s.id));
  }, [cls, subjects]);

  const availableTeachers = useMemo(() => {
    if (!subjectId) return [];
    return teachers.filter(t => t.assignments.some(a => a.subjectId === subjectId && (!cls || a.classIds.includes(cls.id))));
  }, [subjectId, teachers, cls]);

  // Other classes the chosen teacher also teaches this subject to (eligible for combining)
  const combinableClasses = useMemo(() => {
    if (!teacherId || !subjectId || !cls) return [];
    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) return [];
    const assignment = teacher.assignments.find(a => a.subjectId === subjectId);
    if (!assignment) return [];
    return classes.filter(c => c.id !== cls.id && assignment.classIds.includes(c.id));
  }, [teacherId, subjectId, cls, teachers, classes]);

  const conflict = useMemo(() => {
    if (!slot || !teacherId) return null;
    const clashing = allSlots.find(s =>
      s.id !== slot.id && s.teacherId === teacherId && s.day === slot.day && s.period === slot.period
      && !combined.includes(s.classId) // ignore intentionally combined sibling
    );
    if (clashing) {
      const teacher = teachers.find(t => t.id === teacherId);
      const clashClass = classes.find(c => c.id === clashing.classId);
      return `${teacher?.name} is already teaching ${clashClass?.id || 'another class'} at this time`;
    }
    return null;
  }, [slot, teacherId, allSlots, teachers, classes, combined]);

  const toggleCombined = (id: string) => {
    setCombined(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]);
  };

  const handleSave = () => {
    if (!slot) return;
    const cleanSubject = subjectId && subjectId !== '__none' ? subjectId : undefined;
    const cleanTeacher = teacherId && teacherId !== '__none' ? teacherId : undefined;
    onSave(
      slot.id,
      { subjectId: cleanSubject, teacherId: cleanTeacher, combinedClassIds: combined },
      combined,
    );
    onOpenChange(false);
  };

  if (!slot) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Slot — {slot.day} Period {slot.period}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">Class: <span className="font-semibold text-foreground">{slot.classId}</span></p>
          <div className="space-y-2">
            <Label>Subject</Label>
            <Select value={subjectId} onValueChange={(v) => { setSubjectId(v); setTeacherId(''); setCombined([]); }}>
              <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Free —</SelectItem>
                {availableSubjects.map(s => <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Teacher</Label>
            <Select value={teacherId} onValueChange={(v) => { setTeacherId(v); setCombined([]); }} disabled={!subjectId || subjectId === '__none'}>
              <SelectTrigger><SelectValue placeholder={availableTeachers.length ? 'Select teacher' : 'No teachers assigned'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— None —</SelectItem>
                {availableTeachers.map(t => <SelectItem key={t.id} value={t.id}>{t.title} {t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {combinableClasses.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Combine with other classes</Label>
              <p className="text-[11px] text-muted-foreground">Classes taught together by this teacher in the same period</p>
              <div className="flex flex-wrap gap-1.5">
                {combinableClasses.map(c => (
                  <button key={c.id} type="button" onClick={() => toggleCombined(c.id)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${combined.includes(c.id) ? 'bg-accent text-accent-foreground border-accent' : 'bg-muted text-muted-foreground border-border hover:border-accent/50'}`}
                  >{c.id}</button>
                ))}
              </div>
              {combined.length > 0 && (
                <p className="text-[11px] text-accent-foreground bg-accent/20 rounded px-2 py-1">
                  Combined period — {combined.length} other class{combined.length > 1 ? 'es' : ''} will share this slot
                </p>
              )}
            </div>
          )}

          {conflict && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /><span>{conflict}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
