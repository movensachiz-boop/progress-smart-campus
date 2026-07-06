import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTimetable } from '@/context/TimetableContext';
import { analyzeFairness, fairnessScore, rebalance, BalancerReport, A_LEVEL_TARGET } from '@/lib/timetableBalancer';
import {
  exportTimetableJSON, exportFairnessCSV, exportFairnessPDF, exportTeacherLoadCSV,
  exportClassTimetablesCSV, exportTeacherTimetablesCSV, exportRoomUsageCSV,
} from '@/lib/timetableExports';
import { Timetable } from '@/types/school';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { AlertTriangle, CheckCircle2, FileDown, RotateCcw, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function BalanceTimetableDialog({ open, onOpenChange }: Props) {
  const { timetable, classes, subjects, teachers, replaceTimetable } = useTimetable();
  const { toast } = useToast();
  const [preview, setPreview] = useState<{ next: Timetable; report: BalancerReport } | null>(null);
  const [undoStack, setUndoStack] = useState<Timetable[]>([]);

  const currentFairness = useMemo(
    () => timetable ? analyzeFairness(timetable, classes, subjects) : [],
    [timetable, classes, subjects]
  );
  const currentScore = fairnessScore(currentFairness);

  const runAnalysis = () => {
    if (!timetable) return;
    const result = rebalance(timetable, classes, subjects, teachers);
    setPreview({ next: result.nextTimetable, report: result.report });
    toast({ title: 'Analysis complete', description: `${result.report.changes.length} change(s) proposed.` });
  };

  const applyChanges = () => {
    if (!preview || !timetable) return;
    setUndoStack(prev => [...prev, timetable]);
    replaceTimetable(preview.next);
    toast({ title: 'Changes applied', description: 'The A-level timetable has been rebalanced.' });
    setPreview(null);
  };

  const undo = () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    replaceTimetable(last);
    setUndoStack(prev => prev.slice(0, -1));
    toast({ title: 'Reverted to previous timetable' });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Balance A-Level Timetable
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

            {/* Fairness table */}
            <div>
              <h3 className="font-semibold mb-2">Subject allocation per A-level class (target = {A_LEVEL_TARGET})</h3>
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
                      const status = f?.status || r.status;
                      return (
                        <tr key={`${r.classId}-${r.subjectId}`} className="border-b">
                          <td className="p-2 font-medium">{r.className}</td>
                          <td className="p-2">{r.subjectCode} <span className="text-muted-foreground">· {r.subjectName}</span></td>
                          <td className="p-2 text-center">{r.current}</td>
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
                          <td className="p-2">P{c.period}–P{c.period + 1}</td>
                          <td className="p-2">{c.oldSubjectCode}</td>
                          <td className="p-2 font-semibold text-primary">{c.newSubjectCode}</td>
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
          <Button onClick={applyChanges} disabled={!preview || preview.report.changes.length === 0}>
            Apply changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
