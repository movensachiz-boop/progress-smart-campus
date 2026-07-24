import { createClient } from "https://esm.sh/@supabase/supabase-js@2.101.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function slugifyName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "");
}

function randomPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*";
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  let pwd = pick(upper) + pick(lower) + pick(digits) + pick(symbols);
  const all = upper + lower + digits + symbols;
  for (let i = 0; i < 8; i++) pwd += pick(all);
  return pwd;
}

async function findUserByEmail(adminClient: any, email: string) {
  let page = 1;
  while (page <= 20) {
    const { data: list, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const found = list.users.find((u: any) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (list.users.length < 200) break;
    page++;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify admin caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return jsonResponse({ error: "Unauthorized" }, 401);
    const { data: roleData } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin");
    if (!roleData || roleData.length === 0) {
      return jsonResponse({ error: "Forbidden: admin only" }, 403);
    }

    const { action, ...payload } = await req.json();

    if (action === "create_teacher_account") {
      const { name, title, password: providedPassword } = payload;
      if (!name || typeof name !== "string" || name.trim().length < 2) {
        return jsonResponse({ error: "Teacher full name required" }, 400);
      }
      const slug = slugifyName(name);
      if (!slug) {
        return jsonResponse({ error: "Teacher name is required" }, 400);
      }
      const email = `${slug}@pcc.local`;
      const password = providedPassword?.trim() || randomPassword();
      if (password.length < 6) {
        return jsonResponse({ error: "Password must be at least 6 characters" }, 400);
      }

      // Check if user already exists
      const existing = await findUserByEmail(supabaseAdmin, email);

      let userId: string;
      if (existing) {
        userId = existing.id;
        // Update password
        const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          password,
          user_metadata: { full_name: name, title: title || "Mr." },
        });
        if (updateErr) return jsonResponse({ error: updateErr.message }, 400);
      } else {
        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: { full_name: name, title: title || "Mr." },
        });
        if (createErr || !created?.user) {
          return jsonResponse({ error: createErr?.message || "Failed to create account" }, 400);
        }
        userId = created.user.id;
      }

      // Assign teacher role (idempotent)
      const { data: existingRole } = await supabaseAdmin
        .from("user_roles").select("id").eq("user_id", userId).eq("role", "teacher").maybeSingle();
      if (!existingRole) {
        const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "teacher" });
        if (roleErr) return jsonResponse({ error: roleErr.message }, 400);
      }

      return jsonResponse({
        success: true,
        loginName: name,
        loginEmail: email,
        password,
        message: existing ? "Password updated" : "Teacher account created",
      });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
