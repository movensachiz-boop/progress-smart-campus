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

    // Check caller role (admin, cashier, or it_assistant can reach this function)
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .in("role", ["admin", "cashier", "it_assistant"]);

    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerRoles = new Set((roleData || []).map((r: any) => r.role));
    const isAdminCaller = callerRoles.has("admin") || callerRoles.has("cashier");
    const isItAssistant = callerRoles.has("it_assistant");

    const { action, ...payload } = await req.json();

    // IT Assistant is limited to resetting teacher passwords only.
    if (!isAdminCaller && isItAssistant && action !== "reset_teacher_password") {
      return new Response(JSON.stringify({ error: "IT Assistant can only reset teacher passwords" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reset_teacher_password") {
      const { teacherUserId, newPassword } = payload;
      if (!teacherUserId || !newPassword || String(newPassword).length < 4) {
        return new Response(JSON.stringify({ error: "Teacher and a password of 4+ characters are required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Verify target is actually a teacher
      const { data: targetRoles } = await supabaseAdmin
        .from("user_roles").select("role").eq("user_id", teacherUserId);
      const targetSet = new Set((targetRoles || []).map((r: any) => r.role));
      if (!targetSet.has("teacher")) {
        return new Response(JSON.stringify({ error: "Target account is not a teacher" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // IT assistant must NOT be allowed to reset admins/owners even if they somehow also have teacher role
      if (!isAdminCaller && (targetSet.has("admin") || targetSet.has("owner") || targetSet.has("principal"))) {
        return new Response(JSON.stringify({ error: "Not permitted for this account" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: upErr } = await supabaseAdmin.auth.admin.updateUserById(teacherUserId, {
        password: String(newPassword),
      });
      if (upErr) {
        return new Response(JSON.stringify({ error: upErr.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    if (action === "create_student") {
      const { firstName, lastName, form, stream, gender, guardianName, guardianPhone, registrationNumber, isBeginner, residency } = payload;

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
        residency: residency === "boarder" ? "boarder" : "day",
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

      const regNo = String(registrationNumber).trim().toUpperCase();

      // Case-insensitive lookup
      const { data: profile, error: profErr } = await supabaseAdmin
        .from("profiles")
        .select("id, user_id, registration_number")
        .ilike("registration_number", regNo)
        .maybeSingle();

      if (profErr || !profile) {
        return new Response(JSON.stringify({ error: "Student not found with that registration number" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let userId = profile.user_id as string | null;

      // Auto-provision auth account if not yet claimed (virtual email mapping)
      if (!userId) {
        const virtualEmail = `${regNo.toLowerCase()}@pcc.local`;
        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: virtualEmail,
          password: newPassword,
          email_confirm: true,
          user_metadata: { registration_number: regNo, role: "student" },
        });
        if (createErr || !created?.user) {
          return new Response(JSON.stringify({ error: createErr?.message || "Failed to create account" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        userId = created.user.id;
        const { error: linkErr } = await supabaseAdmin
          .from("profiles")
          .update({ user_id: userId })
          .eq("id", profile.id);
        if (linkErr) {
          return new Response(JSON.stringify({ error: linkErr.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ success: true, provisioned: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
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

    if (action === "delete_student") {
      const { profileId, registrationNumber } = payload;
      if (!profileId && !registrationNumber) {
        return new Response(JSON.stringify({ error: "profileId or registrationNumber required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      let query = supabaseAdmin.from("profiles").select("id, user_id, first_name, last_name, registration_number");
      if (profileId) query = query.eq("id", profileId);
      else query = query.ilike("registration_number", String(registrationNumber).trim().toUpperCase());
      const { data: profile, error: findErr } = await query.maybeSingle();
      if (findErr || !profile) {
        return new Response(JSON.stringify({ error: "Student not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: delErr } = await supabaseAdmin.from("profiles").delete().eq("id", profile.id);
      if (delErr) {
        return new Response(JSON.stringify({ error: delErr.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (profile.user_id) {
        try {
          await supabaseAdmin.from("user_roles").delete().eq("user_id", profile.user_id);
          await supabaseAdmin.auth.admin.deleteUser(profile.user_id);
        } catch (_) { /* non-fatal */ }
      }
      return new Response(JSON.stringify({ success: true, deleted: `${profile.first_name} ${profile.last_name}` }), {
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
      const allowedRoles = ["admin", "cashier", "timetable_manager", "teacher", "owner", "kitchen", "principal"];
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
      // Principal is intentionally NOT granted admin — they only see the mark schedules page.
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
