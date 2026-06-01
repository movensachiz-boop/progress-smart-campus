import { createClient } from "https://esm.sh/@supabase/supabase-js@2.101.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ExtractedRow = {
  date?: string;
  details?: string;
  student_name?: string;
  amount?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
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
    const { data: roleData } = await supabaseAdmin
      .from("user_roles").select("role")
      .eq("user_id", caller.id).eq("role", "admin").maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { imageBase64 } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an OCR assistant for a school accounts office processing a BANK STATEMENT table of fee deposits.

COLUMN ORDER (fixed): [Posting Date] [Details/Description] [Debit] [Credit] [Balance].

HOW EACH TRANSACTION IS LAID OUT (CRITICAL — READ CAREFULLY):
- Each transaction occupies a BLOCK of usually 2 lines in the Details column.
- LINE 1 of the block sits on the SAME horizontal row as the Posting Date AND the Credit amount. This line is usually a header like "FEES" / "DEPOSIT" / "VACATION FEES T1 2026". It does NOT contain the student name.
- LINE 2 of the block sits DIRECTLY BELOW the Posting Date (one line lower) and contains the STUDENT NAME (and sometimes form/stream).
- The DATE and CREDIT AMOUNT are horizontally aligned with LINE 1. The STUDENT NAME is the line immediately BELOW that date.
- For ONE transaction: take the date from the Posting Date column, take the credit amount from the Credit column on the SAME row as the date, and take the student name from the description line DIRECTLY BELOW the date (still within the same transaction block, before the next Posting Date appears).

DO NOT shift rows. A common mistake is to read the student name from the CURRENT date row and pair it with the NEXT row's amount — this is WRONG. The amount belongs to the date that sits on the SAME row as the header line ABOVE the name, not the row of the name itself.

For EACH transaction block, return:
- date: value from the Posting Date column (YYYY-MM-DD if possible, else as printed).
- details: the full description block (header line + name line) as printed.
- student_name: the student full name parsed from the line DIRECTLY BELOW the Posting Date. If multiple names appear, take the first full person name. Strip labels (FEES, FEES-, DEPOSIT, VACATION, TERM/T1/T2/T3 + year, F1..F6, FORM 1..6, BLUE/YELLOW/GREEN/RED/G1/G2/G22/SCIENCES/COMMERCIALS/ARTS). Title case. Never include phone or account numbers.
- amount: the number from the Credit column HORIZONTALLY ALIGNED with this Posting Date (same row as the header line, NOT the name line). NEVER take Debit. NEVER take the next row's Credit. If the Credit cell on the date's row is empty/zero, SKIP this transaction.

Skip "Brought Forward Balance", running totals, headers, and any debit-only rows.

Return ONLY a JSON object: {"rows":[{...}, ...]}. No markdown.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Read each transaction as a BLOCK. The Posting Date and the Credit amount are on the SAME horizontal row. The student name is on the line DIRECTLY BELOW the date (still within the same block). Pair the date + amount from the top row of the block with the name from the line beneath it. Do NOT pair the name's row with the next transaction's amount. Skip rows whose Credit cell is empty or zero." },
              {
                type: "image_url",
                image_url: {
                  url: imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_payments",
              description: "Extract many fee deposit rows from a bank statement",
              parameters: {
                type: "object",
                properties: {
                  rows: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        date: { type: "string" },
                        details: { type: "string" },
                        student_name: { type: "string" },
                        amount: { type: "string" },
                      },
                      required: ["student_name", "amount"],
                    },
                  },
                },
                required: ["rows"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_payments" } },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errorText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "AI service is busy. Please try again." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Lovable Cloud." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Failed to process image" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    let rows: ExtractedRow[] = [];
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
      } catch (e) {
        console.error("Parse error:", e);
      }
    }

    // Clean up: drop empty/zero amounts, strip phone-like strings
    rows = rows
      .map((r) => ({
        date: (r.date || "").trim(),
        details: (r.details || "").trim(),
        student_name: (r.student_name || "").replace(/\+?\d[\d\s-]{6,}/g, "").trim(),
        amount: String(r.amount || "").replace(/[^0-9.]/g, ""),
      }))
      .filter((r) => r.student_name && r.amount && parseFloat(r.amount) > 0);

    return new Response(JSON.stringify({ rows }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
