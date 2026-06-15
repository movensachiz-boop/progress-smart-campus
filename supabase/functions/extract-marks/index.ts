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

const parseTranscriptRows = (text: string) => {
  const students: { name: string; marks: Record<string, number> }[] = [];
  const subjectSet = new Set<string>();
  const codePattern = "LIT|R\\/?S|RS|HIS|C\\/?SC|CSC|BIO|CHE|MAT|ACC|PHY|GEO|BUS|ECO|ENG|SHO|AGR|F\\/?N|FN|ART";
  const markRegex = new RegExp(`\\b(${codePattern})\\b\\s*[:=\\-]?\\s*(\\d{1,3})`, "gi");

  for (const rawLine of text.split(/\n+/)) {
    const line = rawLine.trim();
    if (!/^\d{1,2}\b/.test(line)) continue;
    const marks: Record<string, number> = {};
    let firstSubjectIndex = line.length;
    for (const match of line.matchAll(markRegex)) {
      const code = normalizeSubjectCode(match[1]);
      const mark = Number(match[2]);
      if (!canonicalSubjectCodes.includes(code) || !Number.isFinite(mark) || mark < 0 || mark > 100) continue;
      marks[code] = mark;
      subjectSet.add(code);
      firstSubjectIndex = Math.min(firstSubjectIndex, match.index ?? line.length);
    }
    if (!Object.keys(marks).length) continue;
    const beforeMarks = line.slice(0, firstSubjectIndex).replace(/^\d{1,2}\s+/, "").trim();
    const name = beforeMarks.replace(/\b(POINTS?|TOTAL)\b.*$/i, "").replace(/\s+/g, " ").trim();
    if (name) students.push({ name, marks });
  }

  return { students, subject_codes: [...subjectSet] };
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
      ? expectedStudents.slice(0, 250).map((s: any, i: number) => {
        const subs = Array.isArray(s.subjects) ? s.subjects.join(",") : "";
        return `${i + 1}. ${s.name || ""}${subs ? ` [${subs}]` : ""}`;
      }).join("\n")
      : "No roster provided.";
    const expectedCodesText = Array.isArray(expectedSubjectCodes) && expectedSubjectCodes.length
      ? expectedSubjectCodes.join(", ")
      : "Use the subject headers visible on the sheet.";


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
            content: `You are a strict OCR engine for a school exam mark sheet with handwritten NUMERIC MARKS.

IMPORTANT: The main task is to read the numbers in the subject cells. Do not drop numbers just because the handwriting is imperfect. If a mark is visible but uncertain, return your best numeric reading. Only leave a subject out when that cell is truly blank.

LAYOUT: The sheet is a grid. The leftmost columns are an index number and a STUDENT NAME (surname then first name, e.g. "CHUNDU TRISHA"). The remaining columns are SUBJECT columns with header codes such as: LIT, R/S, HIS, C/SC, BIO, CHE, MAT, ACC, PHY, GEO, BUS, ECO, ENG, SHO, AGR, FN, ART. The last column may be POINTS or TOTAL — IGNORE it (we recompute).

GOAL: For EVERY student row, return the handwritten mark in EVERY filled subject cell, mapped to that column's subject code. Scan horizontally across the row and read each number under its printed subject header. Do NOT skip filled cells. Do NOT invent marks for empty cells. Marks are integers 0–100 (commonly 10–95). Read carefully — 1 vs 7, 4 vs 9, 0 vs 6, 3 vs 8, 5 vs 6 are easy to confuse; cross-check with row lines and column boundaries.

Use the provided roster only to help match names and expected subject columns. The photo is still the source of truth for the marks: extract the visible numbers from the sheet.

NUMBER RULES:
- Return raw integers only, not strings, not grades, not percentages.
- If two digits are written close together, read them as one mark (e.g. "40", "17", "30").
- Do not confuse the printed row/index number with a subject mark.
- Do not confuse totals/points with subject marks; ignore POINTS/TOTAL columns.
- If the name is readable but only some marks are readable, still return the readable marks.

NORMALIZE column codes to UPPERCASE with no separators:
  C/SC -> CSC, R/S -> RS, F/N -> FN, A/RT -> ART, B/S -> BUS, E/CO -> ECO.
Use these canonical codes: LIT, RS, HIS, CSC, BIO, CHE, MAT, ACC, PHY, GEO, BUS, ECO, ENG, SHO, AGR, FN, ART.

OUTPUT (via tool call only):
- students[]: each with { name: "FULL NAME AS WRITTEN", marks: { CODE: number, ... } } — include EVERY filled cell for that row.
- subject_codes[]: the column codes seen on the sheet, in left-to-right order.

Skip rows that have no name. Never include the POINTS/TOTAL column.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Read the attached mark sheet. Extract every student name and every visible handwritten numeric mark under each subject column. Focus especially on the numbers in the cells.\n\nExpected subject columns: ${expectedCodesText}\n\nClass roster to match against:\n${rosterText}` },
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
                        name: { type: "string" },
                        marks: {
                          type: "object",
                          additionalProperties: { type: "number" },
                          description: "Map of subject code -> mark",
                        },
                      },
                      required: ["name", "marks"],
                    },
                  },
                  subject_codes: {
                    type: "array",
                    items: { type: "string" },
                    description: "All subject column codes seen on the sheet, in order",
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
    let parsed: { students: any[]; subject_codes?: string[] } = { students: [] };
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try { parsed = JSON.parse(toolCall.function.arguments); } catch { /* ignore */ }
    }

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
