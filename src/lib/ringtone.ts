// Simple generated ringtone / ringback using Web Audio (no audio files needed).
let ctx: AudioContext | null = null;
let timer: number | null = null;

const beep = (freqs: number[], dur: number) => {
  if (!ctx) return;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.03);
  g.gain.setValueAtTime(0.25, ctx.currentTime + dur - 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  g.connect(ctx.destination);
  freqs.forEach((f) => {
    const o = ctx!.createOscillator();
    o.frequency.value = f;
    o.connect(g);
    o.start();
    o.stop(ctx!.currentTime + dur);
  });
};

export function startRing(kind: "incoming" | "outgoing") {
  stopRing();
  try {
    ctx = ctx || new (window.AudioContext || (window as any).webkitAudioContext)();
    ctx.resume().catch(() => {});
  } catch { return; }
  const play = () => {
    if (kind === "incoming") { beep([440, 480], 0.4); window.setTimeout(() => beep([440, 480], 0.4), 600); }
    else beep([425], 1);
  };
  play();
  timer = window.setInterval(play, kind === "incoming" ? 2500 : 4000);
}

export function stopRing() {
  if (timer) window.clearInterval(timer);
  timer = null;
}

// Unlock audio on first tap so incoming rings can play later.
if (typeof window !== "undefined") {
  const unlock = () => {
    try { ctx = ctx || new (window.AudioContext || (window as any).webkitAudioContext)(); ctx.resume(); } catch { /* ignore */ }
    window.removeEventListener("pointerdown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
}
