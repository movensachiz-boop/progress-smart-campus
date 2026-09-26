import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import CallOverlay from "@/components/calls/CallOverlay";

export interface OnlineUser { user_id: string; name: string; role: string }
export interface IncomingCall { roomId: string; from: string; fromName: string; video: boolean }
export interface RemotePeer { userId: string; name: string; stream: MediaStream | null }

interface CallCtx {
  me: OnlineUser | null;
  online: OnlineUser[];
  incoming: IncomingCall | null;
  inCall: boolean;
  roomId: string | null;
  video: boolean;
  localStream: MediaStream | null;
  peers: RemotePeer[];
  ringingTo: string[];
  micOn: boolean;
  camOn: boolean;
  directoryOpen: boolean;
  setDirectoryOpen: (v: boolean) => void;
  startCall: (userIds: string[], video: boolean) => Promise<void>;
  invite: (userIds: string[]) => void;
  accept: () => Promise<void>;
  decline: () => void;
  hangUp: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
}

const Ctx = createContext<CallCtx | null>(null);
export const useCalls = () => useContext(Ctx);

const ICE: RTCConfiguration = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    { urls: "stun:stun.cloudflare.com:3478" },
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

const genId = () => crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36);

export const CallProvider = ({ children }: { children: ReactNode }) => {
  const [me, setMe] = useState<OnlineUser | null>(null);
  const [online, setOnline] = useState<OnlineUser[]>([]);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [video, setVideo] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<RemotePeer[]>([]);
  const [ringingTo, setRingingTo] = useState<string[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [directoryOpen, setDirectoryOpen] = useState(false);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pcs = useRef(new Map<string, RTCPeerConnection>());
  const pendingIce = useRef(new Map<string, RTCIceCandidateInit[]>());
  const roomRef = useRef<string | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const meRef = useRef<OnlineUser | null>(null);
  const onlineRef = useRef<OnlineUser[]>([]);
  const incomingRef = useRef<IncomingCall | null>(null);
  const ringTimer = useRef<number | null>(null);

  useEffect(() => { meRef.current = me; }, [me]);
  useEffect(() => { onlineRef.current = online; }, [online]);
  useEffect(() => { incomingRef.current = incoming; }, [incoming]);

  const nameOf = (id: string) => onlineRef.current.find((u) => u.user_id === id)?.name || "Participant";

  const send = useCallback((event: string, payload: Record<string, unknown>) => {
    channelRef.current?.send({ type: "broadcast", event, payload: { ...payload, from: meRef.current?.user_id } });
  }, []);

  // Identify current user
  useEffect(() => {
    const load = async (uid: string | undefined, email?: string | null) => {
      if (!uid) { setMe(null); return; }
      const [{ data: prof }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("first_name,last_name").eq("user_id", uid).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);
      const roleList = (roles || []).map((r: any) => r.role as string);
      const role = roleList.find((r) => r !== "student" && r !== "admin") || roleList[0] || "student";
      let name = prof ? `${prof.first_name} ${prof.last_name}`.trim() : "";
      if (!name) name = (email || "User").split("@")[0].replace(/[._]/g, " ");
      setMe({ user_id: uid, name, role });
    };
    supabase.auth.getUser().then(({ data }) => load(data.user?.id, data.user?.email));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s?.user?.id !== meRef.current?.user_id) load(s?.user?.id, s?.user?.email);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const removePeer = useCallback((uid: string) => {
    pcs.current.get(uid)?.close();
    pcs.current.delete(uid);
    pendingIce.current.delete(uid);
    setPeers((p) => p.filter((x) => x.userId !== uid));
  }, []);

  const cleanup = useCallback(() => {
    pcs.current.forEach((pc) => pc.close());
    pcs.current.clear();
    pendingIce.current.clear();
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    roomRef.current = null;
    setLocalStream(null);
    setPeers([]);
    setRoomId(null);
    setRingingTo([]);
    setMicOn(true);
    setCamOn(true);
    if (ringTimer.current) window.clearTimeout(ringTimer.current);
  }, []);

  const makePc = useCallback((uid: string) => {
    let pc = pcs.current.get(uid);
    if (pc) return pc;
    pc = new RTCPeerConnection(ICE);
    pcs.current.set(uid, pc);
    localRef.current?.getTracks().forEach((t) => pc!.addTrack(t, localRef.current!));
    pc.onicecandidate = (e) => {
      if (e.candidate) send("ice", { roomId: roomRef.current, to: uid, candidate: e.candidate.toJSON() });
    };
    const fallback = new MediaStream();
    pc.ontrack = (e) => {
      let stream = e.streams[0];
      if (!stream) { fallback.addTrack(e.track); stream = fallback; }
      setPeers((p) => {
        const exists = p.find((x) => x.userId === uid);
        if (exists) return p.map((x) => (x.userId === uid ? { ...x, stream } : x));
        return [...p, { userId: uid, name: nameOf(uid), stream }];
      });
    };
    pc.onconnectionstatechange = () => {
      if (pc!.connectionState === "failed" || pc!.connectionState === "closed") removePeer(uid);
    };
    setPeers((p) => (p.find((x) => x.userId === uid) ? p : [...p, { userId: uid, name: nameOf(uid), stream: null }]));
    setRingingTo((r) => r.filter((x) => x !== uid));
    return pc;
  }, [send, removePeer]);

  const flushIce = async (uid: string) => {
    const pc = pcs.current.get(uid);
    const list = pendingIce.current.get(uid) || [];
    pendingIce.current.delete(uid);
    for (const c of list) { try { await pc?.addIceCandidate(c); } catch { /* ignore */ } }
  };

  // Signaling channel + presence
  useEffect(() => {
    if (!me) return;
    const ch = supabase.channel("pcc-calls", { config: { presence: { key: me.user_id }, broadcast: { self: false } } });

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState() as Record<string, any[]>;
      const list: OnlineUser[] = [];
      Object.values(state).forEach((arr) => { const u = arr[0]; if (u?.user_id && u.user_id !== me.user_id) list.push({ user_id: u.user_id, name: u.name, role: u.role }); });
      list.sort((a, b) => a.name.localeCompare(b.name));
      setOnline(list);
    });

    ch.on("broadcast", { event: "invite" }, ({ payload }) => {
      if (!(payload.to as string[]).includes(me.user_id)) return;
      if (roomRef.current || incomingRef.current) { send("decline", { roomId: payload.roomId, to: payload.from, busy: true }); return; }
      setIncoming({ roomId: payload.roomId, from: payload.from, fromName: payload.fromName, video: payload.video });
      navigator.vibrate?.([400, 200, 400, 200, 400]);
    });
    ch.on("broadcast", { event: "cancel" }, ({ payload }) => {
      if (incomingRef.current?.roomId === payload.roomId && incomingRef.current.from === payload.from) setIncoming(null);
    });
    ch.on("broadcast", { event: "decline" }, ({ payload }) => {
      if (payload.to !== me.user_id || payload.roomId !== roomRef.current) return;
      setRingingTo((r) => r.filter((x) => x !== payload.from));
      toast({ title: `${nameOf(payload.from)} ${payload.busy ? "is on another call" : "declined the call"}` });
    });
    ch.on("broadcast", { event: "join" }, async ({ payload }) => {
      if (!roomRef.current || payload.roomId !== roomRef.current) return;
      const pc = makePc(payload.from);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send("offer", { roomId: roomRef.current, to: payload.from, sdp: offer });
    });
    ch.on("broadcast", { event: "offer" }, async ({ payload }) => {
      if (payload.to !== me.user_id || payload.roomId !== roomRef.current) return;
      const pc = makePc(payload.from);
      await pc.setRemoteDescription(payload.sdp);
      await flushIce(payload.from);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send("answer", { roomId: roomRef.current, to: payload.from, sdp: answer });
    });
    ch.on("broadcast", { event: "answer" }, async ({ payload }) => {
      if (payload.to !== me.user_id || payload.roomId !== roomRef.current) return;
      const pc = pcs.current.get(payload.from);
      if (pc && pc.signalingState === "have-local-offer") { await pc.setRemoteDescription(payload.sdp); await flushIce(payload.from); }
    });
    ch.on("broadcast", { event: "ice" }, async ({ payload }) => {
      if (payload.to !== me.user_id || payload.roomId !== roomRef.current) return;
      const pc = pcs.current.get(payload.from);
      if (pc?.remoteDescription) { try { await pc.addIceCandidate(payload.candidate); } catch { /* ignore */ } }
      else { const l = pendingIce.current.get(payload.from) || []; l.push(payload.candidate); pendingIce.current.set(payload.from, l); }
    });
    ch.on("broadcast", { event: "leave" }, ({ payload }) => {
      if (payload.roomId !== roomRef.current) return;
      removePeer(payload.from);
      setRingingTo((r) => r.filter((x) => x !== payload.from));
    });

    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") await ch.track({ user_id: me.user_id, name: me.name, role: me.role });
    });
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); channelRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const getMedia = async (withVideo: boolean) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: withVideo ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } : false,
    });
    localRef.current = stream;
    setLocalStream(stream);
    return stream;
  };

  const mediaError = (e: unknown) => {
    toast({ title: "Microphone/camera blocked", description: "Allow microphone (and camera) access in your browser to make calls.", variant: "destructive" });
    console.error(e);
  };

  const invite = useCallback((userIds: string[]) => {
    const rid = roomRef.current;
    const m = meRef.current;
    if (!rid || !m || userIds.length === 0) return;
    send("invite", { roomId: rid, to: userIds, fromName: m.name, video });
    setRingingTo((r) => Array.from(new Set([...r, ...userIds])));
    userIds.forEach((uid) => window.setTimeout(() => {
      setRingingTo((r) => {
        if (r.includes(uid)) { send("cancel", { roomId: rid, to: uid }); return r.filter((x) => x !== uid); }
        return r;
      });
    }, 45000));
  }, [send, video]);

  const startCall = useCallback(async (userIds: string[], withVideo: boolean) => {
    if (roomRef.current || userIds.length === 0) return;
    try { await getMedia(withVideo); } catch (e) { mediaError(e); return; }
    const rid = genId();
    roomRef.current = rid;
    setRoomId(rid);
    setVideo(withVideo);
    setDirectoryOpen(false);
    const m = meRef.current!;
    send("invite", { roomId: rid, to: userIds, fromName: m.name, video: withVideo });
    setRingingTo(userIds);
    ringTimer.current = window.setTimeout(() => {
      setRingingTo((r) => { if (r.length) send("cancel", { roomId: rid }); return []; });
    }, 45000);
  }, [send]);

  const accept = useCallback(async () => {
    const inc = incomingRef.current;
    if (!inc) return;
    try { await getMedia(inc.video); } catch (e) { mediaError(e); send("decline", { roomId: inc.roomId, to: inc.from }); setIncoming(null); return; }
    roomRef.current = inc.roomId;
    setRoomId(inc.roomId);
    setVideo(inc.video);
    setIncoming(null);
    send("join", { roomId: inc.roomId });
  }, [send]);

  const decline = useCallback(() => {
    const inc = incomingRef.current;
    if (inc) send("decline", { roomId: inc.roomId, to: inc.from });
    setIncoming(null);
  }, [send]);

  const hangUp = useCallback(() => {
    if (roomRef.current) {
      send("leave", { roomId: roomRef.current });
      if (peers.length === 0) send("cancel", { roomId: roomRef.current });
    }
    cleanup();
  }, [send, cleanup, peers.length]);

  // When everyone else leaves after connecting, end the call automatically
  const hadPeers = useRef(false);
  useEffect(() => {
    if (peers.length > 0) hadPeers.current = true;
    else if (hadPeers.current && roomId && ringingTo.length === 0) {
      hadPeers.current = false;
      toast({ title: "Call ended" });
      cleanup();
    }
    if (!roomId) hadPeers.current = false;
  }, [peers.length, roomId, ringingTo.length, cleanup]);

  // Ringing with nobody answering -> end
  useEffect(() => {
    if (roomId && peers.length === 0 && ringingTo.length === 0 && !hadPeers.current) {
      const t = window.setTimeout(() => {
        if (roomRef.current && pcs.current.size === 0) { toast({ title: "No answer" }); cleanup(); }
      }, 1500);
      return () => window.clearTimeout(t);
    }
  }, [roomId, peers.length, ringingTo.length, cleanup]);

  const toggleMic = () => {
    const t = localRef.current?.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; setMicOn(t.enabled); }
  };
  const toggleCam = () => {
    const t = localRef.current?.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; setCamOn(t.enabled); }
  };

  useEffect(() => {
    const onUnload = () => { if (roomRef.current) send("leave", { roomId: roomRef.current }); };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [send]);

  const value: CallCtx = {
    me, online, incoming, inCall: !!roomId, roomId, video, localStream, peers, ringingTo, micOn, camOn,
    directoryOpen, setDirectoryOpen, startCall, invite, accept, decline, hangUp, toggleMic, toggleCam,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {me && <CallOverlay />}
    </Ctx.Provider>
  );
};
