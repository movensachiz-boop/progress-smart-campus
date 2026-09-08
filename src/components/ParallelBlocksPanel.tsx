import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTimetable } from '@/context/TimetableContext';
import { loadParallelBlocks, saveParallelBlocks, type ParallelBlock } from '@/lib/parallelBlocks';
import { v4 } from '@/lib/utils';

export default function ParallelBlocksPanel() {
  const { classes, subjects } = useTimetable();
  const [blocks, setBlocksState] = useState<ParallelBlock[]>(() => loadParallelBlocks());

  const setBlocks = (next: ParallelBlock[]) => {
    setBlocksState(next);
    saveParallelBlocks(next);
  };

  const classLabel = (id: string) => {
    const c = classes.find(x => x.id === id);
    return c ? `Form ${c.form} ${c.stream}` : id;
  };

  const forms = [...new Set(classes.map(c => c.form))].sort((a, b) => a - b);

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

  /** Subjects taken by the class, plus every other subject so nothing is missing. */
  const subjectsFor = (classId: string) => {
    const c = classes.find(x => x.id === classId);
    const ids = new Set(c?.subjectIds || []);
    const taken = subjects.filter(s => ids.has(s.id)).sort(byName);
    const others = subjects.filter(s => !ids.has(s.id)).sort(byName);
    return { taken, others };
  };

  const addBlock = () =>
    setBlocks([
      ...blocks,
      { id: v4(), name: `Same-time group ${blocks.length + 1}`, form: forms[0], entries: [] },
    ]);

  const updateBlock = (id: string, patch: Partial<ParallelBlock>) =>
    setBlocks(blocks.map(b => (b.id === id ? { ...b, ...patch } : b)));

  const removeBlock = (id: string) => setBlocks(blocks.filter(b => b.id !== id));

  const addEntry = (block: ParallelBlock) =>
    updateBlock(block.id, { entries: [...block.entries, { classId: '', subjectId: '' }] });

  const updateEntry = (block: ParallelBlock, idx: number, patch: Partial<{ classId: string; subjectId: string }>) =>
    updateBlock(block.id, {
      entries: block.entries.map((e, i) => (i === idx ? { ...e, ...patch } : e)),
    });

  const removeEntry = (block: ParallelBlock, idx: number) =>
    updateBlock(block.id, { entries: block.entries.filter((_, i) => i !== idx) });

  return (
    <div className="bg-card rounded-xl border p-6">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Link2 className="w-4 h-4 text-primary" /> Subjects That Must Run At The Same Time
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Add a group and list each class with the subject it takes in that slot — for example Form 5 Sciences
            Physics together with Form 5 Commercials Accounts. When the timetable is generated these lessons are
            placed in exactly the same periods, so learners can move between them without clashes.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={addBlock}>
          <Plus className="w-4 h-4 mr-1" /> Add group
        </Button>
      </div>

      {blocks.length === 0 && (
        <p className="text-sm text-muted-foreground mt-4">No groups yet. Click “Add group” to create one.</p>
      )}

      <div className="space-y-4 mt-4">
        {blocks.map(block => (
          <div key={block.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={block.name}
                onChange={e => updateBlock(block.id, { name: e.target.value })}
                placeholder="Group name (e.g. A-Level Block A)"
                className="max-w-xs"
              />
              <select
                className="border rounded-md h-9 px-2 text-sm bg-background"
                value={block.form ?? ''}
                onChange={e => {
                  const form = e.target.value ? Number(e.target.value) : undefined;
                  updateBlock(block.id, {
                    form,
                    entries: block.entries.filter(en => {
                      const c = classes.find(x => x.id === en.classId);
                      return !form || !c || c.form === form;
                    }),
                  });
                }}
              >
                <option value="">All forms</option>
                {forms.map(f => (
                  <option key={f} value={f}>Form {f}</option>
                ))}
              </select>
              <Button size="sm" variant="ghost" onClick={() => removeBlock(block.id)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>

            <div className="space-y-2">
              {block.entries.map((entry, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2">
                  <select
                    className="border rounded-md h-9 px-2 text-sm bg-background min-w-[10rem]"
                    value={entry.classId}
                    onChange={e => updateEntry(block, idx, { classId: e.target.value, subjectId: '' })}
                  >
                    <option value="">Select class…</option>
                    {[...classes]
                      .filter(c => !block.form || c.form === block.form)
                      .sort((a, b) => a.form - b.form || a.stream.localeCompare(b.stream))
                      .map(c => (
                        <option key={c.id} value={c.id}>{classLabel(c.id)}</option>
                      ))}
                  </select>

                  <select
                    className="border rounded-md h-9 px-2 text-sm bg-background min-w-[12rem]"
                    value={entry.subjectId}
                    disabled={!entry.classId}
                    onChange={e => updateEntry(block, idx, { subjectId: e.target.value })}
                  >
                    <option value="">Select subject…</option>
                    {entry.classId && (
                      <>
                        <optgroup label="Taken by this class">
                          {subjectsFor(entry.classId).taken.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Other subjects">
                          {subjectsFor(entry.classId).others.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </optgroup>
                      </>
                    )}
                  </select>

                  <Button size="sm" variant="ghost" onClick={() => removeEntry(block, idx)}>
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => addEntry(block)}>
                <Plus className="w-4 h-4 mr-1" /> Add class + subject
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const valid = block.entries.filter(e => e.classId && e.subjectId);
                  if (valid.length < 2) {
                    toast.error('Add at least two class + subject rows to this group');
                    return;
                  }
                  toast.success('Saved — these lessons will share the same periods on the next generation');
                }}
              >
                Check group
              </Button>
            </div>
          </div>
        ))}
      </div>

      {blocks.length > 0 && (
        <p className="text-xs text-muted-foreground mt-4">
          Changes save automatically. Unlock and regenerate the timetable to apply them.
        </p>
      )}
    </div>
  );
}
