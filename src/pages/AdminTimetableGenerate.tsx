import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useTimetable } from '@/context/TimetableContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar, Loader2, CheckCircle, AlertTriangle, RefreshCw, Settings as SettingsIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { DayOfWeek } from '@/types/school';
import TimetableBackupPanel from '@/components/TimetableBackupPanel';

const ALL_DAYS: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export default function AdminTimetableGenerate() {
  const { teachers, subjects, classes, setClasses, config, setConfig, generateTimetable, timetable } = useTimetable();
  const [generating, setGenerating] = useState(false);
  const navigate = useNavigate();

  const toggleSportsDay = (day: DayOfWeek) => {
    const has = config.sportsDays.includes(day);
    setConfig({ ...config, sportsDays: has ? config.sportsDays.filter(d => d !== day) : [...config.sportsDays, day] });
  };

  const syncSubjectsFromTeachers = () => {
    let updated = 0;
    const next = classes.map(c => {
      const set = new Set<string>();
      teachers.forEach(t => t.assignments.forEach(a => {
        if (a.classIds.includes(c.id) && subjects.some(s => s.id === a.subjectId)) set.add(a.subjectId);
      }));
      const replaced = [...set];
      const same = replaced.length === c.subjectIds.length && replaced.every(id => c.subjectIds.includes(id));
      if (!same) updated++;
      return same ? c : { ...c, subjectIds: replaced };
    });
    setClasses(next);
    toast.success(updated === 0 ? 'All classes already in sync' : `Synced ${updated} class(es) — subjects match teacher assignments`);
  };

  const handleGenerate = () => {
    setGenerating(true);
    // Defer to next frame so the spinner can render before the synchronous generation runs
    requestAnimationFrame(() => {
      generateTimetable();
      setGenerating(false);
    });
  };

  const readiness = [
    { label: 'Teachers configured', ok: teachers.length > 0, count: teachers.length },
    { label: 'Subjects configured', ok: subjects.length > 0, count: subjects.length },
    { label: 'Classes configured', ok: classes.length > 0, count: classes.length },
    { label: 'School times set', ok: !!config.startTime && !!config.endTime, count: null },
  ];

  const allReady = readiness.every(r => r.ok);

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Generate Timetable</h2>
          <p className="text-sm text-muted-foreground">Automatically generate clash-free timetables</p>
        </div>

        <div className="max-w-xl mx-auto space-y-6">
          <div className="bg-card rounded-xl border p-6">
            <h3 className="text-base font-semibold mb-4">Pre-Generation Checklist</h3>
            <div className="space-y-3">
              {readiness.map(r => (
                <div key={r.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-2">
                    {r.ok ? <CheckCircle className="w-4 h-4 text-success" /> : <AlertTriangle className="w-4 h-4 text-destructive" />}
                    <span className="text-sm">{r.label}</span>
                  </div>
                  {r.count !== null && <span className="text-sm text-muted-foreground">{r.count}</span>}
                </div>
              ))}
          </div>

          <TimetableBackupPanel />
          </div>

          <div className="bg-card rounded-xl border p-6">
            <div className="flex items-center gap-2 mb-4">
              <SettingsIcon className="w-4 h-4 text-primary" />
              <h3 className="text-base font-semibold">Timetable Settings</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-2 block">Sports Days</label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_DAYS.map(d => (
                    <button key={d} onClick={() => toggleSportsDay(d)}
                      className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${config.sportsDays.includes(d) ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:border-primary/50'}`}
                    >{d.slice(0, 3)}</button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">Selected days reserve afternoon periods for sports</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Sports Starts at Period</label>
                  <Input type="number" min={1} max={config.periodsPerDay} className="mt-1" value={config.sportsStartPeriod}
                    onChange={e => setConfig({ ...config, sportsStartPeriod: Math.max(1, Number(e.target.value) || 1) })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Periods Per Day</label>
                  <Input type="number" min={1} max={12} className="mt-1" value={config.periodsPerDay}
                    onChange={e => setConfig({ ...config, periodsPerDay: Math.max(1, Number(e.target.value) || 1) })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">School Start</label>
                  <Input type="time" className="mt-1" value={config.startTime}
                    onChange={e => setConfig({ ...config, startTime: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">School End</label>
                  <Input type="time" className="mt-1" value={config.endTime}
                    onChange={e => setConfig({ ...config, endTime: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Period Duration (min)</label>
                  <Input type="number" min={20} max={90} className="mt-1" value={config.periodDuration}
                    onChange={e => setConfig({ ...config, periodDuration: Math.max(1, Number(e.target.value) || 1) })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Morning Break After Period</label>
                  <Input type="number" min={1} max={config.periodsPerDay} className="mt-1" value={config.morningBreakAfterPeriod}
                    onChange={e => setConfig({ ...config, morningBreakAfterPeriod: Math.max(1, Number(e.target.value) || 1) })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Lunch After Period</label>
                  <Input type="number" min={1} max={config.periodsPerDay} className="mt-1" value={config.lunchAfterPeriod}
                    onChange={e => setConfig({ ...config, lunchAfterPeriod: Math.max(1, Number(e.target.value) || 1) })} />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border p-6 text-center">
            <Calendar className="w-12 h-12 text-primary mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Ready to Generate</h3>
            <p className="text-sm text-muted-foreground mb-6">
              The system will create optimized timetables for all {classes.length} classes, ensuring no teacher clashes and proper break enforcement.
            </p>
            <Button onClick={syncSubjectsFromTeachers} variant="outline" size="lg" className="w-full mb-2">
              <RefreshCw className="w-4 h-4 mr-2" /> Sync Class Subjects from Teachers
            </Button>
            <Button onClick={handleGenerate} disabled={!allReady || generating} size="lg" className="w-full">
              {generating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</> : 'Generate Timetable'}
            </Button>
          </div>

          {timetable && (
            <div className="bg-card rounded-xl border p-6">
              <div className="flex items-center gap-2 mb-3">
                {timetable.conflicts.length === 0 ? <CheckCircle className="w-5 h-5 text-success" /> : <AlertTriangle className="w-5 h-5 text-warning" />}
                <h3 className="text-base font-semibold">
                  {timetable.conflicts.length === 0 ? 'Timetable Generated Successfully!' : `Generated with ${timetable.conflicts.length} warning(s)`}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">Generated at {new Date(timetable.generatedAt).toLocaleString()}</p>
              <Button variant="outline" className="w-full" onClick={() => navigate('/admin/timetable/view')}>View Timetable</Button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
