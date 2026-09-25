import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const SEEN_KEY = "pcc_seen_announcements";

interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: string;
}

const getSeen = (): string[] => {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); } catch { return []; }
};

const AnnouncementPopup = ({ role }: { role: string }) => {
  const [current, setCurrent] = useState<Announcement | null>(null);
  const [queue, setQueue] = useState<Announcement[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("announcements")
        .select("id, title, body, priority")
        .in("target_role", ["all", role])
        .order("created_at", { ascending: false })
        .limit(10);
      if (!data?.length) return;
      const seen = getSeen();
      const unseen = (data as Announcement[]).filter((a) => !seen.includes(a.id)).reverse();
      if (unseen.length) {
        setCurrent(unseen[0]);
        setQueue(unseen.slice(1));
      }
    })();
  }, [role]);

  const dismiss = () => {
    if (!current) return;
    const seen = getSeen();
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, current.id]));
    const [next, ...rest] = queue;
    setCurrent(next || null);
    setQueue(rest);
  };

  if (!current) return null;

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Megaphone size={20} className="text-accent" /> {current.title}
          </DialogTitle>
          <DialogDescription className="text-xs uppercase tracking-wide">
            {current.priority === "high" ? "Important announcement" : "Announcement"}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{current.body}</p>
        <DialogFooter>
          <Button onClick={dismiss} className="w-full">
            {queue.length ? `Got it (${queue.length} more)` : "Got it"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AnnouncementPopup;
