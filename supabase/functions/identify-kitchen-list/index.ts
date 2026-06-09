// Extract a list of kitchen items + quantities from a photo of a written or printed list.
// Returns CSV lines matching the bulk-add format used in AdminKitchen.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const CATEGORIES = ["ingredient", "dry_goods", "vegetables", "meat", "dairy", "beverage", "supplies", "other"];
const UNITS = ["kg", "g", "L", "ml", "pcs", "pkt", "tin", "tray", "bag", "box"];

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
    const image: string | undefined = body?.image;
    if (!image || typeof image !== 'string') {
      return new Response(JSON.stringify({ error: 'image required (data URL or https URL)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const systemPrompt = `You are a kitchen inventory assistant. Look at the photo (handwritten or printed list of grocery/kitchen items with quantities) and extract every item. Use common supermarket knowledge to infer category and unit. Reply with STRICT JSON only.

JSON shape:
{
  "items": [
    {
      "name": string,                 // short product name, e.g. "Rice", "Cooking Oil", "Tomato Sauce"
      "category": one of ${JSON.stringify(CATEGORIES)},
      "unit": one of ${JSON.stringify(UNITS)},
      "quantity": number,             // 0 if unclear
      "unit_cost": number,            // 0 if not on the list
      "low_alert": number,            // sensible default e.g. 5
      "supplier": string|null,
      "notes": string|null            // brand, pack size, container, flavour
    }
  ]
}

Mapping hints: bottle->ml/L (L if >=1L), tin->tin, packet/sachet->pkt, bag of rice/sugar->bag or kg, eggs->tray, single item->pcs. If a quantity like "2x500g" appears, set quantity=2 and put "500g pack" into notes.`;

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: [
            { type: 'text', text: 'Extract all kitchen items from this list. Return JSON only.' },
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

    const rawItems: any[] = Array.isArray(parsed.items) ? parsed.items : [];
    const sanitize = (s: any) => String(s ?? '').replace(/[,\n\r]/g, ' ').trim();
    const items = rawItems.map((it) => {
      const cat = CATEGORIES.includes(it?.category) ? it.category : 'ingredient';
      const unit = UNITS.includes(it?.unit) ? it.unit : 'kg';
      return {
        name: sanitize(it?.name).slice(0, 120),
        category: cat,
        unit,
        quantity: Number(it?.quantity) || 0,
        unit_cost: Number(it?.unit_cost) || 0,
        low_alert: Number(it?.low_alert) || 5,
        supplier: it?.supplier ? sanitize(it.supplier).slice(0, 80) : '',
        notes: it?.notes ? sanitize(it.notes).slice(0, 120) : '',
      };
    }).filter((x) => x.name);

    const csv = items.map((i) =>
      [i.name, i.category, i.unit, i.quantity, i.unit_cost, i.low_alert, i.supplier, i.notes].join(', ')
    ).join('\n');

    return new Response(JSON.stringify({ items, csv, count: items.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
