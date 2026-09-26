import { supabase } from "@/integrations/supabase/client";

export const VAPID_PUBLIC_KEY = "BCIAwq3VeqaCNTop-Tk0Hz9TM2ijhS8HkVhp0w02gHgWuN-bkKS7raBp2YT3IEhMu_ByxA1OkvhTp8rxsRfSEp8";

const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
const isPreview = /id-preview--|lovableproject\.com/.test(location.hostname);
export const pushSupported = () =>
  !inIframe && !isPreview && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const b64ToU8 = (s: string) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export async function registerSW() {
  if (!pushSupported()) return null;
  try { return await navigator.serviceWorker.register("/sw.js"); } catch { return null; }
}

/** Subscribe this device for call alerts. Call from a tap on iPhone. */
export async function enableCallAlerts(userId: string, ask = false): Promise<boolean> {
  if (!pushSupported()) return false;
  if (Notification.permission === "denied") return false;
  if (Notification.permission !== "granted") {
    if (!ask) return false;
    if ((await Notification.requestPermission()) !== "granted") return false;
  }
  const reg = (await registerSW()) && (await navigator.serviceWorker.ready);
  if (!reg) return false;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(VAPID_PUBLIC_KEY) });
  const j = sub.toJSON() as any;
  await supabase.from("push_subscriptions" as any).upsert(
    { user_id: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth },
    { onConflict: "endpoint" },
  );
  return true;
}

export function sendCallPush(to: string[], type: "call" | "cancel", roomId: string, fromName: string, video: boolean) {
  if (!to.length) return;
  supabase.functions.invoke("call-push", { body: { to, type, roomId, fromName, video } }).catch(() => {});
}
