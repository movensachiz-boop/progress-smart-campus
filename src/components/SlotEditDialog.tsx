import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Users, Wand2 } from 'lucide-react';
import { TimetableSlot, Subject, Teacher, SchoolClass, DayOfWeek } from '@/types/school';
import { formatSubjectName, resolveLearningArea, isSubjectAllowedInALevelArea } from '@/lib/timetableUtils';
import { loadDoubleSettings, resolveClassRule } from '@/lib/doubleSettings';
import { DAYS } from '@/data/defaults';

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

  /* ---------------- Placement suggestions ---------------- */

  // How many consecutive periods this subject needs in this class.
  const blockLength = useMemo(() => {
    if (!cls) return 1;
    const s = loadDoubleSettings();
    const isALevel = cls.form === 5 || cls.form === 6;
    if (isALevel) return Math.max(2, s.aLevelDoubleLength || 2);
    const rule = resolveClassRule(s, cls.id, cls.form);
    if (rule && !rule.enabled) return 1;
    if (rule && rule.subjectIds.length && subjectId && !rule.subjectIds.includes(subjectId)) return 1;
    const perSubject = subjectId ? s.subjectDoubleLength?.[subjectId] : 0;
    if (rule && rule.length) return Math.max(2, rule.length);
    if (perSubject) return Math.max(2, perSubject);
    if (subjectId && s.subjectDoubleIds?.includes(subjectId)) return Math.max(2, s.oLevelDoubleLength || 2);
    if (cls.subjectDoubles?.includes(subjectId)) return Math.max(2, s.oLevelDoubleLength || 2);
    if (!s.oLevelDoubles) return 1;
    return Math.max(2, s.oLevelDoubleLength || 2);
  }, [cls, subjectId]);

  const classSlots = useMemo(
    () => allSlots.filter(s => s.classId === slot?.classId),
    [allSlots, slot?.classId]
  );

  // The contiguous run of slots currently holding this subject (starting at the edited slot).
  const currentBlock = useMemo(() => {
    if (!slot) return [];
    const day = classSlots.filter(s => s.day === slot.day).sort((a, b) => a.period - b.period);
    const idx = day.findIndex(s => s.id === slot.id);
    if (idx < 0) return [slot];
    const run = [day[idx]];
    for (let i = idx + 1; i < day.length && run.length < blockLength; i++) {
      if (day[i].type === 'lesson' && day[i].subjectId === slot.subjectId && slot.subjectId) run.push(day[i]);
      else break;
    }
    return run;
  }, [slot, classSlots, blockLength]);

  type Suggestion = { day: DayOfWeek; startPeriod: number; targets: TimetableSlot[]; note: string };

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!slot || !cls) return [];
    const subj = subjectId && subjectId !== '__none' ? subjectId : undefined;
    if (!subj) return [];
    const currentIds = new Set(currentBlock.map(s => s.id));
    const out: Suggestion[] = [];
    for (const day of DAYS) {
      const daySlots = classSlots.filter(s => s.day === day).sort((a, b) => a.period - b.period);
      // Skip days where this subject already sits outside the block being moved.
      const alreadyToday = daySlots.some(s => s.subjectId === subj && !currentIds.has(s.id));
      for (let i = 0; i + blockLength <= daySlots.length; i++) {
        const targets = daySlots.slice(i, i + blockLength);
        if (targets.some(t => t.type !== 'lesson')) continue;
        // consecutive periods only
        if (targets.some((t, k) => t.period !== targets[0].period + k)) continue;
        if (targets.every(t => currentIds.has(t.id))) continue;
        if (targets.some(t => currentIds.has(t.id))) continue;
        if (alreadyToday) continue;
        // teacher must be free across the whole block
        if (teacherId && teacherId !== '__none') {
          const busy = targets.some(t => allSlots.some(s =>
            s.classId !== cls.id && s.teacherId === teacherId && s.day === t.day && s.period === t.period
          ));
          if (busy) continue;
        }
        const freeCount = targets.filter(t => !t.subjectId).length;
        out.push({
          day,
          startPeriod: targets[0].period,
          targets,
          note: freeCount === targets.length
            ? 'Free block'
            : `Swaps with ${Array.from(new Set(targets.map(t => subjects.find(x => x.id === t.subjectId)?.code).filter(Boolean))).join(', ') || 'existing lesson'}`,
        });
        if (out.length >= 40) break;
      }
    }
    // free blocks first
    return out.sort((a, b) => (a.note === 'Free block' ? 0 : 1) - (b.note === 'Free block' ? 0 : 1)).slice(0, 8);
  }, [slot, cls, subjectId, teacherId, classSlots, allSlots, blockLength, currentBlock, subjects]);

  const applySuggestion = (sg: Suggestion) => {
    if (!slot) return;
    const cleanSubject = subjectId && subjectId !== '__none' ? subjectId : undefined;
    const cleanTeacher = teacherId && teacherId !== '__none' ? teacherId : undefined;
    const displaced = sg.targets.map(t => ({ subjectId: t.subjectId, teacherId: t.teacherId }));
    // Put the subject into the suggested block
    sg.targets.forEach(t => {
      onSave(t.id, {
        subjectId: cleanSubject,
        teacherId: cleanTeacher,
        combinedClassIds: [],
        pairedSubjectId: undefined,
        pairedTeacherId: undefined,
      }, []);
    });
    // Move whatever was there back into the slots being vacated
    currentBlock.forEach((s, i) => {
      const d = displaced[i] || { subjectId: undefined, teacherId: undefined };
      onSave(s.id, {
        subjectId: d.subjectId,
        teacherId: d.teacherId,
        combinedClassIds: [],
        pairedSubjectId: undefined,
        pairedTeacherId: undefined,
      }, []);
    });
    onOpenChange(false);
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

