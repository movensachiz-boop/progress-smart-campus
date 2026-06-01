import { createClient } from "https://esm.sh/@supabase/supabase-js@2.101.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ExtractedPayment = {
  depositor_name?: string;
  student_name?: string;
  amount?: string;
  currency?: string;
  bank_name?: string;
  swift_code?: string;
  reference_number?: string;
  transaction_id_format?: string;
  date?: string;
  method?: string;
};

type BankPattern = {
  bank_name: string;
  swift_code: string;
  id_regex: string;
  sample_reference: string | null;
  transaction_id_format: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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

    // Verify admin
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
            content: `You are an OCR assistant for a school accounts department. Extract payment information from bank deposit slips, mobile money receipts, or payment confirmations.

Extract:
- depositor_name (the person who made the deposit)
- student_name (the student/pupil/learner name if the receipt says it is for a different person; otherwise same as depositor_name)
- amount (numeric value only, no currency symbol)
- currency (USD, ZWL, etc. - default USD if unclear)
- bank_name (full official bank name, e.g. "Ecobank Zimbabwe", "NBS Building Society")
- swift_code (SWIFT/BIC code if visible, otherwise infer from known banks: Ecobank=ABORZIHA, NBS=NBSZZIHA, CBZ=CBZWZWHA, Stanbic=SBICZWHA, FBC=FBCPZWHA, ZB=ZBCOZWHA)
- reference_number (transaction/deposit reference number)
- transaction_id_format (describe the pattern of the reference number, e.g. "SMTXXXXXXXXXX" for alphanumeric or "DEP-NNNNNN" for sequential)
- date (payment date in YYYY-MM-DD format)
- method (Bank Deposit, Mobile Money, EcoCash, etc.)

Return ONLY a valid JSON object. No explanation or markdown.
Example: {"depositor_name":"James Mwangi","student_name":"James Mwangi","amount":"450","currency":"USD","bank_name":"Ecobank Zimbabwe","swift_code":"ADORZIHA","reference_number":"SMTEZWDTGBS9Y7Q8","transaction_id_format":"SMTXXXXXXXXXX","date":"2025-03-28","method":"Bank Deposit"}

If multiple names are visible, put the account payer in depositor_name and the student being paid for in student_name. If a field is not visible, use an empty string. Make your best guess for unclear text.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract all payment details from this deposit slip or payment receipt. Read carefully. Identify the bank, its SWIFT code, and the transaction ID format pattern." },
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
              name: "extract_payment",
              description: "Extract payment data from the deposit slip image",
              parameters: {
                type: "object",
                properties: {
                  depositor_name: { type: "string" },
                  student_name: { type: "string" },
                  amount: { type: "string" },
                  currency: { type: "string" },
                  bank_name: { type: "string" },
                  swift_code: { type: "string" },
                  reference_number: { type: "string" },
                  transaction_id_format: { type: "string" },
                  date: { type: "string" },
                  method: { type: "string" },
                },
                required: ["depositor_name", "amount"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_payment" } },
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
      return new Response(JSON.stringify({ error: "Failed to process image" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    let payment: ExtractedPayment | null = null;

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        payment = JSON.parse(toolCall.function.arguments);
      } catch {
        const content = aiData.choices?.[0]?.message?.content || "";
        try { payment = JSON.parse(content); } catch { console.error("Failed to parse:", content); }
      }
    }

    if (!payment) {
      return new Response(JSON.stringify({ error: "Could not extract payment details. Try a clearer photo." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate against known bank patterns
    const warnings: string[] = [];
    if (payment.bank_name) {
      // Fuzzy match bank name
      const bankNameLower = payment.bank_name.toLowerCase();
      const { data: patterns } = await supabaseAdmin.from("bank_document_patterns").select("*");

      const matchedPattern = (patterns as BankPattern[] | null)?.find((p) =>
        bankNameLower.includes(p.bank_name.toLowerCase().split(" ")[0].toLowerCase())
      );

      if (matchedPattern) {
        // Validate SWIFT code
        if (payment.swift_code && payment.swift_code !== matchedPattern.swift_code) {
          warnings.push(`SWIFT code mismatch: got "${payment.swift_code}", expected "${matchedPattern.swift_code}" for ${matchedPattern.bank_name}`);
        } else if (!payment.swift_code) {
          payment.swift_code = matchedPattern.swift_code;
        }

        // Validate reference number format
        if (payment.reference_number && matchedPattern.id_regex) {
          const regex = new RegExp(matchedPattern.id_regex);
          if (!regex.test(payment.reference_number)) {
            warnings.push(`Transaction ID "${payment.reference_number}" doesn't match expected ${matchedPattern.bank_name} format (e.g. ${matchedPattern.sample_reference})`);
          }
        }

        // Set canonical bank name and format
        payment.bank_name = matchedPattern.bank_name;
        payment.transaction_id_format = matchedPattern.transaction_id_format;
      } else {
        warnings.push(`Unknown bank "${payment.bank_name}" — no pattern on file to validate against`);
      }
    }

    return new Response(JSON.stringify({ payment, warnings }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
