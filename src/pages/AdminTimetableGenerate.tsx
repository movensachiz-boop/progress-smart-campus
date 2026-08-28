import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useTimetable } from '@/context/TimetableContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar, Loader2, CheckCircle, AlertTriangle, RefreshCw, Settings as SettingsIcon, Smartphone, ScanLine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { DayOfWeek, Teacher, TeacherClassAssignment, FormLevel, Subject } from '@/types/school';
import TimetableBackupPanel from '@/components/TimetableBackupPanel';
import PhoneCameraPairDialog from '@/components/PhoneCameraPairDialog';
import { supabase } from '@/integrations/supabase/client';
import { v4 } from '@/lib/utils';
import { loadDoubleSettings, saveDoubleSettings, type DoubleSettings } from '@/lib/doubleSettings';

const ALL_DAYS: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function AdminTimetableGenerate() {
  const { teachers, setTeachers, subjects, setSubjects, classes, setClasses, config, setConfig, generateTimetable, timetable } = useTimetable();
  const [generating, setGenerating] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [doubles, setDoublesState] = useState<DoubleSettings>(() => loadDoubleSettings());
  const setDoubles = (next: DoubleSettings) => { setDoublesState(next); saveDoubleSettings(next); };
  const [importing, setImporting] = useState(false);
  const navigate = useNavigate();

  // Normalise a raw class string from OCR ("2 Orange", "Upper 6", "3 leo") to canonical class id.
  // We try a fuzzy lookup against existing classes (by id, stream code, or stream display name).
  const STREAM_ALIASES: Record<string, string> = {
    orange: 'G1', shark: 'G2', virgo: 'G22', leo: 'Blue',
    pluto: 'G1', jupiter: 'G2', neptune: 'G22',
    gold: 'G1', silver: 'G2', bronze: 'G22', platinum: 'Blue',
    'upper 6': '6S', 'lower 6': '5S',
  };
  const resolveClassId = (raw: string): string | null => {
    if (!raw) return null;
    const cleaned = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    // Direct id match
    const direct = classes.find(c => c.id.toLowerCase() === cleaned.replace(/\s/g, ''));
    if (direct) return direct.id;
    const upperLower = STREAM_ALIASES[cleaned];
    if (upperLower) return classes.find(c => c.id.toLowerCase() === upperLower.toLowerCase())?.id || null;
    const m = cleaned.match(/^(\d)\s*(.+)$/);
    if (m) {
      const form = m[1];
      const streamWord = m[2].trim();
      const aliased = STREAM_ALIASES[streamWord] || streamWord;
      const candidate = `${form}${aliased}`;
      const hit = classes.find(c => c.id.toLowerCase() === candidate.toLowerCase());
      if (hit) return hit.id;
      // last try: same form, stream contains
      const fuzzy = classes.find(c => c.form === Number(form) && (c.stream.toLowerCase() === streamWord || c.id.toLowerCase().includes(streamWord)));
      if (fuzzy) return fuzzy.id;
    }
    return null;
  };

  const resolveSubjectId = (raw: string): string | null => {
    if (!raw) return null;
    const q = raw.trim().toLowerCase();
    // Exact name or code match
    let hit = subjects.find(s => s.name.toLowerCase() === q || s.code.toLowerCase() === q);
    if (hit) return hit.id;
    // Common aliases
    const aliases: Record<string, string> = {
      'english language': 'english', 'english': 'english',
      'literature in english': 'literature', 'literature': 'literature',
      'shona language': 'shona', 'french language': 'french',
      'combined science': 'combined science', 'maths': 'mathematics',
    };
    const norm = aliases[q] || q;
    hit = subjects.find(s => s.name.toLowerCase() === norm || s.name.toLowerCase().includes(norm) || norm.includes(s.name.toLowerCase()));
    return hit?.id || null;
  };

  const handleScannedPhotos = async (dataUrls: string[]) => {
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-teacher-allocation', { body: { images: dataUrls } });
      if (error) throw error;
      const rows: Array<{ teacher_name: string; max_periods?: number; subject: string; classes: string[] }> = data?.rows || [];
      if (!rows.length) { toast.error('No teacher rows detected'); return; }

      // Working copies — we auto-create subjects and classes that don't yet exist.
      const nextSubjects: Subject[] = [...subjects];
      const nextClasses = [...classes];
      let newSubjectCount = 0;
      let newClassCount = 0;

      const findOrCreateSubject = (raw: string): string => {
        const q = (raw || '').trim();
        if (!q) return '';
        const ql = q.toLowerCase();
        const existing = nextSubjects.find(s =>
          s.name.toLowerCase() === ql || s.code.toLowerCase() === ql ||
          s.name.toLowerCase().includes(ql) || ql.includes(s.name.toLowerCase())
        );
        if (existing) return existing.id;
        const code = q.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 4) || q.slice(0, 3).toUpperCase();
        const created: Subject = {
          id: v4(),
          name: q,
          code,
          forms: [1, 2, 3, 4, 5, 6],
          periodsPerWeek: 5,
          isCompulsory: false,
        };
        nextSubjects.push(created);
        newSubjectCount++;
        return created.id;
      };

      const findOrCreateClass = (raw: string): string | null => {
        if (!raw) return null;
        const cleaned = raw.trim().toLowerCase().replace(/\s+/g, ' ');
        const direct = nextClasses.find(c => c.id.toLowerCase() === cleaned.replace(/\s/g, ''));
        if (direct) return direct.id;
        const upperLower = STREAM_ALIASES[cleaned];
        if (upperLower) {
          const hit = nextClasses.find(c => c.id.toLowerCase() === upperLower.toLowerCase());
          if (hit) return hit.id;
        }
        const m = cleaned.match(/^(\d)\s*(.+)$/);
        if (m) {
          const form = Number(m[1]) as FormLevel;
          const streamWord = m[2].trim();
          const aliased = STREAM_ALIASES[streamWord] || streamWord;
          const candidate = `${form}${aliased}`;
          const hit = nextClasses.find(c => c.id.toLowerCase() === candidate.toLowerCase());
          if (hit) return hit.id;
          const fuzzy = nextClasses.find(c => c.form === form && (c.stream.toLowerCase() === streamWord || c.id.toLowerCase().includes(streamWord)));
          if (fuzzy) return fuzzy.id;
          // Auto-create the class — capitalize stream nicely
          const stream = aliased.replace(/\b\w/g, ch => ch.toUpperCase());
          const newId = `${form}${stream.replace(/\s/g, '')}`;
          const created = { id: newId, form, stream, subjectIds: [] as string[] };
          nextClasses.push(created);
          newClassCount++;
          return newId;
        }
        // Upper/Lower 6 fallback handled by STREAM_ALIASES above
        return null;
      };

      // Group rows by teacher
      const byTeacher = new Map<string, { name: string; max: number; entries: Array<{ subjectId: string; classIds: string[] }> }>();
      const unknownClasses = new Set<string>();
      for (const r of rows) {
        const subjId = findOrCreateSubject(r.subject);
        if (!subjId) continue;
        const cIds: string[] = [];
        for (const raw of (r.classes || [])) {
          const cid = findOrCreateClass(raw);
          if (cid) cIds.push(cid); else unknownClasses.add(raw);
        }
        const key = r.teacher_name.trim().toUpperCase();
        if (!byTeacher.has(key)) byTeacher.set(key, { name: r.teacher_name.trim(), max: Number(r.max_periods) || 0, entries: [] });
        const slot = byTeacher.get(key)!;
        if (Number(r.max_periods) > slot.max) slot.max = Number(r.max_periods);
        slot.entries.push({ subjectId: subjId, classIds: cIds });
      }


      // Merge into existing teachers (match by name, case-insensitive)
      const next: Teacher[] = [...teachers];
      let added = 0, updated = 0;
      byTeacher.forEach(({ name, max, entries }) => {
        // Merge entries by subject
        const assignmentMap = new Map<string, Set<string>>();
        entries.forEach(e => {
          if (!assignmentMap.has(e.subjectId)) assignmentMap.set(e.subjectId, new Set());
          e.classIds.forEach(c => assignmentMap.get(e.subjectId)!.add(c));
        });
        const assignments: TeacherClassAssignment[] = [...assignmentMap.entries()].map(([sid, set]) => ({ subjectId: sid, classIds: [...set] }));
        const subjectIds = [...assignmentMap.keys()];
        const formsSet = new Set<FormLevel>();
        assignments.forEach(a => a.classIds.forEach(cid => {
          const cls = nextClasses.find(c => c.id === cid);
          if (cls) formsSet.add(cls.form);
        }));
        const forms = [...formsSet];

        const idx = next.findIndex(t => `${t.name}`.trim().toLowerCase() === name.toLowerCase());
        if (idx >= 0) {
          const existing = next[idx];
          // Merge: union of subjectIds and assignments
          const mergedAssignmentMap = new Map<string, Set<string>>();
          existing.assignments.forEach(a => mergedAssignmentMap.set(a.subjectId, new Set(a.classIds)));
          assignments.forEach(a => {
            if (!mergedAssignmentMap.has(a.subjectId)) mergedAssignmentMap.set(a.subjectId, new Set());
            a.classIds.forEach(c => mergedAssignmentMap.get(a.subjectId)!.add(c));
          });
          const mergedAssignments: TeacherClassAssignment[] = [...mergedAssignmentMap.entries()].map(([sid, set]) => ({ subjectId: sid, classIds: [...set] }));
          next[idx] = {
            ...existing,
            subjectIds: [...new Set([...existing.subjectIds, ...subjectIds])],
            assignments: mergedAssignments,
            forms: [...new Set([...existing.forms, ...forms])] as FormLevel[],
            maxPeriodsPerWeek: max > 0 ? max : existing.maxPeriodsPerWeek,
          };
          updated++;
        } else {
          // Derive a title from "CHUCHU CE" style → keep raw name; default title.
          next.push({
            id: v4(), name, title: 'Mr.',
            subjectIds, assignments, forms,
            maxPeriodsPerWeek: max > 0 ? max : 28,
          });
          added++;
        }
      });

      if (newSubjectCount) setSubjects(nextSubjects);
      if (newClassCount) setClasses(nextClasses);
      setTeachers(next);
      const warnBits: string[] = [];
      if (newSubjectCount) warnBits.push(`${newSubjectCount} new subject(s) added`);
      if (newClassCount) warnBits.push(`${newClassCount} new class(es) added`);
      if (unknownClasses.size) warnBits.push(`${unknownClasses.size} class(es) unmatched: ${[...unknownClasses].slice(0, 3).join(', ')}`);
      toast.success(`Imported — ${added} teacher(s) added, ${updated} updated${warnBits.length ? `. ${warnBits.join(' · ')}` : ''}`);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to import teacher allocation');
    } finally {
      setImporting(false);
    }
  };

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

              <div className="pt-4 border-t">
                <h4 className="text-sm font-semibold mb-1">Double Periods</h4>
                <p className="text-[10px] text-muted-foreground mb-3">Control which levels get double (back-to-back) lessons and how many days per week each subject may be doubled. Maximum periods per subject are never exceeded.</p>
                <div className="space-y-3">
                  <label className="flex items-center justify-between gap-3 text-xs">
                    <span>Force A-Level subjects to be doubles</span>
                    <input type="checkbox" className="w-4 h-4 accent-[hsl(var(--primary))]" checked={doubles.aLevelDoubles}
                      onChange={e => setDoubles({ ...doubles, aLevelDoubles: e.target.checked })} />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">A-Level double days per week (0 = every day)</label>
                      <Input type="number" min={0} max={6} className="mt-1" value={doubles.aLevelDoubleDays}
                        onChange={e => setDoubles({ ...doubles, aLevelDoubleDays: Math.max(0, Math.min(6, Number(e.target.value) || 0)) })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Periods per A-Level double block (2–4)</label>
                      <Input type="number" min={2} max={4} className="mt-1" value={doubles.aLevelDoubleLength ?? 2}
                        onChange={e => setDoubles({ ...doubles, aLevelDoubleLength: Math.max(2, Math.min(4, Number(e.target.value) || 2)) })} />
                    </div>
                  </div>
                  <label className="flex items-center justify-between gap-3 text-xs">
                    <span>Allow O-Level (Forms 1–4) doubles</span>
                    <input type="checkbox" className="w-4 h-4 accent-[hsl(var(--primary))]" checked={doubles.oLevelDoubles}
                      onChange={e => setDoubles({ ...doubles, oLevelDoubles: e.target.checked })} />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">O-Level double days per week (0 = every day)</label>
                      <Input type="number" min={0} max={6} className="mt-1" value={doubles.oLevelDoubleDays}
                        onChange={e => setDoubles({ ...doubles, oLevelDoubleDays: Math.max(0, Math.min(6, Number(e.target.value) || 0)) })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Periods per O-Level double block (2–4)</label>
                      <Input type="number" min={2} max={4} className="mt-1" value={doubles.oLevelDoubleLength ?? 2}
                        onChange={e => setDoubles({ ...doubles, oLevelDoubleLength: Math.max(2, Math.min(4, Number(e.target.value) || 2)) })} />
                    </div>
                  </div>


                  <div className="pt-3 border-t">
                    <h5 className="text-xs font-semibold mb-1">Specific subjects always doubled</h5>
                    <p className="text-[10px] text-muted-foreground mb-2">Tick a subject to force back-to-back lessons for it in every class. First box = doubles per week (0 = use level default), second box = periods per double block (0 = use level default). Weekly maximum periods are never exceeded.</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground pr-1">
                      <span className="flex-1" />
                      <span className="w-16 text-center">Per week</span>
                      <span className="w-16 text-center">Length</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                      {[...subjects].sort((a, b) => a.name.localeCompare(b.name)).map(s => {
                        const on = (doubles.subjectDoubleIds || []).includes(s.id);
                        return (
                          <div key={s.id} className="flex items-center gap-2 text-xs py-0.5">
                            <input type="checkbox" className="w-4 h-4 accent-[hsl(var(--primary))]" checked={on}
                              onChange={e => setDoubles({
                                ...doubles,
                                subjectDoubleIds: e.target.checked
                                  ? [...new Set([...(doubles.subjectDoubleIds || []), s.id])]
                                  : (doubles.subjectDoubleIds || []).filter(id => id !== s.id),
                              })} />
                            <span className="flex-1 truncate">{s.name} <span className="text-muted-foreground">({s.code})</span></span>
                            <Input type="number" min={0} max={6} disabled={!on} className="h-7 w-16 text-xs"
                              value={doubles.subjectDoubleDays?.[s.id] ?? 0}
                              onChange={e => setDoubles({
                                ...doubles,
                                subjectDoubleDays: { ...(doubles.subjectDoubleDays || {}), [s.id]: Math.max(0, Math.min(6, Number(e.target.value) || 0)) },
                              })} />
                            <Input type="number" min={0} max={4} disabled={!on} className="h-7 w-16 text-xs"
                              value={doubles.subjectDoubleLength?.[s.id] ?? 0}
                              onChange={e => setDoubles({
                                ...doubles,
                                subjectDoubleLength: { ...(doubles.subjectDoubleLength || {}), [s.id]: Math.max(0, Math.min(4, Number(e.target.value) || 0)) },
                              })} />
                          </div>
                        );
                      })}

                    </div>
                  </div>

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
            <Button onClick={() => setScanOpen(true)} variant="outline" size="lg" className="w-full mb-2" disabled={importing}>
              {importing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing teachers…</> : <><Smartphone className="w-4 h-4 mr-2" /><ScanLine className="w-4 h-4 mr-2" /> Scan Teacher Allocation (Phone)</>}
            </Button>
            <Button onClick={syncSubjectsFromTeachers} variant="outline" size="lg" className="w-full mb-2">
              <RefreshCw className="w-4 h-4 mr-2" /> Sync Class Subjects from Teachers
            </Button>
            <Button onClick={handleGenerate} disabled={!allReady || generating} size="lg" className="w-full">
              {generating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</> : 'Generate Timetable'}
            </Button>
          </div>

          <PhoneCameraPairDialog
            open={scanOpen}
            onOpenChange={setScanOpen}
            onPhotos={handleScannedPhotos}
            title="Scan Teacher Allocation Sheet"
          />


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
