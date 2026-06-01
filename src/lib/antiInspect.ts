// Best-effort deterrents against casual inspection.
// Note: A determined user with browser tooling can always bypass these in a web app.
// These measures block right-click, common devtools shortcuts, silence the console,
// and blank the page when devtools appear to be open.

export function installAntiInspect() {
  if (typeof window === "undefined") return;
  if (import.meta.env.DEV) return; // keep DX in development

  // 1) Block context menu
  window.addEventListener("contextmenu", (e) => e.preventDefault());

  // 2) Block common devtools / view-source shortcuts
  window.addEventListener("keydown", (e) => {
    const k = e.key?.toLowerCase();
    if (
      e.key === "F12" ||
      (e.ctrlKey && e.shiftKey && (k === "i" || k === "j" || k === "c")) ||
      (e.metaKey && e.altKey && (k === "i" || k === "j" || k === "c")) ||
      (e.ctrlKey && k === "u") ||
      (e.metaKey && k === "u") ||
      (e.ctrlKey && k === "s") ||
      (e.metaKey && k === "s")
    ) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  // 3) Silence console output in production
  try {
    const noop = () => {};
    const methods: (keyof Console)[] = [
      "log", "info", "warn", "error", "debug", "trace",
      "table", "dir", "group", "groupCollapsed", "groupEnd",
      "time", "timeEnd", "count", "assert",
    ];
    methods.forEach((m) => {
      try { (console as any)[m] = noop; } catch {}
    });
  } catch {}

  // 4) DevTools open detection (size + debugger timing heuristics)
  const blank = () => {
    try {
      document.documentElement.innerHTML =
        '<div style="font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#0b1220;color:#e5e7eb;text-align:center;padding:24px">Developer tools are not allowed on this site.</div>';
    } catch {}
  };

  const threshold = 160;
  const checkSize = () => {
    const widthDiff = window.outerWidth - window.innerWidth;
    const heightDiff = window.outerHeight - window.innerHeight;
    if (widthDiff > threshold || heightDiff > threshold) blank();
  };
  setInterval(checkSize, 1000);

  const checkDebugger = () => {
    const start = performance.now();
    // eslint-disable-next-line no-debugger
    (function () { debugger; })();
    if (performance.now() - start > 100) blank();
  };
  setInterval(checkDebugger, 2000);
}
