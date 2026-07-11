import { createClient } from "https://esm.sh/@supabase/supabase-js@2.101.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
      .from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin").maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { imageBase64, imagePath, fileBase64, filePath, fileName, mimeType } = await req.json();
    let uploadedDataUrl: string | null = null;
    let uploadedMime = "image/jpeg";
    let uploadedName = typeof fileName === "string" && fileName.trim() ? fileName.trim() : "quotation";

    if ((filePath || imagePath) && typeof (filePath || imagePath) === "string") {
      // Download from storage server-side to avoid huge request bodies.
      const storagePath = String(filePath || imagePath);
      const { data: fileData, error: dlErr } = await supabaseAdmin.storage
        .from("requisition-scans").download(storagePath);
      if (dlErr || !fileData) {
        return new Response(JSON.stringify({ error: `Could not load file: ${dlErr?.message || "not found"}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const buf = new Uint8Array(await fileData.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      const b64 = btoa(bin);
      uploadedMime = fileData.type || mimeType || (storagePath.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
      uploadedName = uploadedName.includes(".") ? uploadedName : storagePath.split("/").pop() || uploadedName;
      uploadedDataUrl = `data:${uploadedMime};base64,${b64}`;
    } else if (fileBase64 && typeof fileBase64 === "string") {
      uploadedMime = typeof mimeType === "string" && mimeType ? mimeType : (fileBase64.startsWith("data:application/pdf") ? "application/pdf" : "image/jpeg");
      uploadedDataUrl = fileBase64.startsWith("data:") ? fileBase64 : `data:${uploadedMime};base64,${fileBase64}`;
    } else if (imageBase64 && typeof imageBase64 === "string") {
      uploadedMime = "image/jpeg";
      uploadedDataUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
    } else {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const attachment = uploadedMime.includes("pdf")
      ? { type: "file", file: { filename: uploadedName.toLowerCase().endsWith(".pdf") ? uploadedName : `${uploadedName}.pdf`, file_data: uploadedDataUrl } }
      : { type: "image_url", image_url: { url: uploadedDataUrl } };

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a strict OCR assistant for a school procurement system. Extract procurement details ONLY from the quotation, invoice, receipt, or requisition attached in this request. Do NOT carry over, remember, or invent details from any previous document, conversation, or example. If a field is not clearly visible in THIS document, return an empty string (or 0 for numbers). If the document is blank or unreadable, return an empty items array and empty fields.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Read ONLY the attached document and extract supplier/request details and every visible line item with quantity, unit, and unit price where available. Ignore anything you may have seen before." },
              attachment,
            ],
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_requisition",
            description: "Extract requisition data",
            parameters: {
              type: "object",
              properties: {
                requested_by: { type: "string", description: "Name of person requesting" },
                department: { type: "string" },
                purpose: { type: "string" },
                currency: { type: "string", description: "USD, ZWL, or ZAR" },
                notes: { type: "string" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      description: { type: "string" },
                      quantity: { type: "number" },
                      unit: { type: "string" },
                      unit_price: { type: "number" },
                    },
                    required: ["description", "quantity"],
                  },
                },
              },
              required: ["items"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_requisition" } },
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
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Failed to process image" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: any = {};
    if (toolCall?.function?.arguments) {
      try { parsed = JSON.parse(toolCall.function.arguments); } catch { parsed = {}; }
    }

    return new Response(JSON.stringify({
      requested_by: parsed.requested_by || "",
      department: parsed.department || "",
      purpose: parsed.purpose || "",
      currency: parsed.currency || "USD",
      notes: parsed.notes || "",
      items: Array.isArray(parsed.items) ? parsed.items : [],
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
