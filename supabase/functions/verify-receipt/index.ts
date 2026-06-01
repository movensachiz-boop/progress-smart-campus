import { createClient } from "https://esm.sh/@supabase/supabase-js@2.101.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { receiptNumber } = await req.json();

    if (!receiptNumber || typeof receiptNumber !== "string") {
      return new Response(JSON.stringify({ error: "Receipt number required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanReceipt = receiptNumber.trim().toUpperCase();

    const titleCase = (s: string) =>
      s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    const mask = (n: string) =>
      n.length <= 2 ? n : `${n.substring(0, 2)}${"*".repeat(n.length - 2)}`;

    const fetchProfile = async (id: string | null) => {
      if (!id) return null;
      const { data } = await supabaseAdmin
        .from("profiles")
        .select("first_name, last_name, registration_number, form, stream")
        .eq("id", id)
        .maybeSingle();
      return data;
    };

    const buildClass = (form?: string | null, stream?: string | null) => {
      const formClean = form
        ? /^form\s/i.test(form)
          ? form.replace(/^form\s*/i, "Form ")
          : `Form ${form}`
        : "";
      return [formClean, stream].filter(Boolean).join(" ") || "—";
    };

    // Try fees payment first
    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("receipt_number, amount, currency, method, status, created_at, student_profile_id, verification_hash, description")
      .eq("receipt_number", cleanReceipt)
      .in("status", ["paid", "confirmed", "completed"])
      .maybeSingle();

    if (payment) {
      let isValid = true;
      if (payment.verification_hash) {
        const { data: hashCheck } = await supabaseAdmin.rpc("verify_payment_hash", {
          p_receipt_number: payment.receipt_number,
          p_amount: String(payment.amount),
          p_student_profile_id: payment.student_profile_id,
          p_created_at: payment.created_at,
          p_stored_hash: payment.verification_hash,
        });
        isValid = hashCheck === true || hashCheck === "true";
      }
      const profile = await fetchProfile(payment.student_profile_id);
      const firstName = titleCase(profile?.first_name || "");
      const lastName = titleCase(profile?.last_name || "");
      const fullName = `${firstName} ${lastName}`.trim() || "Unknown";
      const reg = profile?.registration_number || "";
      return new Response(JSON.stringify({
        valid: isValid,
        type: "payment",
        receiptNumber: payment.receipt_number,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        date: new Date(payment.created_at).toLocaleDateString("en-GB"),
        studentName: `${mask(firstName)} ${mask(lastName)}`.trim() || "Unknown",
        studentNameFull: fullName,
        regNumber: reg.length <= 3 ? reg : `${reg.substring(0, 3)}${"*".repeat(reg.length - 3)}`,
        studentClass: buildClass(profile?.form, profile?.stream),
        method: payment.method,
        description: payment.description,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Try inventory sale
    const { data: sale } = await supabaseAdmin
      .from("inventory_sales")
      .select("receipt_number, total_amount, currency, method, status, created_at, student_profile_id, items")
      .eq("receipt_number", cleanReceipt)
      .in("status", ["paid", "confirmed", "completed"])
      .maybeSingle();

    if (sale) {
      const profile = await fetchProfile(sale.student_profile_id);
      const firstName = titleCase(profile?.first_name || "");
      const lastName = titleCase(profile?.last_name || "");
      const fullName = `${firstName} ${lastName}`.trim() || "Customer";
      const reg = profile?.registration_number || "";
      const itemsArr = Array.isArray(sale.items) ? sale.items : [];
      const itemSummary = itemsArr.map((i: any) => `${i.name} x${i.quantity}`).join(", ");
      return new Response(JSON.stringify({
        valid: true,
        type: "inventory",
        receiptNumber: sale.receipt_number,
        amount: sale.total_amount,
        currency: sale.currency,
        status: sale.status,
        date: new Date(sale.created_at).toLocaleDateString("en-GB"),
        studentName: `${mask(firstName)} ${mask(lastName)}`.trim() || "Customer",
        studentNameFull: fullName,
        regNumber: reg.length <= 3 ? reg : `${reg.substring(0, 3)}${"*".repeat(reg.length - 3)}`,
        studentClass: buildClass(profile?.form, profile?.stream),
        method: sale.method,
        description: itemSummary || "Inventory sale",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ valid: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Verify error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
