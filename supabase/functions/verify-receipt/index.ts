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

    const { receiptNumber, studentName } = await req.json();

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

    // ----- STUDENT NAME SEARCH -----
    if (studentName && typeof studentName === "string") {
      const nameQuery = studentName.trim().toLowerCase();
      if (!nameQuery) {
        return new Response(JSON.stringify({ error: "Name required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Search profiles by name
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name, registration_number, form, stream")
        .or(`first_name.ilike.%${nameQuery}%,last_name.ilike.%${nameQuery}%`)
        .limit(20);

      if (!profiles || profiles.length === 0) {
        return new Response(JSON.stringify({ valid: false, mode: "name", receipts: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const profileIds = profiles.map((p) => p.id);

      // Fetch payments for these students
      const { data: payments } = await supabaseAdmin
        .from("payments")
        .select("receipt_number, amount, currency, method, status, created_at, student_profile_id, description")
        .in("student_profile_id", profileIds)
        .in("status", ["paid", "confirmed", "completed"])
        .order("created_at", { ascending: false })
        .limit(50);

      // Fetch inventory sales for these students
      const { data: sales } = await supabaseAdmin
        .from("inventory_sales")
        .select("receipt_number, total_amount, currency, method, status, created_at, student_profile_id")
        .in("student_profile_id", profileIds)
        .in("status", ["paid", "confirmed", "completed"])
        .order("created_at", { ascending: false })
        .limit(50);

      const profileMap = new Map(profiles.map((p) => [p.id, p]));

      const receipts: any[] = [];

      for (const p of payments || []) {
        const prof = profileMap.get(p.student_profile_id);
        const firstName = titleCase(prof?.first_name || "");
        const lastName = titleCase(prof?.last_name || "");
        receipts.push({
          valid: true,
          type: "payment",
          receiptNumber: p.receipt_number,
          amount: p.amount,
          currency: p.currency,
          status: p.status,
          date: new Date(p.created_at).toLocaleDateString("en-GB"),
          studentName: `${mask(firstName)} ${mask(lastName)}`.trim() || "Unknown",
          studentNameFull: `${firstName} ${lastName}`.trim() || "Unknown",
          regNumber: (prof?.registration_number || "").length <= 3
            ? prof?.registration_number || ""
            : `${(prof?.registration_number || "").substring(0, 3)}${"*".repeat((prof?.registration_number || "").length - 3)}`,
          studentClass: buildClass(prof?.form, prof?.stream),
          method: p.method,
          description: p.description,
        });
      }

      for (const s of sales || []) {
        const prof = profileMap.get(s.student_profile_id);
        const firstName = titleCase(prof?.first_name || "");
        const lastName = titleCase(prof?.last_name || "");
        receipts.push({
          valid: true,
          type: "inventory",
          receiptNumber: s.receipt_number,
          amount: s.total_amount,
          currency: s.currency,
          status: s.status,
          date: new Date(s.created_at).toLocaleDateString("en-GB"),
          studentName: `${mask(firstName)} ${mask(lastName)}`.trim() || "Customer",
          studentNameFull: `${firstName} ${lastName}`.trim() || "Customer",
          regNumber: (prof?.registration_number || "").length <= 3
            ? prof?.registration_number || ""
            : `${(prof?.registration_number || "").substring(0, 3)}${"*".repeat((prof?.registration_number || "").length - 3)}`,
          studentClass: buildClass(prof?.form, prof?.stream),
          method: s.method,
          description: "Inventory sale",
        });
      }

      // Sort by date desc
      receipts.sort((a, b) => {
        const da = new Date(a.date.split("/").reverse().join("-")).getTime();
        const db = new Date(b.date.split("/").reverse().join("-")).getTime();
        return db - da;
      });

      return new Response(JSON.stringify({
        valid: receipts.length > 0,
        mode: "name",
        receipts,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ----- RECEIPT NUMBER SEARCH -----
    if (!receiptNumber || typeof receiptNumber !== "string") {
      return new Response(JSON.stringify({ error: "Receipt number or student name required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanReceipt = receiptNumber.trim().toUpperCase();

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
        mode: "receipt",
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
        mode: "receipt",
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

    return new Response(JSON.stringify({ valid: false, mode: "receipt" }), {
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
