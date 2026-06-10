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

    const { imageBase64 } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an OCR assistant. Extract the total spent from a shop receipt, till slip, invoice, or hand-written receipt. Return a single expense entry. Pick the GRAND TOTAL / PAID amount, not subtotals. Infer a short description from the vendor/items, and pick a sensible category from: Food, Groceries, Transport, Fuel, Stationery, Utilities, Maintenance, Cleaning, Equipment, Services, Other. Date in YYYY-MM-DD.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract expense fields from this receipt image." },
              { type: "image_url", image_url: { url: imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` } },
            ],
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_expense",
            description: "Extract expense fields",
            parameters: {
              type: "object",
              properties: {
                description: { type: "string" },
                vendor: { type: "string" },
                amount: { type: "string" },
                currency: { type: "string" },
                category: { type: "string" },
                date: { type: "string" },
              },
              required: ["amount"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_expense" } },
      }),
    });

    if (!ai.ok) {
      const t = await ai.text();
      console.error("AI error:", ai.status, t);
      return new Response(JSON.stringify({ error: ai.status === 429 ? "AI busy, retry" : "Extraction failed" }), {
        status: ai.status === 429 ? 429 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await ai.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let expense: any = null;
    try { expense = args ? JSON.parse(args) : null; } catch { /* ignore */ }
    if (!expense) {
      return new Response(JSON.stringify({ error: "Could not read receipt. Try a clearer photo." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (expense.vendor && !expense.description) {
      expense.description = `Purchase at ${expense.vendor}`;
    }
    return new Response(JSON.stringify({ expense }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
