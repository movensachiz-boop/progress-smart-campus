import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Users } from 'lucide-react';
import { TimetableSlot, Subject, Teacher, SchoolClass } from '@/types/school';
import { formatSubjectName, resolveLearningArea, isSubjectAllowedInALevelArea } from '@/lib/timetableUtils';

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
  const [pairedSubjectId, setPairedSubjectId] = useState<string>('');
  const [pairedTeacherId, setPairedTeacherId] = useState<string>('');

  useEffect(() => {
    if (slot) {
      setSubjectId(slot.subjectId || '');
      setTeacherId(slot.teacherId || '');
      setCombined(slot.combinedClassIds || []);
      setPairedSubjectId(slot.pairedSubjectId || '');
      setPairedTeacherId(slot.pairedTeacherId || '');
    }
  }, [slot]);

  const cls = classes.find(c => c.id === slot?.classId);

  const availableSubjects = useMemo(() => {
    if (!cls) return subjects;
    const inClass = subjects.filter(s => cls.subjectIds.includes(s.id));
    if (cls.form !== 5 && cls.form !== 6) return inClass;
    const area = resolveLearningArea(cls);
    return inClass.filter(s => isSubjectAllowedInALevelArea(s, area));
  }, [cls, subjects]);


  const availableTeachers = useMemo(() => {
    if (!subjectId) return [];
    return teachers.filter(t => t.assignments.some(a => a.subjectId === subjectId && (!cls || a.classIds.includes(cls.id))));
  }, [subjectId, teachers, cls]);

  const availablePairedSubjects = useMemo(() => {
    return availableSubjects.filter(s => s.id !== subjectId);
  }, [availableSubjects, subjectId]);

  const availablePairedTeachers = useMemo(() => {
    if (!pairedSubjectId) return [];
    return teachers.filter(t => t.assignments.some(a => a.subjectId === pairedSubjectId && (!cls || a.classIds.includes(cls.id))));
  }, [pairedSubjectId, teachers, cls]);

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

  // Pending propagation confirmation for A-level subject swaps
  const [pendingPropagation, setPendingPropagation] = useState<{
    fromId: string; toId: string; affected: TimetableSlot[];
    updates: Partial<TimetableSlot>; combinedClassIds: string[];
  } | null>(null);

  const aLevelClassIds = useMemo(
    () => new Set(classes.filter(c => c.form === 5 || c.form === 6).map(c => c.id)),
    [classes]
  );

  const applySave = (updates: Partial<TimetableSlot>, combinedClassIds: string[]) => {
    if (!slot) return;
    onSave(slot.id, updates, combinedClassIds);
  };

  const handleSave = () => {
    if (!slot) return;
    const cleanSubject = subjectId && subjectId !== '__none' ? subjectId : undefined;
    const cleanTeacher = teacherId && teacherId !== '__none' ? teacherId : undefined;
    const cleanPairedSubject = pairedSubjectId && pairedSubjectId !== '__none' ? pairedSubjectId : undefined;
    const cleanPairedTeacher = pairedTeacherId && pairedTeacherId !== '__none' ? pairedTeacherId : undefined;
    const updates: Partial<TimetableSlot> = {
      subjectId: cleanSubject,
      teacherId: cleanTeacher,
      combinedClassIds: combined,
      pairedSubjectId: cleanPairedSubject,
      pairedTeacherId: cleanPairedSubject ? cleanPairedTeacher : undefined,
    };

    // A-level auto-propagation: if the slot is Form 5/6 and the subject changed,
    // ask permission to update every other A-level slot currently showing the old subject.
    const originalSubjectId = slot.subjectId;
    if (
      aLevelClassIds.has(slot.classId) &&
      originalSubjectId &&
      cleanSubject &&
      originalSubjectId !== cleanSubject
    ) {
      const affected = allSlots.filter(s =>
        s.id !== slot.id &&
        s.subjectId === originalSubjectId &&
        aLevelClassIds.has(s.classId)
      );
      if (affected.length > 0) {
        setPendingPropagation({
          fromId: originalSubjectId,
          toId: cleanSubject,
          affected,
          updates,
          combinedClassIds: combined,
        });
        return;
      }
    }

    applySave(updates, combined);
    onOpenChange(false);
  };

  const confirmPropagate = (alsoOthers: boolean) => {
    if (!pendingPropagation) return;
    applySave(pendingPropagation.updates, pendingPropagation.combinedClassIds);
    if (alsoOthers) {
      for (const s of pendingPropagation.affected) {
        onSave(s.id, { subjectId: pendingPropagation.toId, teacherId: undefined, pairedSubjectId: undefined, pairedTeacherId: undefined }, s.combinedClassIds || []);
      }
    }
    setPendingPropagation(null);
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
                {availableSubjects.map(s => <SelectItem key={s.id} value={s.id}>{s.code} — {formatSubjectName(s, cls?.form)}</SelectItem>)}
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

          <div className="space-y-2 border-t pt-3">
            <Label>Parallel / Alternative Subject <span className="text-[11px] text-muted-foreground font-normal">(optional — displays as "SUB1/SUB2")</span></Label>
            <Select value={pairedSubjectId || '__none'} onValueChange={(v) => { setPairedSubjectId(v === '__none' ? '' : v); setPairedTeacherId(''); }} disabled={!subjectId || subjectId === '__none'}>
              <SelectTrigger><SelectValue placeholder="Select a second subject" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— None —</SelectItem>
                {availablePairedSubjects.map(s => <SelectItem key={s.id} value={s.id}>{s.code} — {formatSubjectName(s, cls?.form)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {pairedSubjectId && (
            <div className="space-y-2">
              <Label>Parallel Subject Teacher</Label>
              <Select value={pairedTeacherId || '__none'} onValueChange={(v) => setPairedTeacherId(v === '__none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder={availablePairedTeachers.length ? 'Select teacher' : 'No teachers assigned'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— None —</SelectItem>
                  {availablePairedTeachers.map(t => <SelectItem key={t.id} value={t.id}>{t.title} {t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

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

      {/* A-Level propagation confirmation */}
      <Dialog open={!!pendingPropagation} onOpenChange={(o) => !o && setPendingPropagation(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-accent-foreground" /> Apply change everywhere?</DialogTitle></DialogHeader>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              You changed this slot from{' '}
              <span className="font-semibold text-foreground">{subjects.find(s => s.id === pendingPropagation?.fromId)?.code}</span>{' '}
              to{' '}
              <span className="font-semibold text-foreground">{subjects.find(s => s.id === pendingPropagation?.toId)?.code}</span>.
            </p>
            <p>
              There are <span className="font-semibold text-foreground">{pendingPropagation?.affected.length}</span> other A-level slot(s) still showing the old subject. Apply the same change to all of them?
            </p>
            <p className="text-[11px]">Teachers on the propagated slots will be cleared so you can re-assign them.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => confirmPropagate(false)}>Only this slot</Button>
            <Button onClick={() => confirmPropagate(true)}>Apply to all A-Level</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

