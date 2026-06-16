import { createClient } from "https://esm.sh/@supabase/supabase-js@2.101.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const canonicalSubjectCodes = ["LIT", "RS", "HIS", "CSC", "BIO", "CHE", "MAT", "ACC", "PHY", "GEO", "BUS", "ECO", "ENG", "SHO", "AGR", "FN", "ART", "HERI", "FRE", "BS", "SCI", "MUS", "ICT", "COMB"];

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
    HERI: "HERI", HER: "HERI", HERITAGE: "HERI", HERITAGESTUDIES: "HERI",
    FRE: "FRE", FRENCH: "FRE",
    BS: "BS", BUSINESSSTUDIES: "BS",
    SCI: "SCI", SCIENCE: "SCI",
    MUS: "MUS", MUSIC: "MUS",
    ICT: "ICT", INFORMATION: "ICT", INFORMATIONTECHNOLOGY: "ICT", COMPUTERSTUDIES: "ICT",
    COMB: "COMB", COMBINED: "COMB", COMBINEDSCIENCE: "COMB", CLS: "COMB",
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
  const codePattern = "LIT|R\\/?S|RS|HIS|C\\/?SC|CSC|BIO|CHE|MAT|ACC|PHY|GEO|BUS|ECO|ENG|SHO|AGR|F\\/?N|FN|ART|HERI|HER|FRE|BS|SCI|MUS|ICT|COMB";
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
    if (activeHeader.length) {
      const withoutRowNumber = line.replace(/^\d{1,2}\s+/, "");
      const explicitRanges = explicitMarkMatches.map((match) => ({
        start: match.index ?? -1,
        end: (match.index ?? -1) + match[0].length,
      }));
      const numberMatches = [...withoutRowNumber.matchAll(/\b\d{1,3}\b/g)]
        .map((match) => ({ mark: parseMark(match[0]), index: match.index ?? withoutRowNumber.length }))
        .filter((match): match is { mark: number; index: number } => {
          if (match.mark == null) return false;
          const originalIndex = line.indexOf(withoutRowNumber) + match.index;
          return !explicitRanges.some((range) => originalIndex >= range.start && originalIndex < range.end);
        });
      // Positional fallback: assign numbers left-to-right to header columns. If there are fewer
      // numbers than columns, the trailing columns are simply blank (do not drop the row). If
      // there are more numbers than columns, ignore the extras (likely POINTS/TOTAL trailing cols).
      if (!Object.keys(marks).length && numberMatches.length > 0) {
        const take = Math.min(numberMatches.length, activeHeader.length);
        for (let i = 0; i < take; i++) {
          const code = activeHeader[i];
          marks[code] = numberMatches[i].mark;
          pushSubject(code);
        }
        firstSubjectIndex = line.indexOf(withoutRowNumber) + numberMatches[0].index;
      } else if (Object.keys(marks).length && numberMatches.length > 0) {
        // Some phone OCR transcripts mix CODE:number pairs with extra bare numbers on the
        // same row. Do not lose those extra visible marks: put them into the next empty
        // expected subject columns in left-to-right order.
        let headerCursor = 0;
        for (const match of numberMatches) {
          while (headerCursor < activeHeader.length && marks[activeHeader[headerCursor]] != null) headerCursor++;
          if (headerCursor >= activeHeader.length) break;
          const code = activeHeader[headerCursor];
          marks[code] = match.mark;
          pushSubject(code);
          firstSubjectIndex = Math.min(firstSubjectIndex, line.indexOf(withoutRowNumber) + match.index);
          headerCursor++;
        }
      }
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

CRITICAL COLUMN ALIGNMENT RULES — accuracy of column placement matters more than anything else:
1. First, look at the printed subject header row of the table and list every column header in order, left to right.
2. For EACH student row, look at every column cell INDIVIDUALLY (not just the numbers you see). Decide if that cell is filled or BLANK.
3. ALWAYS write each mark as "CODE: number" using the canonical code of the column the mark physically sits under. Never output a bare number without its CODE: prefix in a student row.
4. If a cell is empty / blank / dashed, OMIT it entirely (do not guess, do not shift the next number leftwards into the blank column).
5. Read column-by-column down the page when in doubt — vertical alignment of the handwritten digit with the printed header is the source of truth, not horizontal position relative to other numbers in the same row.
6. Capture EVERY visible handwritten mark. Do not skip a mark just because the column alignment is ambiguous — make your best column assignment based on horizontal/vertical position. It is far worse to silently drop a mark than to occasionally place one in the wrong column.

If the page says LOWER 6, that means Form 5. If it says UPPER 6, that means Form 6. Ignore POINTS/TOTAL columns; never treat them as a subject.

Use canonical subject codes: LIT, RS, HIS, CSC, BIO, CHE, MAT, ACC, PHY, GEO, BUS, ECO, ENG, SHO, AGR, FN, ART, HERI, FRE, BS, SCI, MUS, ICT, COMB. Normalize C/SC to CSC, R/S to RS, HER to HERI (Heritage Studies).

IF NO SUBJECT HEADER ROW IS VISIBLE on the sheet, ASSUME the columns are exactly the "Expected subject columns" provided by the user, IN THAT EXACT ORDER, and align each cell to those codes by horizontal position. Emit a synthetic header line and then CODE: number pairs.

Return plain text only — first the form/level heading, then the header row, then one student row per line, like:
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
    const transcriptParsed = parseTranscriptRows(transcript, expectedSubjectCodes);
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

Extract ONLY the visible CODE: number pairs exactly as written in the transcription. NEVER invent a CODE:number pair, NEVER move a number from one CODE to another, and NEVER fill in blank cells. Preserve the exact CODE each number was paired with by the transcriber — that pairing is the source of truth for column alignment. Do not include POINTS/TOTAL. Use LOWER 6 = form_level 5 and UPPER 6 = form_level 6.

If the sheet has NO subject header row, treat the user-provided "Expected subject columns" as the header in that exact left-to-right order and align each row's numbers to those codes.


CRITICAL: Emit students[] strictly in the TOP-TO-BOTTOM order they appear on the sheet. Include row_number for every student using the printed row number on the sheet (1, 2, 3, ...). If a row number is not printed, use the visual top-to-bottom sequence (1-based).

OUTPUT via tool call only:
- students[]: each with { row_number: integer, name: "FULL NAME", marks: { CODE: number } }
- subject_codes[]: subject codes seen on the sheet (or the assumed header from expected columns)
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
