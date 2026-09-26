import { createClient } from "https://esm.sh/@supabase/supabase-js@2.101.1";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { to, type, roomId, fromName, video } = await req.json();
    if (!Array.isArray(to) || !to.length || to.length > 20 || typeof roomId !== "string") return json({ error: "Bad request" }, 400);

    webpush.setVapidDetails("mailto:admin@progresschristiansys.com", Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: subs } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").in("user_id", to);

    const payload = JSON.stringify({
      type: type === "cancel" ? "cancel" : "call",
      roomId, from: user.id, fromName: String(fromName || "Someone").slice(0, 60), video: !!video,
    });
    let sent = 0;
    await Promise.all((subs || []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 45, urgency: "high" });
        sent++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
        else console.error("push failed", e?.statusCode, e?.body);
      }
    }));
    return json({ sent });
  } catch (e: any) {
    console.error(e);
    return json({ error: e.message }, 500);
  }
});
