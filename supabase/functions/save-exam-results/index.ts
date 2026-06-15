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

    const { exam_id, rows } = await req.json();
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
