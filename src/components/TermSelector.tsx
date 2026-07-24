import { useState } from "react";
import { useTerm, termLabel } from "@/context/TermContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";

export default function TermSelector() {
  const { terms, selectedTermId, setSelectedTermId, currentTerm, startNewTerm } = useTerm();
  const { role } = useUserRole();
  const canManage = role === "admin" || role === "owner";
  const [open, setOpen] = useState(false);
  const [num, setNum] = useState<number>(((currentTerm?.term_number ?? 0) % 3) + 1);
  const [year, setYear] = useState<number>(currentTerm?.year ?? new Date().getFullYear());
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    setBusy(true);
    try {
      await startNewTerm(num, year);
      toast.success(`Started Term ${num} ${year}. New data will be recorded under this term.`);
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to start new term");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Viewing:</span>
        <Select value={selectedTermId ?? undefined} onValueChange={setSelectedTermId}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Select term" /></SelectTrigger>
          <SelectContent>
            {terms.map(t => (
              <SelectItem key={t.id} value={t.id}>
                {termLabel(t)}{t.is_current ? " (current)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {canManage && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-2">
              <CalendarPlus size={16} /> Start New Term
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Start a new term</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                The new term becomes the active period. Fixed data (students, teachers, subjects,
                classes, timetable, fee structure, inventory & kitchen stock) stays exactly as it is.
                Payments, exam results, attendance, announcements, requisitions, fund expenses and
                sales collected from now on will be tagged under the new term. Previous term data
                is archived and stays viewable via the term selector.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Term number</Label>
                  <Select value={String(num)} onValueChange={v => setNum(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Term 1</SelectItem>
                      <SelectItem value="2">Term 2</SelectItem>
                      <SelectItem value="3">Term 3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Year</Label>
                  <Input type="number" value={year} onChange={e => setYear(Number(e.target.value))} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={busy}>{busy ? "Starting…" : "Start Term"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
