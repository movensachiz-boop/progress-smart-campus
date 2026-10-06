import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const domain = Deno.env.get("METERED_DOMAIN");
    const key = Deno.env.get("METERED_API_KEY");
    if (!domain || !key) return json({ iceServers: [] });
    const host = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const r = await fetch(`https://${host}/api/v1/turn/credentials?apiKey=${encodeURIComponent(key)}`);
    if (!r.ok) { const t = await r.text(); console.error("metered", r.status, t); return json({ iceServers: [], error: t }, 200); }
    return json({ iceServers: await r.json() });
  } catch (e) {
    console.error(e);
    return json({ iceServers: [], error: String(e) });
  }
});
