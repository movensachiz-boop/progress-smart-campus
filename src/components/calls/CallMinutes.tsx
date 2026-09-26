import { useEffect, useRef, useState } from "react";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Mic, Square, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MinuteEntry { at: number; elapsed: number; text: string }

export const fmtElapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
};
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const CallMinutes = ({ startedAt, participants, onClose }: { startedAt: number; participants: string[]; onClose: () => void }) => {
  const [entries, setEntries] = useState<MinuteEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem(`call_minutes_${startedAt}`) || "[]"); } catch { return []; }
  });
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const SR: any = typeof window !== "undefined" ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

  useEffect(() => {
    localStorage.setItem(`call_minutes_${startedAt}`, JSON.stringify(entries));
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, startedAt]);
  useEffect(() => () => recRef.current?.stop(), []);

  const add = (t: string) => {
    const v = t.trim(); if (!v) return;
    const now = Date.now();
    setEntries((e) => [...e, { at: now, elapsed: now - startedAt, text: v }]);
  };

  const toggleDictate = () => {
    if (listening) { recRef.current?.stop(); return; }
    const r = new SR(); r.continuous = true; r.interimResults = false; r.lang = "en-GB";
    r.onresult = (ev: any) => { for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) add(ev.results[i][0].transcript); };
    r.onend = () => setListening(false);
    r.start(); recRef.current = r; setListening(true);
  };

  const download = () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    doc.setFillColor(0, 51, 102); doc.rect(0, 0, W, 22, "F");
    doc.setTextColor(255, 215, 0); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text("PROGRESS CHRISTIAN COLLEGE", W / 2, 9, { align: "center" });
    doc.setTextColor(255, 255, 255); doc.setFontSize(10);
    doc.text("MINUTES OF THE MEETING (CALL)", W / 2, 16, { align: "center" });
    doc.setTextColor(0, 0, 0); doc.setFontSize(9.5);
    let y = 30;
    const end = Date.now();
    doc.text(`Date: ${new Date(startedAt).toLocaleDateString()}`, 14, y);
    doc.text(`Started: ${clock(startedAt)}   Ended: ${clock(end)}   Duration: ${fmtElapsed(end - startedAt)}`, 70, y); y += 6;
    const pl = doc.splitTextToSize(`Participants: ${participants.join(", ")}`, W - 28); doc.text(pl, 14, y); y += pl.length * 5 + 4;
    doc.setFont("helvetica", "bold"); doc.text("Time", 14, y); doc.text("Elapsed", 36, y); doc.text("Minute", 56, y);
    doc.setDrawColor(0, 51, 102); doc.line(14, y + 1.5, W - 14, y + 1.5); y += 7; doc.setFont("helvetica", "normal");
    entries.forEach((e) => {
      const lines = doc.splitTextToSize(e.text, W - 70);
      if (y + lines.length * 5 > H - 15) { doc.addPage(); y = 20; }
      doc.text(clock(e.at), 14, y); doc.text(fmtElapsed(e.elapsed), 36, y); doc.text(lines, 56, y);
      y += lines.length * 5 + 2;
    });
    doc.save(`Call_Minutes_${new Date(startedAt).toISOString().slice(0, 16).replace(/[:T]/g, "-")}.pdf`);
  };

  return (
    <div className="flex flex-col h-full bg-card border-l">
      <div className="px-3 py-2 border-b flex items-center gap-2">
        <span className="font-semibold text-sm flex-1">Meeting minutes</span>
        <Button size="icon" variant="ghost" onClick={download} disabled={!entries.length} aria-label="Download minutes"><Download size={16} /></Button>
        <Button size="icon" variant="ghost" onClick={() => confirm("Clear all minutes?") && setEntries([])} aria-label="Clear"><Trash2 size={16} /></Button>
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close minutes"><X size={16} /></Button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {!entries.length && <p className="text-xs text-muted-foreground text-center py-6">Type a point and press Enter. Each line is stamped with the exact time.</p>}
        {entries.map((e, i) => (
          <div key={i} className="text-sm">
            <span className="font-mono text-xs text-primary mr-2">{clock(e.at)} · {fmtElapsed(e.elapsed)}</span>
            <span>{e.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="p-2 border-t flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a minute, press Enter…"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(text); setText(""); } }} />
        {SR && (
          <Button size="icon" variant={listening ? "destructive" : "outline"} onClick={toggleDictate} aria-label="Dictate" className={cn(listening && "animate-pulse")}>
            {listening ? <Square size={14} /> : <Mic size={14} />}
          </Button>
        )}
      </div>
    </div>
  );
};
