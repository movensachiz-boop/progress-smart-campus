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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
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

    const body = await req.json();
    const { type, guardianPhone, studentName, registrationNumber, amount, receiptNumber, method, customMessage } = body;

    if (body.channel === "whatsapp") {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      const WHATSAPP_API_KEY = Deno.env.get("WHATSAPP_API_KEY");
      if (!LOVABLE_API_KEY || !WHATSAPP_API_KEY) throw new Error("WhatsApp is not configured");
      if (!guardianPhone || !studentName) {
        return new Response(JSON.stringify({ error: "Missing guardianPhone or studentName" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      let digits = String(guardianPhone).replace(/\D/g, "");
      if (digits.startsWith("0")) digits = "263" + digits.slice(1);
      const d = body.details || {};
      const line = (k: string, v: unknown) => (v !== undefined && v !== null && String(v).trim() !== "" ? `${k}: ${v}\n` : "");
      const text =
        `*Progress Christian College*\nStudent Portal Details\n\n` +
        line("Name", studentName) +
        line("Registration No", registrationNumber) +
        line("Form", d.form) + line("Stream", d.stream) +
        line("Gender", d.gender) + line("Residency", d.residency) +
        line("Status", d.status) +
        line("Guardian", d.guardianName) +
        line("Fees owed", d.totalFees !== undefined ? `$${d.totalFees}` : "") +
        line("Fees paid", d.totalPaid !== undefined ? `$${d.totalPaid}` : "") +
        line("Balance", d.balance !== undefined ? `$${d.balance}` : "") +
        `\n*Login*\n` +
        line("Username", registrationNumber) +
        line("Password", body.password) +
        `Portal: https://progresschristiansys.com/login\n\nPlease keep this password private.\n- PCC School`;
      const send = async (payload: Record<string, unknown>) => {
        const r = await fetch("https://connector-gateway.lovable.dev/whatsapp/messages", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "X-Connection-Api-Key": WHATSAPP_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", to: digits, ...payload }),
        });
        const t = await r.text();
        if (!r.ok) console.error(`WhatsApp send failed [${r.status}]: ${t}`);
        let msg = t; try { msg = JSON.parse(t)?.error?.message || t; } catch { /* keep */ }
        return { ok: r.ok, msg };
      };
      const cls = [d.form ? `Form ${d.form}` : "", d.stream || ""].join(" ").trim() || "N/A";
      const bal = d.balance !== undefined && d.balance !== null ? `$${Number(d.balance).toFixed(2)}` : "N/A";
      // Approved templates reach guardians even if they never messaged the school.
      const t1 = await send({ type: "template", template: { name: "student_details_update", language: { code: "en" },
        components: [{ type: "body", parameters: [studentName, registrationNumber || "N/A", cls, bal].map((x) => ({ type: "text", text: String(x) })) }] } });
      let t2 = { ok: true, msg: "" };
      if (body.password) {
        t2 = await send({ type: "template", template: { name: "portal_password_code", language: { code: "en" },
          components: [
            { type: "body", parameters: [{ type: "text", text: String(body.password) }] },
            { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: String(body.password) }] },
          ] } });
      }
      if (!t1.ok || !t2.ok) {
        // Fallback: free-form text (only delivered if guardian messaged the school in the last 24h)
        const f = await send({ type: "text", text: { body: text } });
        if (!f.ok) return new Response(JSON.stringify({ error: `WhatsApp: ${f.msg}` }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ success: true, channel: "whatsapp", fallback: true, templateError: t1.ok ? t2.msg : t1.msg }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ success: true, channel: "whatsapp" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!guardianPhone || !studentName) {
      return new Response(JSON.stringify({ error: "Missing required fields: guardianPhone, studentName" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Format phone: ensure it starts with +263 for Zimbabwe
    let formattedPhone = guardianPhone.replace(/\s+/g, "");
    if (formattedPhone.startsWith("0")) {
      formattedPhone = "+263" + formattedPhone.slice(1);
    } else if (!formattedPhone.startsWith("+")) {
      formattedPhone = "+" + formattedPhone;
    }

    let message = "";
    let smsType = "general";

    if (type === "custom" && customMessage) {
      smsType = "general";
      message = `Dear ${studentName},\n\n${customMessage}\n\n- PCC School`;
    } else if (type === "registration") {
      smsType = "registration";
      message = `Dear Guardian,\n\nYour child ${studentName} has been registered at Progress Christian Centre.\n\nRegistration Number: ${registrationNumber}\n\nPlease use this registration number to set up the student portal account.\n\nThank you.\n- PCC School`;
    } else if (type === "payment") {
      smsType = "fees_payment";
      message = `Dear Guardian,\n\nA fees payment of $${parseFloat(amount).toFixed(2)} has been recorded for ${studentName}.\n\nReceipt: ${receiptNumber || "Pending"}\nMethod: ${method || "N/A"}\n\nThank you for your payment.\n- PCC School`;
    } else {
      message = `Dear Guardian,\n\nThis is a notification regarding ${studentName} at Progress Christian Centre.\n\nRegistration Number: ${registrationNumber || "N/A"}\n\nThank you.\n- PCC School`;
    }

    const PINGRAM_API_KEY = Deno.env.get("PINGRAM_API_KEY");
    if (!PINGRAM_API_KEY) throw new Error("PINGRAM_API_KEY is not configured");
    // Send via Pingram REST API - POST /send with Bearer auth
    const pingramResponse = await fetch("https://api.pingram.io/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PINGRAM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: smsType,
        to: {
          id: guardianPhone,
          number: formattedPhone,
        },
        sms: {
          message: message,
        },
      }),
    });

    const responseText = await pingramResponse.text();
    let pingramData;
    try {
      pingramData = JSON.parse(responseText);
    } catch {
      pingramData = { raw: responseText };
    }

    console.log("Pingram response status:", pingramResponse.status, "body:", responseText);

    if (!pingramResponse.ok) {
      console.error("Pingram API error:", JSON.stringify(pingramData));
      return new Response(JSON.stringify({
        error: "Failed to send SMS notification",
        details: pingramData,
      }), {
        status: pingramResponse.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      data: pingramData,
      type: smsType,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Notification error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
