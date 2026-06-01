import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Smartphone, Loader2, Check, X, Trash2, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PhoneCameraPairDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPhotos: (dataUrls: string[]) => void | Promise<void>;
  title?: string;
}

const genId = () =>
  (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36));

const PhoneCameraPairDialog = ({ open, onOpenChange, onPhotos, title = "Use Phone as Camera" }: PhoneCameraPairDialogProps) => {
  const { toast } = useToast();
  const [sessionId] = useState(() => genId());
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [phoneOnline, setPhoneOnline] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const url = `${window.location.origin}/phone-scan/${sessionId}`;

  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(url, { width: 320, margin: 1 }).then(setQrDataUrl).catch(() => {});

    const ch = supabase.channel(`phone-scan:${sessionId}`, { config: { broadcast: { ack: true } } });
    ch.on("broadcast", { event: "phone-online" }, () => setPhoneOnline(true));
    ch.on("broadcast", { event: "photo" }, (msg) => {
      const dataUrl = (msg.payload as any)?.dataUrl;
      if (typeof dataUrl === "string") {
        setPhotos((prev) => [...prev, dataUrl]);
        toast({ title: "Photo received", description: "From your phone." });
      }
    });
    ch.subscribe();
    channelRef.current = ch;

    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
      setPhoneOnline(false);
      setPhotos([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId]);

  const removePhoto = (i: number) => setPhotos((p) => p.filter((_, idx) => idx !== i));

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const finish = async () => {
    if (photos.length === 0) return;
    setSubmitting(true);
    try {
      await onPhotos(photos);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Smartphone size={18} /> {title}</DialogTitle>
          <DialogDescription>
            Scan the QR with your phone. Capture photos there — they will appear here instantly.
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="flex flex-col items-center justify-center gap-3 p-4 border rounded-lg bg-muted/30">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Scan with phone" className="w-56 h-56 rounded bg-white p-2" />
            ) : (
              <div className="w-56 h-56 flex items-center justify-center"><Loader2 className="animate-spin" /></div>
            )}
            <div className="text-center text-xs text-muted-foreground break-all px-2">{url}</div>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={copyLink} className="gap-2">
                <Copy size={12} /> Copy link
              </Button>
              <span className={`text-xs flex items-center gap-1 ${phoneOnline ? "text-green-600" : "text-muted-foreground"}`}>
                <span className={`h-2 w-2 rounded-full ${phoneOnline ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40"}`} />
                {phoneOnline ? "Phone connected" : "Waiting for phone…"}
              </span>
            </div>
          </div>

          <div className="border rounded-lg p-3 min-h-[260px]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Received photos ({photos.length})</p>
              {photos.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setPhotos([])} className="gap-1 text-xs">
                  <Trash2 size={12} /> Clear
                </Button>
              )}
            </div>
            {photos.length === 0 ? (
              <div className="text-xs text-muted-foreground py-10 text-center">
                No photos yet. Capture from your phone.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 max-h-[260px] overflow-y-auto">
                {photos.map((src, i) => (
                  <div key={i} className="relative group">
                    <img src={src} alt={`Photo ${i + 1}`} className="w-full aspect-square object-cover rounded border" />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting} className="gap-2">
            <X size={14} /> Cancel
          </Button>
          <Button onClick={finish} disabled={submitting || photos.length === 0} className="gap-2">
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Use {photos.length} photo{photos.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PhoneCameraPairDialog;
