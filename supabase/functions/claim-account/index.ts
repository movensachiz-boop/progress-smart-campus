import { createClient } from "https://esm.sh/@supabase/supabase-js@2.101.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Rate limiting: simple in-memory store
const attempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || now - record.lastAttempt > WINDOW_MS) {
    attempts.set(key, { count: 1, lastAttempt: now });
    return false;
  }
  record.count++;
  record.lastAttempt = now;
  if (record.count > MAX_ATTEMPTS) return true;
  return false;
}

function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password)) return "Password must contain an uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must contain a lowercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain a number";
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) return "Password must contain a special character";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { action, registrationNumber, password } = await req.json();

    // Validate registration number format
    if (!registrationNumber || typeof registrationNumber !== "string" || registrationNumber.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Registration number is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanRegNumber = registrationNumber.trim().toUpperCase();

    // Rate limiting by registration number
    if (isRateLimited(cleanRegNumber)) {
      return new Response(JSON.stringify({ error: "Too many attempts. Please try again in 15 minutes." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "check") {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name, claimed")
        .eq("registration_number", cleanRegNumber)
        .maybeSingle();

      if (!profile) {
        return new Response(JSON.stringify({ error: "Registration number not found. Contact your admin." }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (profile.claimed) {
        return new Response(JSON.stringify({ error: "This account has already been set up. Use the login page." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        valid: true,
        name: `${profile.first_name} ${profile.last_name}`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "claim") {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name, claimed")
        .eq("registration_number", cleanRegNumber)
        .maybeSingle();

      if (!profile) {
        return new Response(JSON.stringify({ error: "Registration number not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (profile.claimed) {
        return new Response(JSON.stringify({ error: "This account has already been set up" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Auto-generate a secure password
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
      const specials = "!@#$%&*";
      let generatedPassword = "";
      const array = new Uint8Array(8);
      crypto.getRandomValues(array);
      for (let i = 0; i < 8; i++) {
        generatedPassword += chars[array[i] % chars.length];
      }
      // Ensure at least one uppercase, lowercase, digit, special
      const specArray = new Uint8Array(1);
      crypto.getRandomValues(specArray);
      generatedPassword += specials[specArray[0] % specials.length];
      generatedPassword += "A1a";
      // Shuffle
      generatedPassword = generatedPassword.split("").sort(() => Math.random() - 0.5).join("");

      const email = `${cleanRegNumber.toLowerCase()}@pcc.local`;
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: generatedPassword,
        email_confirm: true,
        user_metadata: {
          registration_number: cleanRegNumber,
          first_name: profile.first_name,
          last_name: profile.last_name,
        },
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({ user_id: newUser.user.id, claimed: true })
        .eq("id", profile.id);

      if (updateError) {
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin.from("user_roles").insert({
        user_id: newUser.user.id,
        role: "student",
      });

      const supabase = createClient(supabaseUrl, anonKey);
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: generatedPassword,
      });

      if (signInError) {
        return new Response(JSON.stringify({
          success: true,
          generatedPassword,
          message: "Account created. Please log in with the password shown.",
          name: `${profile.first_name} ${profile.last_name}`,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        session: signInData.session,
        generatedPassword,
        name: `${profile.first_name} ${profile.last_name}`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
