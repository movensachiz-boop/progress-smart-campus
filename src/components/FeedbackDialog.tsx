import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";

const FeedbackDialog = ({ compact = false }: { compact?: boolean }) => {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const { role } = useUserRole();

  const submit = async () => {
    if (rating < 1) return toast.error("Please select a star rating");
    if (comment.length > 1000) return toast.error("Comment too long (max 1000 chars)");
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return toast.error("You must be signed in"); }
    // Resolve a human-readable name: prefer the student/staff profile,
    // otherwise derive a friendly name from the email local part.
    let authorName: string | null = null;
    const { data: prof } = await supabase
      .from("profiles")
      .select("first_name, last_name, registration_number")
      .eq("user_id", user.id)
      .maybeSingle();
    if (prof) {
      authorName = `${prof.first_name || ""} ${prof.last_name || ""}`.trim() || prof.registration_number || null;
    }
    if (!authorName) {
      const local = (user.email || "").split("@")[0] || "";
      if (local) {
        authorName = local.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      }
    }
    const { error } = await (supabase as any).from("app_feedback").insert({
      user_id: user.id,
      role: role || null,
      rating,
      comment: comment.trim() || null,
      author_name: authorName || null,
      author_email: user.email || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Thank you for your feedback!");
    setOpen(false);
    setRating(0); setComment(""); setHover(0);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {compact ? (
          <Button variant="ghost" size="icon" className="rounded-full" title="Rate the app">
            <MessageSquare size={18} />
          </Button>
        ) : (
          <Button variant="outline" className="gap-2"><MessageSquare size={16}/> Feedback</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rate the app</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-2">
            {[1,2,3,4,5].map(n => (
              <button
                key={n}
                type="button"
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setRating(n)}
                className="transition-transform hover:scale-110"
                aria-label={`${n} star${n>1?"s":""}`}
              >
                <Star
                  size={36}
                  className={(hover || rating) >= n ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}
                />
              </button>
            ))}
          </div>
          <Textarea
            placeholder="Share what you love or what could be better… (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 1000))}
            rows={4}
          />
          <div className="text-xs text-muted-foreground text-right">{comment.length}/1000</div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || rating < 1}>{saving ? "Sending…" : "Send feedback"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FeedbackDialog;
