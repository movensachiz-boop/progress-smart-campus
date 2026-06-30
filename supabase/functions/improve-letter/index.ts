import { createClient } from "https://esm.sh/@supabase/supabase-js@2.101.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await supabaseAdmin
      .from("user_roles").select("role")
      .eq("user_id", caller.id).eq("role", "admin").maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { subject, body, salutation, closing, recipientName } = await req.json();
    if (!body || typeof body !== "string" || !body.trim()) {
      return new Response(JSON.stringify({ error: "Body required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are a professional business correspondence editor for Progress Christian College (a school in Zimbabwe). You rewrite letter drafts into clear, polished, formal British English suitable for an official school business letter.

Rules:
- Fix grammar, spelling, punctuation, capitalisation and tone.
- Keep the writer's intent and all facts (names, dates, figures, references) exactly as given. Do NOT invent new facts.
- Use a respectful, professional, formal register. Avoid contractions and slang.
- Organise into clear paragraphs separated by a blank line. Keep numbered lists on their own lines.
- Do NOT add a salutation, closing, signature, address, date, or "RE:" subject line — only return the refined BODY paragraphs.
- Do NOT wrap the answer in quotes or markdown. Return plain text only.
- If a subject is provided, you may also return an improved subject (concise, Title Case, no "RE:" prefix).

Return STRICT JSON with this shape:
{"subject": "<improved subject or empty string>", "body": "<improved body text>"}`;

    const userPrompt = `Recipient: ${recipientName || "(not specified)"}
Salutation: ${salutation || "Dear Sir/Madam,"}
Closing: ${closing || "Yours faithfully,"}
Current subject: ${subject || "(none)"}

Current body draft:
"""
${body}
"""`;

    const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!ai.ok) {
      const txt = await ai.text();
      return new Response(JSON.stringify({ error: `AI error: ${ai.status}`, detail: txt }), {
        status: ai.status === 429 || ai.status === 402 ? ai.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await ai.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    let parsed: { subject?: string; body?: string } = {};
    try { parsed = JSON.parse(content); } catch {
      // Try to salvage – return raw as body
      parsed = { body: content };
    }

    return new Response(JSON.stringify({
      subject: (parsed.subject || "").trim(),
      body: (parsed.body || "").trim(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
