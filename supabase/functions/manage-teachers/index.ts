import { createClient } from "https://esm.sh/@supabase/supabase-js@2.101.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify admin caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleData } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin");
    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, ...payload } = await req.json();

    if (action === "create_teacher_account") {
      const { name, title, password: providedPassword } = payload;
      if (!name || typeof name !== "string" || name.trim().length < 2) {
        return new Response(JSON.stringify({ error: "Teacher full name required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const slug = slugifyName(name);
      if (!slug || !slug.includes(".")) {
        return new Response(JSON.stringify({ error: "Please provide first and last name" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const email = `${slug}@pcc.local`;
      const password = providedPassword?.trim() || randomPassword();

      // Check if user already exists
      let existing: any = null;
      let page = 1;
      while (page <= 20) {
        const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) break;
        existing = list.users.find((u: any) => (u.email || "").toLowerCase() === email);
        if (existing) break;
        if (list.users.length < 200) break;
        page++;
      }

      let userId: string;
      if (existing) {
        userId = existing.id;
        // Update password
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          password,
          user_metadata: { full_name: name, title: title || "Mr." },
        });
      } else {
        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: { full_name: name, title: title || "Mr." },
        });
        if (createErr || !created?.user) {
          return new Response(JSON.stringify({ error: createErr?.message || "Failed to create account" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        userId = created.user.id;
      }

      // Assign teacher role (idempotent)
      const { data: existingRole } = await supabaseAdmin
        .from("user_roles").select("id").eq("user_id", userId).eq("role", "teacher").maybeSingle();
      if (!existingRole) {
        await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "teacher" });
      }

      return new Response(JSON.stringify({
        success: true,
        loginName: name,
        password,
        message: existing ? "Password updated" : "Teacher account created",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
