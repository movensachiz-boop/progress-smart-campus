import { createClient } from "https://esm.sh/@supabase/supabase-js@2.101.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify the caller is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, ...payload } = await req.json();

    if (action === "create_student") {
      const { firstName, lastName, form, stream, gender, guardianName, guardianPhone, registrationNumber, isBeginner } = payload;

      if (!firstName || !lastName) {
        return new Response(JSON.stringify({ error: "First name and last name are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Auto-generate reg number if not provided
      let regNum = registrationNumber?.trim().toUpperCase();
      if (!regNum) {
        const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        const randomLetter = () => letters[Math.floor(Math.random() * letters.length)];
        const randomDigits = () => String(Math.floor(1000 + Math.random() * 9000));

        // Try up to 10 times to find a unique reg number
        for (let attempt = 0; attempt < 10; attempt++) {
          regNum = `${randomLetter()}${randomDigits()}${randomLetter()}`;
          const { data: dup } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("registration_number", regNum)
            .maybeSingle();
          if (!dup) break;
          if (attempt === 9) {
            return new Response(JSON.stringify({ error: "Could not generate unique registration number. Try again." }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      } else {
        // Check if provided registration number already exists
        const { data: existing } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("registration_number", regNum)
          .maybeSingle();

        if (existing) {
          return new Response(JSON.stringify({ error: "Registration number already exists" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const { data: profile, error: profileError } = await supabaseAdmin.from("profiles").insert({
        registration_number: regNum,
        first_name: firstName,
        last_name: lastName,
        form: form || null,
        stream: stream || null,
        gender: gender || "male",
        guardian_name: guardianName || null,
        guardian_phone: guardianPhone || null,
        claimed: false,
        is_beginner: isBeginner !== undefined ? isBeginner : true,
      }).select().single();

      if (profileError) {
        return new Response(JSON.stringify({ error: profileError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        student: {
          id: profile.id,
          registrationNumber: regNum,
          name: `${firstName} ${lastName}`,
          form,
          stream,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reset_password") {
      const { registrationNumber, newPassword } = payload;

      if (!registrationNumber || !newPassword) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find user by registration number
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("user_id")
        .eq("registration_number", registrationNumber)
        .maybeSingle();

      if (!profile || !profile.user_id) {
        return new Response(JSON.stringify({ error: "Student not found or account not yet set up" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        profile.user_id,
        { password: newPassword }
      );

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list_students") {
      // Paginated fetch — get ALL students in batches of 1000
      let allStudents: any[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: batch, error } = await supabaseAdmin
          .from("profiles")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, from + batchSize - 1);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        allStudents = allStudents.concat(batch || []);
        hasMore = (batch?.length || 0) === batchSize;
        from += batchSize;
      }

      // Get fee summaries
      const { data: feeSummaries } = await supabaseAdmin.rpc("get_student_fee_summary");
      const feeMap = new Map();
      if (feeSummaries) {
        for (const fs of feeSummaries) {
          feeMap.set(fs.profile_id, fs);
        }
      }

      const enriched = allStudents.map((s: any) => {
        const fee = feeMap.get(s.id);
        return {
          ...s,
          total_fees: fee?.total_fees || 0,
          total_paid: fee?.total_paid || 0,
          computed_balance: fee?.balance || 0,
          payment_status: fee?.payment_status || "No Fees",
        };
      });

      return new Response(JSON.stringify({ students: enriched }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create_owner") {
      const { fullName, email, password } = payload;
      if (!fullName || !email || !password) {
        return new Response(JSON.stringify({ error: "Full name, email, and password are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (typeof password !== "string" || password.length < 8) {
        return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create the auth user (auto-confirmed so they can log in immediately)
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, role: "owner" },
      });
      if (createErr || !created.user) {
        return new Response(JSON.stringify({ error: createErr?.message || "Failed to create user" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Assign the owner role
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: created.user.id, role: "owner" });
      if (roleErr) {
        return new Response(JSON.stringify({ error: roleErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          owner: { id: created.user.id, email, fullName },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "create_staff") {
      const { fullName, password, role } = payload;
      const allowedRoles = ["admin", "cashier", "timetable_manager", "teacher", "owner"];
      if (!fullName || !password || !role) {
        return new Response(JSON.stringify({ error: "Full name, password, and role are required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!allowedRoles.includes(role)) {
        return new Response(JSON.stringify({ error: "Invalid role" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (typeof password !== "string" || password.length < 4) {
        return new Response(JSON.stringify({ error: "Password must be at least 4 characters" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const slug = String(fullName).toLowerCase().trim().replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "");
      if (!slug) {
        return new Response(JSON.stringify({ error: "Invalid full name" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const email = `${slug}@pcc.local`;

      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name: fullName, role },
      });
      if (createErr || !created.user) {
        return new Response(JSON.stringify({ error: createErr?.message || "Failed to create user" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Grant admin role for admin-portal staff so they pass admin RLS, plus their sub-role.
      const rolesToInsert: { user_id: string; role: string }[] = [];
      if (role === "cashier" || role === "timetable_manager" || role === "admin") {
        rolesToInsert.push({ user_id: created.user.id, role: "admin" });
      }
      if (role !== "admin") {
        rolesToInsert.push({ user_id: created.user.id, role });
      }
      const { error: roleErr } = await supabaseAdmin.from("user_roles").insert(rolesToInsert);
      if (roleErr) {
        return new Response(JSON.stringify({ error: roleErr.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true, staff: { id: created.user.id, fullName, loginName: fullName, role } }), {
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
