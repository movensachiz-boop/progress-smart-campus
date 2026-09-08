import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTimetable } from '@/context/TimetableContext';
import { loadParallelBlocks, saveParallelBlocks, expandBlocks, type ParallelBlock } from '@/lib/parallelBlocks';
import { v4 } from '@/lib/utils';

export default function ParallelBlocksPanel() {
  const { classes, subjects } = useTimetable();
  const [blocks, setBlocksState] = useState<ParallelBlock[]>(() => loadParallelBlocks());

  const setBlocks = (next: ParallelBlock[]) => {
    setBlocksState(next);
    saveParallelBlocks(next);
  };

  const forms = [...new Set(classes.map(c => c.form))].sort((a, b) => a - b);
  const sortedSubjects = [...subjects].sort((a, b) => a.name.localeCompare(b.name));

  const addBlock = () =>
    setBlocks([
      ...blocks,
      { id: v4(), name: `Same-time group ${blocks.length + 1}`, subjectIds: [], entries: [] },
    ]);

  const updateBlock = (id: string, patch: Partial<ParallelBlock>) =>
    setBlocks(blocks.map(b => (b.id === id ? { ...b, ...patch } : b)));

  const removeBlock = (id: string) => setBlocks(blocks.filter(b => b.id !== id));

  const toggleSubject = (block: ParallelBlock, subjectId: string) => {
    const current = block.subjectIds || [];
    updateBlock(block.id, {
      subjectIds: current.includes(subjectId)
        ? current.filter(id => id !== subjectId)
        : [...current, subjectId],
    });
  };

  /** Which classes will actually be matched for this group, per form. */
  const coverage = (block: ParallelBlock) =>
    expandBlocks([block], classes).map(g => ({
      name: g.name,
      classes: [...new Set(g.entries.map(e => e.classId))].map(id => {
        const c = classes.find(x => x.id === id);
        return c ? `${c.form}${c.stream}` : id;
      }),
    }));

  return (
    <div className="bg-card rounded-xl border p-6">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Link2 className="w-4 h-4 text-primary" /> Subjects That Must Run At The Same Time
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Pick a pair (or more) of subjects. Those subjects are then timetabled in exactly the same periods in
            every form and every stream that studies them, so learners can move between them without clashes.
            Choose a form if the pairing should only apply to one form.
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
        {blocks.map(block => {
          const picked = block.subjectIds || [];
          const cover = coverage(block);
          return (
            <div key={block.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={block.name}
                  onChange={e => updateBlock(block.id, { name: e.target.value })}
                  placeholder="Group name (e.g. Option Block A)"
                  className="max-w-xs"
                />
                <select
                  className="border rounded-md h-9 px-2 text-sm bg-background"
                  value={block.form ?? ''}
                  onChange={e =>
                    updateBlock(block.id, { form: e.target.value ? Number(e.target.value) : undefined })
                  }
                >
                  <option value="">Every form</option>
                  {forms.map(f => (
                    <option key={f} value={f}>Form {f} only</option>
                  ))}
                </select>
                <Button size="sm" variant="ghost" onClick={() => removeBlock(block.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1.5">
                  Subjects in this group {picked.length > 0 && `· ${picked.length} selected`}
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {sortedSubjects.map(s => {
                    const active = picked.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleSubject(block, s.id)}
                        className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                          active
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted text-muted-foreground border-border'
                        }`}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                  {sortedSubjects.length === 0 && (
                    <span className="text-xs text-muted-foreground italic">No subjects registered yet.</span>
                  )}
                </div>
              </div>

              {picked.length >= 2 && (
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  {cover.length === 0 ? (
                    <p className="text-destructive">No class studies two or more of these subjects yet.</p>
                  ) : (
                    cover.map(c => (
                      <p key={c.name}>
                        {c.name}: {c.classes.join(', ')}
                      </p>
                    ))
                  )}
                </div>
              )}

              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (picked.length < 2) {
                    toast.error('Pick at least two subjects for this group');
                    return;
                  }
                  toast.success('Saved — these subjects will share the same periods on the next generation');
                }}
              >
                Check group
              </Button>
            </div>
          );
        })}
      </div>

      {blocks.length > 0 && (
        <p className="text-xs text-muted-foreground mt-4">
          Changes save automatically. Unlock and regenerate the timetable to apply them.
        </p>
      )}
    </div>
  );
}
