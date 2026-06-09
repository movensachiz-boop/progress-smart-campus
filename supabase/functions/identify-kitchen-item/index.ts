// Identify a kitchen item from a photo using Lovable AI (Gemini vision).
// Returns suggested name, category, unit, container type, est unit cost.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const CATEGORIES = ["ingredient", "dry_goods", "vegetables", "meat", "dairy", "beverage", "supplies", "other"];
const UNITS = ["kg", "g", "L", "ml", "pcs", "pkt", "tin", "tray", "bag", "box"];
const CONTAINERS = ["tin", "bottle", "packet", "bag", "box", "tray", "carton", "jar", "sachet", "loose"];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'AI not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const image: string | undefined = body?.image; // data URL or https url
    if (!image || typeof image !== 'string') {
      return new Response(JSON.stringify({ error: 'image required (data URL or https URL)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const systemPrompt = `You are a kitchen inventory assistant. Look at the photo of a single grocery/kitchen item and identify it using common knowledge of supermarket products. Reply with STRICT JSON only — no markdown, no commentary.

JSON shape:
{
  "name": string,            // short product name, e.g. "Mazoe Orange Crush", "Tomato Sauce", "Cooking Oil"
  "brand": string|null,      // brand if visible, else null
  "container": one of ${JSON.stringify(CONTAINERS)},
  "category": one of ${JSON.stringify(CATEGORIES)},
  "unit": one of ${JSON.stringify(UNITS)},   // best matching stock unit
  "pack_size": string|null,  // e.g. "2L", "500g", "410g", null if unknown
  "confidence": number,      // 0..1
  "notes": string|null       // any extra detail (flavour, variant) or null
}

Mapping hints: tin->tin, bottle->ml or L (use L if >=1L), packet/sachet->pkt, bag of rice/sugar->bag or kg, eggs->tray, single item->pcs.`;

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: [
            { type: 'text', text: 'Identify this kitchen item. Return JSON only.' },
            { type: 'image_url', image_url: { url: image } },
          ] },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      const status = aiRes.status === 429 ? 429 : aiRes.status === 402 ? 402 : 500;
      return new Response(JSON.stringify({ error: 'AI request failed', detail: errText }), {
        status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiRes.json();
    const raw = aiData?.choices?.[0]?.message?.content || '{}';
    let parsed: any = {};
    try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { parsed = {}; }

    // Sanitize against allowed lists
    const cat = CATEGORIES.includes(parsed.category) ? parsed.category : 'other';
    const unit = UNITS.includes(parsed.unit) ? parsed.unit : 'pcs';
    const container = CONTAINERS.includes(parsed.container) ? parsed.container : 'loose';

    const result = {
      name: String(parsed.name || '').slice(0, 120),
      brand: parsed.brand ? String(parsed.brand).slice(0, 80) : null,
      container,
      category: cat,
      unit,
      pack_size: parsed.pack_size ? String(parsed.pack_size).slice(0, 40) : null,
      confidence: Number(parsed.confidence) || 0,
      notes: parsed.notes ? String(parsed.notes).slice(0, 200) : null,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
