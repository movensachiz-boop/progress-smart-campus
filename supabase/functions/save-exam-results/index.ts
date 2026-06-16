import { createClient } from "https://esm.sh/@supabase/supabase-js@2.101.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Public endpoint: saves exam results captured via QR-based mark sheet scan.
// No auth — designed for staff scanning a printed QR on the mark sheet from a phone.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const action = body.action || "save";

    if (action === "load") {
      const { exam_id } = body;
      if (!exam_id) {
        return new Response(JSON.stringify({ error: "exam_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: exam } = await admin
        .from("exams")
        .select("id, name, exam_type, term, year, form_levels, published")
        .eq("id", exam_id).maybeSingle();
      if (!exam) {
        return new Response(JSON.stringify({ error: "Exam not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const formStrs = (exam.form_levels || []).map((n: number) => String(n));
      const { data: students } = await admin
        .from("profiles")
        .select("id, first_name, last_name, form, stream")
        .in("form", formStrs).order("last_name", { ascending: true });
      const { data: results } = await admin
        .from("exam_results")
        .select("student_profile_id, subject_code, mark")
        .eq("exam_id", exam_id);
      return new Response(JSON.stringify({ exam, students: students || [], results: results || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { exam_id, rows } = body;
    if (!exam_id || !Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: "exam_id and rows[] required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Validate exam exists
    const { data: exam, error: exErr } = await admin
      .from("exams").select("id").eq("id", exam_id).maybeSingle();
    if (exErr || !exam) {
      return new Response(JSON.stringify({ error: "Exam not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = rows
      .filter((r: any) => r && r.student_profile_id && r.subject_code && r.mark != null)
      .map((r: any) => ({
        exam_id,
        student_profile_id: r.student_profile_id,
        subject_code: String(r.subject_code).toUpperCase(),
        subject_name: r.subject_name || null,
        mark: Number(r.mark),
        grade: r.grade || null,
        points: r.points != null ? Number(r.points) : null,
      }));

    if (!payload.length) {
      return new Response(JSON.stringify({ error: "No valid rows" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error } = await admin
      .from("exam_results")
      .upsert(payload, { onConflict: "exam_id,student_profile_id,subject_code" });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ saved: payload.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
