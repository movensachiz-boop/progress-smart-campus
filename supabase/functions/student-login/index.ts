import { createClient } from "https://esm.sh/@supabase/supabase-js@2.101.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Rate limiting
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const MAX_DEVICES = 2;

function checkLoginRate(key: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record || now - record.lastAttempt > LOCKOUT_MS) {
    loginAttempts.set(key, { count: 1, lastAttempt: now });
    return false;
  }
  record.count++;
  record.lastAttempt = now;
  return record.count > MAX_LOGIN_ATTEMPTS;
}

function resetLoginRate(key: string) {
  loginAttempts.delete(key);
}

// Simple device fingerprint from IP + User-Agent
function getDeviceFingerprint(req: Request): { ip: string; fingerprint: string; userAgent: string } {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
             req.headers.get("x-real-ip") ||
             "unknown";
  const userAgent = req.headers.get("user-agent") || "unknown";
  // Create a simple fingerprint from IP + a hash of user agent
  const fingerprint = `${ip}::${userAgent.substring(0, 100)}`;
  return { ip, fingerprint, userAgent };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json();

    // Public action: list staff names so the Admin login dropdown can be populated
    if (body?.action === "list_staff") {
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const { data: roleRows } = await adminClient
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "cashier", "timetable_manager"]);
      const userIds = Array.from(new Set((roleRows || []).map((r: any) => r.user_id)));
      const rolesByUser = new Map<string, string[]>();
      for (const r of (roleRows || [])) {
        const arr = rolesByUser.get(r.user_id) || [];
        arr.push(r.role);
        rolesByUser.set(r.user_id, arr);
      }
      const staff: { name: string; role: string }[] = [];
      // Page through admin.listUsers
      let page = 1;
      while (true) {
        const { data: list, error: lerr } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
        if (lerr) break;
        for (const u of list.users) {
          if (!userIds.includes(u.id)) continue;
          const meta: any = u.user_metadata || {};
          const name = meta.full_name || (u.email || "").split("@")[0];
          if (!name) continue;
          const userRoles = rolesByUser.get(u.id) || [];
          const sub = userRoles.find(r => r === "cashier" || r === "timetable_manager") || "admin";
          staff.push({ name, role: sub });
        }
        if (list.users.length < 200) break;
        page++;
        if (page > 20) break;
      }
      // Sort alphabetically and dedupe
      const seen = new Set<string>();
      const unique = staff.filter(s => {
        const k = s.name.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }).sort((a, b) => a.name.localeCompare(b.name));
      return new Response(JSON.stringify({ staff: unique }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { registrationNumber, password } = body;

    if (!registrationNumber || !password || typeof registrationNumber !== "string" || typeof password !== "string") {
      return new Response(JSON.stringify({ error: "Registration number and password required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanInput = registrationNumber.trim();

    // Rate limiting (keyed by lowercase identifier)
    if (checkLoginRate(cleanInput.toLowerCase())) {
      return new Response(JSON.stringify({ error: "Account temporarily locked due to too many failed attempts. Try again in 15 minutes." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If the input looks like an email (e.g. owner accounts), use it directly.
    // If it contains a space (e.g. "Mavunga Mitchell"), treat as a staff name → firstname.lastname@pcc.local
    // Otherwise treat it as a registration number and map to the virtual email.
    let email: string;
    if (cleanInput.includes("@")) {
      email = cleanInput.toLowerCase();
    } else if (/\s/.test(cleanInput)) {
      const slug = cleanInput.toLowerCase().trim().replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "");
      email = `${slug}@pcc.local`;
    } else {
      email = `${cleanInput.toUpperCase().toLowerCase()}@pcc.local`;
    }

    const supabase = createClient(supabaseUrl, anonKey);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return new Response(JSON.stringify({ error: "Invalid registration number or password" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Successful login - reset rate limit
    resetLoginRate(cleanInput.toLowerCase());

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // ── Device session fingerprinting ──
    const { ip, fingerprint, userAgent } = getDeviceFingerprint(req);

    // Get existing sessions for this user
    const { data: existingSessions } = await supabaseAdmin
      .from("device_sessions")
      .select("id, device_fingerprint, ip_address, last_active_at")
      .eq("user_id", data.user.id)
      .order("last_active_at", { ascending: false });

    const sessions = existingSessions || [];
    const currentSession = sessions.find((s) => s.device_fingerprint === fingerprint);

    if (currentSession) {
      // Known device — update last active
      await supabaseAdmin
        .from("device_sessions")
        .update({ last_active_at: new Date().toISOString(), ip_address: ip })
        .eq("id", currentSession.id);
    } else {
      // Device limit temporarily disabled — allow any device to connect
      await supabaseAdmin.from("device_sessions").insert({
        user_id: data.user.id,
        ip_address: ip,
        device_fingerprint: fingerprint,
        user_agent: userAgent.substring(0, 500),
      });
    }

    // Get all roles, prefer most specific
    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const roles = (roleRows || []).map((r: any) => r.role);
    const preferred =
      roles.find((r: string) => r === "cashier" || r === "timetable_manager") ||
      roles.find((r: string) => r === "owner" || r === "teacher") ||
      roles.find((r: string) => r === "admin") ||
      "student";

    return new Response(JSON.stringify({
      session: data.session,
      role: preferred,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
