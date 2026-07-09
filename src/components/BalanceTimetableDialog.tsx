import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTimetable } from '@/context/TimetableContext';
import { analyzeFairness, fairnessScore, rebalance, BalancerReport, A_LEVEL_TARGET, RebalanceOptions } from '@/lib/timetableBalancer';
import {
  exportTimetableJSON, exportFairnessCSV, exportFairnessPDF, exportTeacherLoadCSV,
  exportClassTimetablesCSV, exportTeacherTimetablesCSV, exportRoomUsageCSV,
} from '@/lib/timetableExports';
import { Timetable, TimetableSlot } from '@/types/school';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { AlertTriangle, CheckCircle2, FileDown, RotateCcw, Sparkles, Wand2, X, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function BalanceTimetableDialog({ open, onOpenChange }: Props) {
  const { timetable, classes, subjects, teachers, replaceTimetable, setClasses } = useTimetable();
  const [bulkSubject, setBulkSubject] = useState<string>('');
  const [bulkTarget, setBulkTarget] = useState<number>(0);
  const [bulkScope, setBulkScope] = useState<'all' | 'olevel' | 'alevel'>('all');
  const { toast } = useToast();
  const [preview, setPreview] = useState<{ next: Timetable; report: BalancerReport } | null>(null);
  const [undoStack, setUndoStack] = useState<Timetable[]>([]);
  const [form6Max, setForm6Max] = useState<number>(A_LEVEL_TARGET);
  const [includeOLevel, setIncludeOLevel] = useState<boolean>(true);
  const [conflictPairs, setConflictPairs] = useState<Array<[string, string]>>([]);
  const [pairA, setPairA] = useState<string>('');
  const [pairB, setPairB] = useState<string>('');
  const [oLevelMax, setOLevelMax] = useState<Record<1 | 2 | 3 | 4, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });

  const maxForForm = (form: number) => {
    if (form === 6) return form6Max;
    if (form === 5) return A_LEVEL_TARGET;
    const cap = oLevelMax[form as 1 | 2 | 3 | 4];
    return cap && cap > 0 ? cap : 999;
  };

  const opts: RebalanceOptions = useMemo(() => ({
    form6Max, conflictPairs, includeOLevel, oLevelMax,
  }), [form6Max, conflictPairs, includeOLevel, oLevelMax]);

  const currentFairness = useMemo(
    () => timetable ? analyzeFairness(timetable, classes, subjects, opts) : [],
    [timetable, classes, subjects, opts]
  );
  const currentScore = fairnessScore(currentFairness);

  const runAnalysis = () => {
    if (!timetable) return;
    const result = rebalance(timetable, classes, subjects, teachers, opts);
    setPreview({ next: result.nextTimetable, report: result.report });
    toast({ title: 'Analysis complete', description: `${result.report.changes.length} change(s) proposed.` });
  };

  const applyChanges = () => {
    if (!preview || !timetable) return;
    setUndoStack(prev => [...prev, timetable]);
    replaceTimetable(preview.next);
    toast({ title: 'Changes applied', description: 'Timetable rebalanced.' });
    setPreview(null);
  };

  /** One-click: keep rebalancing and applying until fairness stops improving. */
  const autoCorrect = () => {
    if (!timetable) return;
    setUndoStack(prev => [...prev, timetable]);
    let working = timetable;
    let lastScore = -1;
    let totalChanges = 0;
    for (let i = 0; i < 6; i++) {
      const r = rebalance(working, classes, subjects, teachers, opts);
      totalChanges += r.report.changes.length;
      if (r.report.changes.length === 0) break;
      working = r.nextTimetable;
      if (r.report.fairnessScore <= lastScore) break;
      lastScore = r.report.fairnessScore;
    }
    replaceTimetable(working);
    setPreview(null);
    toast({
      title: 'Auto-corrected',
      description: `${totalChanges} change(s) applied. Fairness now ${lastScore >= 0 ? lastScore : currentScore}/100.`,
    });
  };

  const undo = () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    replaceTimetable(last);
    setUndoStack(prev => prev.slice(0, -1));
    toast({ title: 'Reverted to previous timetable' });
  };

  const addPair = () => {
    if (!pairA || !pairB || pairA === pairB) return;
    if (conflictPairs.some(([a, b]) => (a === pairA && b === pairB) || (a === pairB && b === pairA))) {
      toast({ title: 'Pair already added' });
      return;
    }
    setConflictPairs(prev => [...prev, [pairA, pairB]]);
    setPairA(''); setPairB('');
  };
  const removePair = (i: number) => setConflictPairs(prev => prev.filter((_, idx) => idx !== i));

  /** Apply the same target periods/week to a subject across all matching classes (streams). */
  const applyBulkTarget = () => {
    if (!bulkSubject) return;
    const t = Math.max(0, Math.floor(bulkTarget));
    let touched = 0;
    const next = classes.map(cls => {
      if (!cls.subjectIds.includes(bulkSubject)) return cls;
      if (bulkScope === 'olevel' && cls.form > 4) return cls;
      if (bulkScope === 'alevel' && cls.form < 5) return cls;
      touched++;
      return { ...cls, subjectPeriods: { ...(cls.subjectPeriods || {}), [bulkSubject]: t } };
    });
    setClasses(next);
    const subj = subjects.find(s => s.id === bulkSubject);
    toast({
      title: 'Targets updated',
      description: `${subj?.code || 'Subject'} → ${t} period(s)/week across ${touched} class(es). Run Auto-correct to apply.`,
    });
  };

  // Manual "Current" editor kept for A-level fine-tuning.
  const adjustCurrent = (classId: string, subjectId: string, newCount: number) => {
    if (!timetable) return;
    const cls = classes.find(c => c.id === classId);
    if (!cls) return;
    const isA = cls.form === 5 || cls.form === 6;
    let clamped = Math.max(0, Math.min(maxForForm(cls.form), Math.floor(newCount)));
    if (isA && clamped % 2 !== 0) clamped -= 1;
    const mine = timetable.slots.filter(s => s.classId === classId && s.subjectId === subjectId && s.type === 'lesson');
    const current = mine.length;
    if (clamped === current) return;

    setUndoStack(prev => [...prev, timetable]);
    let slots: TimetableSlot[] = timetable.slots.map(s => ({ ...s }));

    if (clamped < current) {
      const toRemove = current - clamped;
      if (isA) {
        let pairsToRemove = Math.ceil(toRemove / 2);
        const byDay: Record<string, TimetableSlot[]> = {};
        slots.filter(s => s.classId === classId && s.subjectId === subjectId && s.type === 'lesson')
          .forEach(s => { (byDay[s.day] ||= []).push(s); });
        const removeIds = new Set<string>();
        for (const day of Object.keys(byDay)) {
          if (pairsToRemove <= 0) break;
          const arr = byDay[day].sort((a, b) => a.period - b.period);
          for (let i = 0; i < arr.length - 1 && pairsToRemove > 0; i++) {
            if (arr[i + 1].period === arr[i].period + 1 && !removeIds.has(arr[i].id)) {
              removeIds.add(arr[i].id); removeIds.add(arr[i + 1].id); pairsToRemove--; i++;
            }
          }
        }
        slots = slots.map(s => removeIds.has(s.id)
          ? { ...s, subjectId: undefined, teacherId: undefined, pairedSubjectId: undefined, pairedTeacherId: undefined }
          : s);
      } else {
        const arr = slots.filter(s => s.classId === classId && s.subjectId === subjectId && s.type === 'lesson');
        const removeIds = new Set(arr.slice(clamped).map(s => s.id));
        slots = slots.map(s => removeIds.has(s.id)
          ? { ...s, subjectId: undefined, teacherId: undefined, pairedSubjectId: undefined, pairedTeacherId: undefined }
          : s);
      }
    } else {
      const eligibleTeacher = teachers.find(t =>
        t.subjectIds.includes(subjectId) &&
        t.assignments.some(a => a.subjectId === subjectId && a.classIds.some(cid => cid === classId))
      ) || teachers.find(t => t.subjectIds.includes(subjectId));
      const daysWithSubject = new Set(
        slots.filter(s => s.classId === classId && s.subjectId === subjectId).map(s => s.day)
      );
      const empties = slots
        .filter(s => s.classId === classId && s.type === 'lesson' && !s.subjectId)
        .sort((a, b) => a.day.localeCompare(b.day) || a.period - b.period);
      const claimIds = new Set<string>();
      if (isA) {
        let pairsToAdd = Math.floor((clamped - current) / 2);
        for (let i = 0; i < empties.length - 1 && pairsToAdd > 0; i++) {
          const a = empties[i], b = empties[i + 1];
          if (a.day !== b.day || b.period !== a.period + 1) continue;
          if (daysWithSubject.has(a.day)) continue;
          if (claimIds.has(a.id) || claimIds.has(b.id)) continue;
          if (eligibleTeacher && slots.some(x =>
            (x.day === a.day && (x.period === a.period || x.period === b.period)) &&
            x.teacherId === eligibleTeacher.id && x.classId !== classId
          )) continue;
          claimIds.add(a.id); claimIds.add(b.id);
          daysWithSubject.add(a.day);
          pairsToAdd--; i++;
        }
      } else {
        let need = clamped - current;
        for (const empty of empties) {
          if (need <= 0) break;
          if (eligibleTeacher && slots.some(x =>
            x.day === empty.day && x.period === empty.period &&
            x.teacherId === eligibleTeacher.id && x.classId !== classId
          )) continue;
          claimIds.add(empty.id); need--;
        }
      }
      slots = slots.map(s => claimIds.has(s.id)
        ? { ...s, subjectId, teacherId: eligibleTeacher?.id }
        : s);
    }

    replaceTimetable({ ...timetable, slots });
    toast({ title: 'Timetable updated', description: `${cls.form}${cls.stream} · ${subjects.find(s => s.id === subjectId)?.code} → ${clamped} period(s)` });
  };

  const report = preview?.report;

  const subjectChartData = useMemo(() => {
    const src = report?.fairnessAfter || currentFairness;
    const grouped: Record<string, number> = {};
    for (const r of src) grouped[r.subjectCode] = (grouped[r.subjectCode] || 0) + r.current;
    return Object.entries(grouped).map(([code, total]) => ({ code, total })).sort((a, b) => b.total - a.total).slice(0, 15);
  }, [report, currentFairness]);

  const teacherChartData = useMemo(() => {
    if (!report) return [];
    return [...report.teacherLoads]
      .sort((a, b) => b.after - a.after)
      .slice(0, 12)
      .map(t => ({ name: t.teacherName.split(' ').slice(-1)[0], before: t.before, after: t.after }));
  }, [report]);

  // All subjects for pair selection
  const pairSubjectOptions = useMemo(
    () => [...subjects].sort((a, b) => a.code.localeCompare(b.code)),
    [subjects]
  );
  const subjectLabel = (id: string) => {
    const s = subjects.find(x => x.id === id);
    return s ? `${s.code}` : id;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Balance Timetable
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6">
            {/* Score summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Fairness (current)</p>
                <p className="text-2xl font-bold">{currentScore}<span className="text-sm text-muted-foreground">/100</span></p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Fairness (after)</p>
                <p className="text-2xl font-bold text-success">{report?.fairnessScore ?? '—'}<span className="text-sm text-muted-foreground">/100</span></p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Proposed changes</p>
                <p className="text-2xl font-bold">{report?.changes.length ?? 0}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Remaining conflicts</p>
                <p className="text-2xl font-bold flex items-center gap-1">
                  {report?.clashes.remainingConflicts ?? timetable?.conflicts.length ?? 0}
                  {(report?.clashes.remainingConflicts ?? 0) === 0
                    ? <CheckCircle2 className="w-5 h-5 text-success" />
                    : <AlertTriangle className="w-5 h-5 text-warning" />}
                </p>
              </div>
            </div>

            {/* Options row */}
            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={includeOLevel} onCheckedChange={setIncludeOLevel} />
                  Also balance O-level (Forms 1-4)
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Form 6 max periods/week
                  <Input
                    type="number" min={A_LEVEL_TARGET} max={10} step={2}
                    value={form6Max}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isNaN(v)) return;
                      const snapped = Math.max(A_LEVEL_TARGET, Math.min(10, v % 2 === 0 ? v : v - 1));
                      setForm6Max(snapped);
                    }}
                    className="h-7 w-16 text-center"
                  />
                </label>
              </div>

              {/* O-level per-form max periods/week */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-muted-foreground">O-level max periods/week (0 = no cap):</span>
                {([1, 2, 3, 4] as const).map(f => (
                  <label key={f} className="flex items-center gap-1 text-xs">
                    <span className="font-medium">F{f}</span>
                    <Input
                      type="number" min={0} max={20}
                      value={oLevelMax[f]}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(20, Number(e.target.value) || 0));
                        setOLevelMax(prev => ({ ...prev, [f]: v }));
                      }}
                      className="h-7 w-16 text-center"
                    />
                  </label>
                ))}
              </div>

              {/* Conflict pair editor */}
              <div>
                <p className="text-sm font-semibold mb-1">Subjects that must NOT run at the same time</p>
                <p className="text-xs text-muted-foreground mb-2">
                  Add subject pairs (e.g. Math + Pure Math A). The balancer will move or clear collisions across the school.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={pairA} onValueChange={setPairA}>
                    <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Subject A" /></SelectTrigger>
                    <SelectContent>
                      {pairSubjectOptions.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">×</span>
                  <Select value={pairB} onValueChange={setPairB}>
                    <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Subject B" /></SelectTrigger>
                    <SelectContent>
                      {pairSubjectOptions.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={addPair} disabled={!pairA || !pairB || pairA === pairB}>
                    <Plus className="w-3 h-3 mr-1" />Add pair
                  </Button>
                </div>
                {conflictPairs.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {conflictPairs.map(([a, b], i) => (
                      <Badge key={i} variant="secondary" className="gap-1">
                        {subjectLabel(a)} ⇌ {subjectLabel(b)}
                        <button onClick={() => removePair(i)} className="hover:text-destructive">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Bulk target editor: set periods/week for ONE subject across ALL streams at once */}
            <div className="rounded-lg border p-3">
              <p className="text-sm font-semibold mb-1">Bulk-set target periods per week</p>
              <p className="text-xs text-muted-foreground mb-2">
                Pick a subject and a target — it is written as an override on every class (stream) that teaches it. Then hit Auto-correct.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={bulkSubject} onValueChange={setBulkSubject}>
                  <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Subject" /></SelectTrigger>
                  <SelectContent>
                    {pairSubjectOptions.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={bulkScope} onValueChange={(v: 'all' | 'olevel' | 'alevel') => setBulkScope(v)}>
                  <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All forms</SelectItem>
                    <SelectItem value="olevel">O-level only (F1-4)</SelectItem>
                    <SelectItem value="alevel">A-level only (F5-6)</SelectItem>
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  Periods/week
                  <Input
                    type="number" min={0} max={20}
                    value={bulkTarget}
                    onChange={(e) => setBulkTarget(Number(e.target.value) || 0)}
                    className="h-8 w-20 text-center"
                  />
                </label>
                <Button size="sm" variant="outline" onClick={applyBulkTarget} disabled={!bulkSubject}>
                  Apply to all streams
                </Button>
              </div>
            </div>

            {/* Fairness table */}
            <div>
              <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
                <h3 className="font-semibold">
                  Subject allocation per class {includeOLevel ? '(Forms 1-6)' : '(A-level)'}
                </h3>
              </div>
              <div className="border rounded-lg overflow-x-auto max-h-72">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2">Class</th>
                      <th className="text-left p-2">Subject</th>
                      <th className="p-2">Current</th>
                      <th className="p-2">Target</th>
                      {report && <th className="p-2">Final</th>}
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentFairness.map(r => {
                      const f = report?.fairnessAfter.find(a => a.classId === r.classId && a.subjectId === r.subjectId);
                      const cls = classes.find(c => c.id === r.classId);
                      const status = f?.status || r.status;
                      return (
                        <tr key={`${r.classId}-${r.subjectId}`} className="border-b">
                          <td className="p-2 font-medium">{r.className}</td>
                          <td className="p-2">{r.subjectCode} <span className="text-muted-foreground">· {r.subjectName}</span></td>
                          <td className="p-2 text-center">
                            <Input
                              type="number"
                              min={0}
                              max={cls ? maxForForm(cls.form) : 10}
                              defaultValue={r.current}
                              key={`${r.classId}-${r.subjectId}-${r.current}-${r.target}`}
                              className="h-7 w-16 mx-auto text-center"
                              onBlur={(e) => {
                                const v = Number(e.target.value);
                                if (!Number.isNaN(v) && v !== r.current) adjustCurrent(r.classId, r.subjectId, v);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              }}
                            />
                          </td>
                          <td className="p-2 text-center">{r.target}</td>
                          {report && <td className="p-2 text-center font-semibold">{f?.current ?? r.current}</td>}
                          <td className="p-2 text-center">
                            <Badge variant={status === 'FAIR' ? 'default' : status === 'MISSING' ? 'destructive' : 'secondary'}>
                              {status}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Charts */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-3">
                <p className="text-sm font-semibold mb-2">Subject periods (top 15)</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={subjectChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="code" fontSize={10} />
                    <YAxis fontSize={10} />
                    <Tooltip />
                    <Bar dataKey="total" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="border rounded-lg p-3">
                <p className="text-sm font-semibold mb-2">Teacher workload before → after</p>
                {teacherChartData.length ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={teacherChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" fontSize={10} />
                      <YAxis fontSize={10} />
                      <Tooltip />
                      <Bar dataKey="before" fill="hsl(var(--muted-foreground))" />
                      <Bar dataKey="after" fill="hsl(var(--primary))" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-8">Run analysis to see comparison.</p>
                )}
              </div>
            </div>

            {/* Changes preview */}
            {report && report.changes.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Proposed changes</h3>
                <div className="border rounded-lg overflow-x-auto max-h-56">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="text-left p-2">Class</th>
                        <th className="text-left p-2">Day</th>
                        <th className="text-left p-2">Period</th>
                        <th className="text-left p-2">From</th>
                        <th className="text-left p-2">To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.changes.map((c, i) => (
                        <tr key={i} className="border-b">
                          <td className="p-2">{c.className}</td>
                          <td className="p-2">{c.day}</td>
                          <td className="p-2">P{c.period}{c.slotIds.length > 1 ? `–P${c.period + 1}` : ''}</td>
                          <td className="p-2">{c.oldSubjectCode || '—'}</td>
                          <td className="p-2 font-semibold text-primary">{c.newSubjectCode || 'FREE'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Exports */}
            <div>
              <h3 className="font-semibold mb-2">Export</h3>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => timetable && exportTimetableJSON(timetable)}><FileDown className="w-3 h-3 mr-1" />Timetable JSON</Button>
                <Button size="sm" variant="outline" onClick={() => timetable && exportClassTimetablesCSV(timetable, classes, subjects)}><FileDown className="w-3 h-3 mr-1" />Class CSV</Button>
                <Button size="sm" variant="outline" onClick={() => timetable && exportTeacherTimetablesCSV(timetable, teachers, subjects, classes)}><FileDown className="w-3 h-3 mr-1" />Teacher CSV</Button>
                <Button size="sm" variant="outline" onClick={() => timetable && exportRoomUsageCSV(timetable, subjects)}><FileDown className="w-3 h-3 mr-1" />Room usage CSV</Button>
                {report && <Button size="sm" variant="outline" onClick={() => exportFairnessCSV(report)}><FileDown className="w-3 h-3 mr-1" />Fairness CSV</Button>}
                {report && <Button size="sm" variant="outline" onClick={() => exportFairnessPDF(report)}><FileDown className="w-3 h-3 mr-1" />Fairness PDF</Button>}
                {report && <Button size="sm" variant="outline" onClick={() => exportTeacherLoadCSV(report)}><FileDown className="w-3 h-3 mr-1" />Teacher load CSV</Button>}
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="flex-wrap gap-2">
          {undoStack.length > 0 && (
            <Button variant="outline" onClick={undo}><RotateCcw className="w-4 h-4 mr-1" />Undo last apply</Button>
          )}
          <Button variant="outline" onClick={runAnalysis}>Analyze &amp; preview</Button>
          <Button variant="secondary" onClick={autoCorrect}>
            <Wand2 className="w-4 h-4 mr-1" />Auto-correct
          </Button>
          <Button onClick={applyChanges} disabled={!preview || preview.report.changes.length === 0}>
            Apply changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
