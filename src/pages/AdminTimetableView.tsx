import { useState, useMemo } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useTimetable } from '@/context/TimetableContext';
import { DAYS } from '@/data/defaults';
import { DayOfWeek, TimetableSlot } from '@/types/school';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, AlertTriangle, Pencil, Eraser, RotateCcw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import SlotEditDialog from '@/components/SlotEditDialog';
import { toast } from 'sonner';

export default function AdminTimetableView() {
  const { timetable, classes, subjects, teachers, config, updateSlot, generateTimetable } = useTimetable();
  const [viewMode, setViewMode] = useState<'class' | 'teacher'>('class');
  const [selectedId, setSelectedId] = useState<string>('');
  const [editSlot, setEditSlot] = useState<TimetableSlot | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);

  const totalSlots = config.periodsPerDay + 2;
  const periods = Array.from({ length: totalSlots }, (_, i) => i + 1);

  const getPeriodTime = (period: number): string => {
    const breakSlot = config.morningBreakAfterPeriod + 1;
    const lunchSlot = config.lunchAfterPeriod + 2;
    const [startH, startM] = config.startTime.split(':').map(Number);
    let minutes = startH * 60 + startM;
    for (let p = 1; p < period; p++) {
      if (p === breakSlot) minutes += config.morningBreakDuration;
      else if (p === lunchSlot) minutes += config.lunchDuration;
      else minutes += config.periodDuration;
    }
    const durMin = period === breakSlot ? config.morningBreakDuration : period === lunchSlot ? config.lunchDuration : config.periodDuration;
    const fmt = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    return `${fmt(minutes)} – ${fmt(minutes + durMin)}`;
  };

  const classOptions = [...classes].sort((a, b) => a.form - b.form || a.stream.localeCompare(b.stream)).map(c => ({ value: c.id, label: `${c.form}${c.stream}` }));
  const teacherOptions = teachers.map(t => ({ value: t.id, label: `${t.title} ${t.name}` }));

  const filteredSlots = useMemo(() => {
    if (!timetable || !selectedId) return [];
    return viewMode === 'class' ? timetable.slots.filter(s => s.classId === selectedId) : timetable.slots.filter(s => s.teacherId === selectedId);
  }, [timetable, selectedId, viewMode]);

  const getSlot = (day: DayOfWeek, period: number) => filteredSlots.find(s => s.day === day && s.period === period);

  const getSlotDisplay = (day: DayOfWeek, period: number) => {
    const slot = getSlot(day, period);
    if (!slot) return null;
    if (slot.type === 'break') return { label: 'BREAK', className: 'bg-warning/20 text-warning-foreground', editable: false };
    if (slot.type === 'lunch') return { label: 'LUNCH', className: 'bg-warning/20 text-warning-foreground', editable: false };
    if (slot.type === 'sports') return { label: 'SPORTS', className: 'bg-success/20 text-success', editable: false };
    const subject = subjects.find(s => s.id === slot.subjectId);
    const teacher = teachers.find(t => t.id === slot.teacherId);
    const isConflict = timetable?.conflicts.some(c => c.slots.includes(slot.id));
    return {
      label: subject?.code || 'Free',
      sublabel: viewMode === 'class' ? teacher?.name : classes.find(c => c.id === slot.classId)?.id,
      className: isConflict ? 'bg-destructive/20 text-destructive border border-destructive/30' : subject ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
      isConflict, editable: true,
      combinedCount: slot.combinedClassIds?.length || 0,
    };
  };

  const handleSlotClick = (day: DayOfWeek, period: number) => {
    const slot = getSlot(day, period);
    if (slot && slot.type === 'lesson') setEditSlot(slot);
  };

  const handleSlotSave = (slotId: string, updates: Partial<TimetableSlot>, combinedClassIds?: string[]) => {
    const cleaned = { ...updates };
    if (cleaned.subjectId === '__none') cleaned.subjectId = undefined;
    if (cleaned.teacherId === '__none') cleaned.teacherId = undefined;
    updateSlot(slotId, cleaned, combinedClassIds);
    toast.success(combinedClassIds && combinedClassIds.length > 0 ? `Slot updated — combined with ${combinedClassIds.length} class(es)` : 'Slot updated');
  };

  const handleClearSlot = (day: DayOfWeek, period: number) => {
    const slot = getSlot(day, period);
    if (slot && slot.type === 'lesson') {
      updateSlot(slot.id, { subjectId: undefined, teacherId: undefined });
      toast.success('Slot cleared');
    }
  };

  const handleRegenerate = () => {
    generateTimetable();
    setClearConfirm(false);
    toast.success('Timetable regenerated');
  };

  // Stats
  const filledSlots = filteredSlots.filter(s => s.type === 'lesson' && s.subjectId).length;
  const totalLessonSlots = filteredSlots.filter(s => s.type === 'lesson').length;
  const conflictCount = timetable?.conflicts.length || 0;

  if (!timetable) {
    return (
      <DashboardLayout role="admin">
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-foreground">View Timetable</h2>
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Calendar className="w-16 h-16 mb-4 opacity-30" />
            <p>No timetable generated yet</p>
            <p className="text-xs mt-1">Go to Timetable → Generate to create one</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">View Timetable</h2>
            <p className="text-sm text-muted-foreground">Click any lesson cell to edit · Right-click to clear</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setClearConfirm(true)} className="gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" /> Regenerate
          </Button>
        </div>

        <Tabs value={viewMode} onValueChange={v => { setViewMode(v as 'class' | 'teacher'); setSelectedId(''); }}>
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            <TabsList>
              <TabsTrigger value="class">By Class</TabsTrigger>
              <TabsTrigger value="teacher">By Teacher</TabsTrigger>
            </TabsList>
            <select
              className="px-3 py-2 border rounded-md text-sm bg-background min-w-[180px]"
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
            >
              <option value="">Select {viewMode === 'class' ? 'class' : 'teacher'}...</option>
              {(viewMode === 'class' ? classOptions : teacherOptions).map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {selectedId && (
              <div className="flex gap-2 ml-auto">
                <Badge variant="secondary">{filledSlots}/{totalLessonSlots} filled</Badge>
                {conflictCount > 0 && <Badge variant="destructive">{conflictCount} conflicts</Badge>}
              </div>
            )}
          </div>
        </Tabs>

        {selectedId && (
          <div className="bg-card rounded-xl border overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr>
                  <th className="text-left p-3 text-xs font-semibold text-muted-foreground border-b w-28">Time</th>
                  {DAYS.map(day => (
                    <th key={day} className="text-left p-3 text-xs font-semibold text-muted-foreground border-b">{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map(period => (
                  <tr key={period}>
                    <td className="p-2 text-[10px] text-muted-foreground font-medium border-b leading-tight whitespace-nowrap">{getPeriodTime(period)}</td>
                    {DAYS.map(day => {
                      const display = getSlotDisplay(day, period);
                      const isEditable = display?.editable;
                      return (
                        <td key={day} className="p-1.5 border-b">
                          <div
                            className={`rounded-md px-2 py-1.5 min-h-[44px] text-center relative group ${display?.className || ''} ${isEditable ? 'cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all' : ''}`}
                            onClick={() => isEditable && handleSlotClick(day, period)}
                            onContextMenu={(e) => { e.preventDefault(); if (isEditable) handleClearSlot(day, period); }}
                          >
                            <div className="flex items-center justify-center gap-1">
                              <span className="font-semibold text-xs">{display?.label || ''}</span>
                              {isEditable && (
                                <div className="hidden group-hover:flex gap-0.5 absolute top-0.5 right-0.5">
                                  <Pencil className="w-3 h-3 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                            {display && 'sublabel' in display && display.sublabel && (
                              <div className="text-[10px] text-muted-foreground mt-0.5">{display.sublabel}</div>
                            )}
                            {display && 'combinedCount' in display && display.combinedCount > 0 && (
                              <div className="text-[9px] font-semibold text-accent-foreground bg-accent/30 rounded px-1 mt-0.5 inline-block">+{display.combinedCount} combined</div>
                            )}
                            {display?.isConflict && <AlertTriangle className="w-3 h-3 text-destructive mt-0.5 mx-auto" />}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {timetable.conflicts.length > 0 && (
          <div className="bg-card rounded-xl border p-5">
            <h3 className="text-sm font-semibold text-destructive flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4" /> {timetable.conflicts.length} Conflict(s)
            </h3>
            <div className="space-y-1">
              {timetable.conflicts.map((c, i) => (
                <p key={i} className="text-xs text-muted-foreground">{c.message}</p>
              ))}
            </div>
          </div>
        )}

        <SlotEditDialog
          slot={editSlot} open={!!editSlot} onOpenChange={(open) => { if (!open) setEditSlot(null); }}
          subjects={subjects} teachers={teachers} classes={classes}
          onSave={handleSlotSave} allSlots={timetable.slots}
        />

        {/* Regenerate Confirmation */}
        <Dialog open={clearConfirm} onOpenChange={setClearConfirm}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-warning" /> Regenerate Timetable</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              This will discard the current timetable and generate a new one. All manual edits will be lost.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setClearConfirm(false)}>Cancel</Button>
              <Button onClick={handleRegenerate}>Regenerate</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
