import { useEffect, useMemo, useRef, useState } from "react";
import { useCalls } from "@/context/CallContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff, UserPlus, Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { CallMinutes, fmtElapsed } from "./CallMinutes";
import { NotebookPen, Timer } from "lucide-react";

const RemoteAudio = ({ stream }: { stream: MediaStream | null }) => {
  const ref = useRef<HTMLAudioElement>(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    const play = () => el.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
    play();
    stream.addEventListener("addtrack", play);
    return () => stream.removeEventListener("addtrack", play);
  }, [stream]);
  return (
    <>
      <audio ref={ref} autoPlay playsInline />
      {blocked && (
        <Button size="sm" className="absolute top-2 right-2 z-10" onClick={() => ref.current?.play().then(() => setBlocked(false)).catch(() => {})}>
          Tap to hear
        </Button>
      )}
    </>
  );
};

const VideoTile = ({ stream, name, muted, mirror, showVideo }: { stream: MediaStream | null; name: string; muted?: boolean; mirror?: boolean; showVideo: boolean }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current && stream) { ref.current.srcObject = stream; ref.current.play().catch(() => {}); } }, [stream]);
  const hasVideo = showVideo && !!stream?.getVideoTracks().some((t) => t.enabled);
  return (
    <div className="relative rounded-xl overflow-hidden bg-sidebar aspect-video flex items-center justify-center">
      {!muted && <RemoteAudio stream={stream} />}
      <video ref={ref} autoPlay playsInline muted className={cn("w-full h-full object-cover", !hasVideo && "hidden", mirror && "-scale-x-100")} />
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
  const [found, setFound] = useState<{ user_id: string; name: string; role: string }[]>([]);
  const term = q.trim().toLowerCase();
  useEffect(() => {
    if (term.length < 2) { setFound([]); return; }
    const t = setTimeout(async () => {
      const like = `%${term}%`;
      const [{ data: students }, { data: staff }] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, first_name, last_name, registration_number, form, stream")
          .not("user_id", "is", null)
          .or(`first_name.ilike.${like},last_name.ilike.${like},registration_number.ilike.${like}`)
          .limit(30),
        supabase.rpc("search_staff_for_calls", { p_term: term }),
      ]);
      const merged = new Map<string, { user_id: string; name: string; role: string }>();
      (staff || []).forEach((s: any) => {
        if (s.user_id) merged.set(s.user_id, { user_id: s.user_id, name: s.name || "Staff", role: s.role || "staff" });
      });
      (students || []).forEach((p: any) => {
        if (p.user_id && !merged.has(p.user_id)) merged.set(p.user_id, {
          user_id: p.user_id,
          name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.registration_number,
          role: [p.form, p.stream].filter(Boolean).join(" ") || "student",
        });
      });
      setFound(Array.from(merged.values()));
    }, 300);
    return () => clearTimeout(t);
  }, [term]);
  const onlineIds = new Set(calls.online.map((u) => u.user_id));
  const list = useMemo(() => {
    const words = term.split(/\s+/).filter(Boolean);
    const match = (s: string) => words.every((w) => s.toLowerCase().includes(w));
    const on = calls.online.filter((u) => !exclude.includes(u.user_id) && match(`${u.name || ""} ${u.role || ""}`));
    const off = found.filter((u) => !exclude.includes(u.user_id) && !onlineIds.has(u.user_id) && u.user_id !== calls.me?.user_id);
    return [...on.map((u) => ({ ...u, isOn: true })), ...off.map((u) => ({ ...u, isOn: false }))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calls.online, found, term, exclude]);
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or reg number…" className="pl-8" />
      </div>
      <div className="max-h-72 overflow-y-auto border rounded-lg divide-y">
        {list.length === 0 && <p className="text-sm text-muted-foreground p-6 text-center">{term ? "No one found with that name." : "Nobody else is online right now. Type a name to search everyone."}</p>}
        {list.map((u) => (
          <label key={u.user_id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50">
            <Checkbox checked={sel.includes(u.user_id)} onCheckedChange={(v) => setSel((s) => (v ? [...s, u.user_id] : s.filter((x) => x !== u.user_id)))} />
            <span className={cn("w-2 h-2 rounded-full", u.isOn ? "bg-primary" : "bg-muted-foreground/40")} />
            <span className="flex-1 text-sm font-medium">{u.name}{!u.isOn && <span className="ml-1 text-xs text-muted-foreground">(offline)</span>}</span>
            <span className="text-xs text-muted-foreground capitalize">{(u.role || "").replace("_", " ")}</span>
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
  const [minutesOpen, setMinutesOpen] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!c.inCall) { setStartedAt(null); return; }
    setStartedAt((s) => s ?? Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [c.inCall]);

  const [askAlerts, setAskAlerts] = useState(false);
  useEffect(() => {
    if (!c.alertsSupported || c.alertsOn) { setAskAlerts(false); return; }
    if (typeof Notification !== "undefined" && Notification.permission === "denied") return;
    const t = setTimeout(() => {
      const last = Number(localStorage.getItem("pcc_alerts_asked") || 0);
      if (Date.now() - last > 12 * 3600 * 1000) setAskAlerts(true);
    }, 2500);
    return () => clearTimeout(t);
  }, [c.alertsSupported, c.alertsOn]);
  const closeAsk = () => { localStorage.setItem("pcc_alerts_asked", String(Date.now())); setAskAlerts(false); };

  return (
    <>
      <Dialog open={askAlerts && !c.inCall && !c.incoming} onOpenChange={(v) => { if (!v) closeAsk(); }}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="text-center flex items-center justify-center gap-2"><Phone size={18} /> Receive calls when the app is closed</DialogTitle>
            <DialogDescription className="text-center">Turn on call alerts so your phone rings and shows the call even when this app is closed. Tap Allow when your phone asks.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center gap-3 pt-2">
            <Button variant="outline" onClick={closeAsk}>Later</Button>
            <Button onClick={async () => { await c.enableAlerts(); closeAsk(); }}>Turn on call alerts</Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Directory */}
      <Dialog open={c.directoryOpen && !c.inCall} onOpenChange={c.setDirectoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Phone size={18} /> Calls</DialogTitle>
            <DialogDescription>Tick one person for a private call, or several for a group call.</DialogDescription>
          </DialogHeader>
          {c.alertsSupported && !c.alertsOn && (
            <Button variant="secondary" size="sm" onClick={c.enableAlerts} className="w-full">
              Turn on call alerts (ring when the app is closed)
            </Button>
          )}
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
            {startedAt && <span className="flex items-center gap-1 text-sm font-mono text-primary ml-2"><Timer size={14} />{fmtElapsed(now - startedAt)}</span>}
            {c.ringingTo.length > 0 && (
              <span className="ml-auto text-sm text-muted-foreground animate-pulse">
                Ringing {c.ringingTo.map((id) => c.online.find((u) => u.user_id === id)?.name || "…").join(", ")}
              </span>
            )}
          </div>
          <div className="flex-1 flex min-h-0">
          <div className={cn("flex-1 overflow-y-auto p-4 grid gap-3 content-center",
            c.peers.length === 0 ? "grid-cols-1 max-w-xl mx-auto w-full" : c.peers.length === 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-2 lg:grid-cols-3")}>
            <VideoTile stream={c.localStream} name={`${c.me?.name || "You"} (you)`} muted mirror showVideo={c.video && c.camOn} />
            {c.peers.map((p) => <VideoTile key={p.userId} stream={p.stream} name={p.name} showVideo={c.video} />)}
          </div>
          {minutesOpen && startedAt && (
            <div className="w-full sm:w-96 absolute sm:static inset-x-0 bottom-20 top-14 sm:inset-auto">
              <CallMinutes startedAt={startedAt} participants={[c.me?.name || "Me", ...c.peers.map((p) => p.name)]} onClose={() => setMinutesOpen(false)} />
            </div>
          )}
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
            <Button size="lg" variant="outline" className="rounded-full" onClick={() => setMinutesOpen((v) => !v)} aria-label="Meeting minutes">
              <NotebookPen size={20} />
            </Button>
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
