import { createClient } from "https://esm.sh/@supabase/supabase-js@2.101.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const canonicalSubjectCodes = ["LIT", "RS", "HIS", "CSC", "BIO", "CHE", "MAT", "ACC", "PHY", "GEO", "BUS", "ECO", "ENG", "SHO", "AGR", "FN", "ART"];

const normalizeSubjectCode = (raw: string) => {
  const stripped = raw.trim().toUpperCase().replace(/\s+/g, "").replace(/[\/\.\-]/g, "");
  const map: Record<string, string> = {
    CSC: "CSC", CSCIE: "CSC", COMPUTER: "CSC", COMPSC: "CSC", CSCIENCE: "CSC",
    RS: "RS", RE: "RS", RELIGIOUS: "RS",
    LIT: "LIT", LITERATURE: "LIT",
    BIO: "BIO", BIOLOGY: "BIO",
    CHE: "CHE", CHEM: "CHE", CHEMISTRY: "CHE",
    MAT: "MAT", MATH: "MAT", MATHS: "MAT", MATHEMATICS: "MAT",
    ACC: "ACC", ACCOUNTS: "ACC", ACCOUNTING: "ACC",
    PHY: "PHY", PHYSICS: "PHY",
    GEO: "GEO", GEOGRAPHY: "GEO",
    BUS: "BUS", BUSINESS: "BUS",
    ECO: "ECO", ECONOMICS: "ECO",
    ENG: "ENG", ENGLISH: "ENG",
    SHO: "SHO", SHONA: "SHO",
    HIS: "HIS", HISTORY: "HIS",
    AGR: "AGR", AGRIC: "AGR", AGRICULTURE: "AGR",
    FN: "FN", FOOD: "FN", FOODNUTRITION: "FN",
    ART: "ART",
  };
  return map[stripped] || stripped;
};

const detectFormLevel = (text: string): number | null => {
  const upper = text.toUpperCase();
  if (/LOWER\s*6|LOWER\s*SIX/.test(upper)) return 5;
  if (/UPPER\s*6|UPPER\s*SIX/.test(upper)) return 6;
  const form = upper.match(/\bFORM\s*([1-6])\b/);
  if (form) return Number(form[1]);
  return null;
};

const parseTranscriptRows = (text: string, fallbackCodes: string[] = []) => {
  const students: { name: string; marks: Record<string, number>; row_number?: number }[] = [];
  const subjectSet = new Set<string>();
  const subjectOrder: string[] = [];
  const normalizedFallback = fallbackCodes
    .map((c) => normalizeSubjectCode(c))
    .filter((c, i, arr) => canonicalSubjectCodes.includes(c) && arr.indexOf(c) === i);
  // If the sheet has no printed header, fall back to the historical/expected column order
  // so we can still align "name then numbers" rows to subject codes immediately.
  let activeHeader: string[] = [...normalizedFallback];
  let sequence = 0;
  const pushSubject = (raw: string) => {
    const code = normalizeSubjectCode(raw);
    if (canonicalSubjectCodes.includes(code) && !subjectSet.has(code)) {
      subjectSet.add(code);
      subjectOrder.push(code);
    }
  };
  const codePattern = "LIT|R\\/?S|RS|HIS|C\\/?SC|CSC|BIO|CHE|MAT|ACC|PHY|GEO|BUS|ECO|ENG|SHO|AGR|F\\/?N|FN|ART";
  const markRegex = new RegExp(`\\b(${codePattern})\\b\\s*[:=\\-]?\\s*(\\d{1,3})`, "gi");
  const subjectRegex = new RegExp(`\\b(${codePattern})\\b`, "gi");
  const parseMark = (raw: string) => {
    const mark = Number(raw);
    return Number.isFinite(mark) && mark >= 0 && mark <= 100 ? mark : null;
  };

  for (const rawLine of text.split(/\n+/)) {
    const line = rawLine.trim();
    const headerMatches = [...line.matchAll(subjectRegex)];
    const lineSubjects = headerMatches
      .map((match) => normalizeSubjectCode(match[1]))
      .filter((code, index, arr) => canonicalSubjectCodes.includes(code) && arr.indexOf(code) === index);
    const explicitMarkMatches = [...line.matchAll(markRegex)];
    if (lineSubjects.length >= 3 && !explicitMarkMatches.length && !/^\d{1,2}\b/.test(line)) {
      activeHeader = lineSubjects;
      activeHeader.forEach(pushSubject);
      continue;
    }
    const rowNumMatch = line.match(/^(\d{1,2})\b/);
    if (!rowNumMatch && !explicitMarkMatches.length) continue;
    const marks: Record<string, number> = {};
    let firstSubjectIndex = line.length;
    for (const match of explicitMarkMatches) {
      const code = normalizeSubjectCode(match[1]);
      const mark = parseMark(match[2]);
      if (!canonicalSubjectCodes.includes(code) || mark == null) continue;
      marks[code] = mark;
      pushSubject(code);
      firstSubjectIndex = Math.min(firstSubjectIndex, match.index ?? line.length);
    }
    if (!Object.keys(marks).length && activeHeader.length) {
      const withoutRowNumber = line.replace(/^\d{1,2}\s+/, "");
      const numberMatches = [...withoutRowNumber.matchAll(/\b\d{1,3}\b/g)]
        .map((match) => ({ mark: parseMark(match[0]), index: match.index ?? withoutRowNumber.length }))
        .filter((match): match is { mark: number; index: number } => match.mark != null);
      const usableMarks = numberMatches.slice(0, activeHeader.length);
      usableMarks.forEach(({ mark }, index) => {
        const code = activeHeader[index];
        marks[code] = mark;
        pushSubject(code);
      });
      if (numberMatches[0]) firstSubjectIndex = line.indexOf(withoutRowNumber) + numberMatches[0].index;
    }
    if (!Object.keys(marks).length) continue;
    const beforeMarks = line.slice(0, firstSubjectIndex).replace(/^\d{1,2}\s+/, "").trim();
    const name = beforeMarks.replace(/\b(POINTS?|TOTAL)\b.*$/i, "").replace(/\s+/g, " ").trim();
    if (name) {
      sequence++;
      const row_number = rowNumMatch ? Number(rowNumMatch[1]) : sequence;
      students.push({ name, marks, row_number });
    }
  }

  return { students, subject_codes: subjectOrder };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { imageBase64, expectedStudents = [], expectedSubjectCodes = [] } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rosterText = Array.isArray(expectedStudents) && expectedStudents.length
      ? expectedStudents.slice(0, 250).map((s: any) => {
        const subs = Array.isArray(s.subjects) ? s.subjects.join(",") : "";
        return `- ${s.name || ""}${subs ? ` [${subs}]` : ""}`;
      }).join("\n")
      : "No roster provided.";
    const expectedCodesText = Array.isArray(expectedSubjectCodes) && expectedSubjectCodes.length
      ? expectedSubjectCodes.join(", ")
      : "Use the subject headers visible on the sheet.";


    const imageUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;

    const transcriptResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a strict OCR transcriber for a school exam mark sheet with handwritten NUMERIC MARKS.

Transcribe the photo row by row. Include the form/level heading, printed subject headers, every student name, and every visible handwritten mark. Write each mark as CODE: number under the correct subject code. Ignore POINTS/TOTAL except do not confuse them with subject marks.

If the page says LOWER 6, that means Form 5. If it says UPPER 6, that means Form 6.

Use canonical subject codes: LIT, RS, HIS, CSC, BIO, CHE, MAT, ACC, PHY, GEO, BUS, ECO, ENG, SHO, AGR, FN, ART. Normalize C/SC to CSC and R/S to RS. NEVER skip the GEO column or any other subject column that appears in the header — even if some students have blank cells in that column, include marks for the students who do have them.

Return plain text only, one student row per line, like:
LOWER 6 (2026 MID-TERM 2 EXAMINATIONS)
NAME(S) LIT RS HIS CSC BIO CHE MAT ACC PHY GEO BUS ECO POINTS
1 CHUNDU TRISHA CHE: 40 PHY: 13 GEO: 17
2 TSANU FAN CSC: 94 CHE: 84 MAT: 76 PHY: 78`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Transcribe this mark sheet. Read the handwritten numbers carefully and include every visible mark under its subject header.\n\nExpected subject columns: ${expectedCodesText}\n\nClass roster is ONLY for spelling names. Do not use this roster order as row order; use the photo's printed/visual top-to-bottom order only:\n${rosterText}` },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 5000,
      }),
    });

    if (!transcriptResponse.ok) {
      const errorText = await transcriptResponse.text();
      console.error("AI transcript error:", transcriptResponse.status, errorText);
      if (transcriptResponse.status === 429) {
        return new Response(JSON.stringify({ error: "AI busy. Try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (transcriptResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Failed to process image" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transcriptData = await transcriptResponse.json();
    const transcript = String(transcriptData.choices?.[0]?.message?.content || "").trim();
    const transcriptParsed = parseTranscriptRows(transcript);
    const detectedFormLevel = detectFormLevel(transcript);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You convert OCR transcription of a school exam mark sheet into structured rows.

Extract the visible CODE: number pairs exactly from the transcription. Do not drop numbers. Do not include POINTS/TOTAL. Use LOWER 6 = form_level 5 and UPPER 6 = form_level 6.

CRITICAL: Emit students[] strictly in the TOP-TO-BOTTOM order they appear on the sheet. Include row_number for every student using the printed row number on the sheet (1, 2, 3, ...). If a row number is not printed, use the visual top-to-bottom sequence (1-based).

OUTPUT via tool call only:
- students[]: each with { row_number: integer, name: "FULL NAME", marks: { CODE: number } }
- subject_codes[]: subject codes seen on the sheet
- form_level: detected numeric form level when visible`,
          },
          {
            role: "user",
            content: `OCR transcription:\n${transcript}\n\nExpected subject columns: ${expectedCodesText}\n\nClass roster below is ONLY for matching spellings. It is not the sheet order, so never sort by this roster:\n${rosterText}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_marks",
              description: "Extract student rows and per-subject marks",
              parameters: {
                type: "object",
                properties: {
                  students: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        row_number: { type: "number", description: "1-based row number as printed on the sheet or visual top-to-bottom position" },
                        name: { type: "string" },
                        marks: {
                          type: "object",
                          additionalProperties: { type: "number" },
                          description: "Map of subject code -> mark",
                        },
                      },
                      required: ["row_number", "name", "marks"],
                    },
                  },
                  subject_codes: {
                    type: "array",
                    items: { type: "string" },
                    description: "All subject column codes seen on the sheet, in order",
                  },
                  form_level: {
                    type: "number",
                    description: "Detected form level. LOWER 6 is 5, UPPER 6 is 6.",
                  },
                },
                required: ["students"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_marks" } },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errorText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "AI busy. Try again shortly." }), {
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
    let parsed: { students: any[]; subject_codes?: string[]; form_level?: number | null; transcript?: string } = { students: [] };
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try { parsed = JSON.parse(toolCall.function.arguments); } catch { /* ignore */ }
    }

    const structuredCells = (parsed.students || []).reduce((sum, row: any) => sum + Object.keys(row?.marks || {}).length, 0);
    const transcriptCells = transcriptParsed.students.reduce((sum, row) => sum + Object.keys(row.marks).length, 0);
    if (transcriptCells > structuredCells) {
      parsed.students = transcriptParsed.students;
    }
    // Always prefer the transcript's subject order (left-to-right header order from the sheet).
    // The structured tool-call often returns codes alphabetically, losing the form's column order.
    if (transcriptParsed.subject_codes.length) {
      parsed.subject_codes = transcriptParsed.subject_codes;
    }
    // Reorder each student's marks object to follow the header order too (helps any downstream consumer
    // that iterates Object.entries in insertion order).
    if (parsed.subject_codes?.length) {
      const order = parsed.subject_codes;
      parsed.students = (parsed.students || []).map((row: any) => {
        const ordered: Record<string, number> = {};
        for (const c of order) {
          if (row?.marks && row.marks[c] != null) ordered[c] = row.marks[c];
        }
        // append any extras not in header order
        for (const [k, v] of Object.entries(row?.marks || {})) {
          if (!(k in ordered)) ordered[k] = v as number;
        }
        return { ...row, marks: ordered };
      });
    }
    parsed.form_level = parsed.form_level || detectedFormLevel;
    // Ensure students are sorted by row_number (top-to-bottom on the form)
    parsed.students = (parsed.students || []).map((row: any, i: number) => ({
      ...row,
      row_number: Number.isFinite(Number(row?.row_number)) ? Number(row.row_number) : i + 1,
    })).sort((a: any, b: any) => (a.row_number ?? 0) - (b.row_number ?? 0));
    parsed.transcript = transcript;

    if (!parsed.students?.length) {
      return new Response(JSON.stringify({ error: "Could not read any rows. Try a clearer photo." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
