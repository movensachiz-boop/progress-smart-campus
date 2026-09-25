import { useEffect, useMemo, useRef, useState } from "react";
import { useCalls } from "@/context/CallContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff, UserPlus, Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const VideoTile = ({ stream, name, muted, mirror, showVideo }: { stream: MediaStream | null; name: string; muted?: boolean; mirror?: boolean; showVideo: boolean }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current && stream) ref.current.srcObject = stream; }, [stream]);
  const hasVideo = showVideo && !!stream?.getVideoTracks().some((t) => t.enabled);
  return (
    <div className="relative rounded-xl overflow-hidden bg-sidebar aspect-video flex items-center justify-center">
      <video ref={ref} autoPlay playsInline muted={muted} className={cn("w-full h-full object-cover", !hasVideo && "hidden", mirror && "-scale-x-100")} />
      {!hasVideo && (
        <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="absolute bottom-2 left-2 text-xs px-2 py-0.5 rounded bg-sidebar/80 text-sidebar-foreground">
        {name}{!stream && " · connecting…"}
      </span>
    </div>
  );
};

export const PeoplePicker = ({ exclude = [], onPick, actions }: { exclude?: string[]; onPick?: never; actions: (ids: string[]) => React.ReactNode }) => {
  const calls = useCalls()!;
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const list = useMemo(
    () => calls.online.filter((u) => !exclude.includes(u.user_id) && (u.name + " " + u.role).toLowerCase().includes(q.toLowerCase())),
    [calls.online, q, exclude],
  );
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people online…" className="pl-8" />
      </div>
      <div className="max-h-72 overflow-y-auto border rounded-lg divide-y">
        {list.length === 0 && <p className="text-sm text-muted-foreground p-6 text-center">Nobody else is online right now. People appear here when they have the app open.</p>}
        {list.map((u) => (
          <label key={u.user_id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50">
            <Checkbox checked={sel.includes(u.user_id)} onCheckedChange={(v) => setSel((s) => (v ? [...s, u.user_id] : s.filter((x) => x !== u.user_id)))} />
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span className="flex-1 text-sm font-medium">{u.name}</span>
            <span className="text-xs text-muted-foreground capitalize">{u.role.replace("_", " ")}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-2 justify-end">{actions(sel)}</div>
    </div>
  );
};

const CallOverlay = () => {
  const c = useCalls()!;
  const [addOpen, setAddOpen] = useState(false);

  return (
    <>
      {/* Directory */}
      <Dialog open={c.directoryOpen && !c.inCall} onOpenChange={c.setDirectoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Phone size={18} /> Calls</DialogTitle>
            <DialogDescription>Tick one person for a private call, or several for a group call.</DialogDescription>
          </DialogHeader>
          <PeoplePicker actions={(ids) => (
            <>
              <Button variant="outline" disabled={!ids.length} onClick={() => c.startCall(ids, false)} className="gap-2"><Phone size={14} /> Voice call</Button>
              <Button disabled={!ids.length} onClick={() => c.startCall(ids, true)} className="gap-2"><Video size={14} /> Video call</Button>
            </>
          )} />
        </DialogContent>
      </Dialog>

      {/* Incoming */}
      <Dialog open={!!c.incoming} onOpenChange={(v) => { if (!v) c.decline(); }}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="text-center">Incoming {c.incoming?.video ? "video" : "voice"} call</DialogTitle>
            <DialogDescription className="text-center">{c.incoming?.fromName} is calling you</DialogDescription>
          </DialogHeader>
          <div className="mx-auto w-20 h-20 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-3xl font-bold animate-pulse">
            {c.incoming?.fromName.charAt(0).toUpperCase()}
          </div>
          <div className="flex justify-center gap-6 pt-2">
            <Button size="lg" variant="destructive" className="rounded-full gap-2" onClick={c.decline}><PhoneOff size={18} /> Decline</Button>
            <Button size="lg" className="rounded-full gap-2" onClick={c.accept}>{c.incoming?.video ? <Video size={18} /> : <Phone size={18} />} Answer</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Active call */}
      {c.inCall && (
        <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-md flex flex-col">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <Users size={18} className="text-primary" />
            <span className="font-semibold">{c.video ? "Video" : "Voice"} call</span>
            <span className="text-sm text-muted-foreground">· {c.peers.length + 1} in call</span>
            {c.ringingTo.length > 0 && (
              <span className="ml-auto text-sm text-muted-foreground animate-pulse">
                Ringing {c.ringingTo.map((id) => c.online.find((u) => u.user_id === id)?.name || "…").join(", ")}
              </span>
            )}
          </div>
          <div className={cn("flex-1 overflow-y-auto p-4 grid gap-3 content-center",
            c.peers.length === 0 ? "grid-cols-1 max-w-xl mx-auto w-full" : c.peers.length === 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-2 lg:grid-cols-3")}>
            <VideoTile stream={c.localStream} name={`${c.me?.name || "You"} (you)`} muted mirror showVideo={c.video && c.camOn} />
            {c.peers.map((p) => <VideoTile key={p.userId} stream={p.stream} name={p.name} showVideo={c.video} />)}
          </div>
          <div className="p-4 border-t flex justify-center gap-3">
            <Button size="lg" variant={c.micOn ? "outline" : "secondary"} className="rounded-full" onClick={c.toggleMic} aria-label="Toggle microphone">
              {c.micOn ? <Mic size={20} /> : <MicOff size={20} />}
            </Button>
            {c.video && (
              <Button size="lg" variant={c.camOn ? "outline" : "secondary"} className="rounded-full" onClick={c.toggleCam} aria-label="Toggle camera">
                {c.camOn ? <Video size={20} /> : <VideoOff size={20} />}
              </Button>
            )}
            <Button size="lg" variant="outline" className="rounded-full" onClick={() => setAddOpen(true)} aria-label="Add people">
              <UserPlus size={20} />
            </Button>
            <Button size="lg" variant="destructive" className="rounded-full gap-2" onClick={c.hangUp}>
              <PhoneOff size={20} /> End
            </Button>
          </div>
        </div>
      )}

      <Dialog open={addOpen && c.inCall} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md z-[110]">
          <DialogHeader>
            <DialogTitle>Add people to the call</DialogTitle>
            <DialogDescription>They will get a ringing call and join this group.</DialogDescription>
          </DialogHeader>
          <PeoplePicker exclude={[...c.peers.map((p) => p.userId), ...c.ringingTo]} actions={(ids) => (
            <Button disabled={!ids.length} onClick={() => { c.invite(ids); setAddOpen(false); }} className="gap-2"><UserPlus size={14} /> Invite</Button>
          )} />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CallOverlay;
