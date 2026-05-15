// Parse courier bill PDF and extract sales line items via Lovable AI (Gemini, multimodal)
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

interface ParsedItem {
  sku?: string;
  product_name?: string;
  quantity: number;
  order_number?: string;
  total_amount?: number;
  payment_method?: 'Prepaid' | 'COD';
  courier_partner?: string;
  platform?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { pdfBase64, mimeType, inventory } = await req.json();
    if (!pdfBase64) {
      return new Response(JSON.stringify({ error: 'pdfBase64 required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('LOVABLE_API_KEY missing');

    // Build a compact catalog hint so the model can match SKUs/aliases
    const catalog = (inventory ?? []).map((i: any) => ({
      sku: i.sku, name: i.product_name, aliases: i.aliases ?? [],
    }));

    const systemPrompt = `You extract sales line items from courier shipping labels / e-commerce invoices (Meesho, Flipkart, Amazon, Shiprocket, Delhivery, etc.) PDFs.
Return STRICT JSON matching the schema. Do NOT wrap in markdown.

For EACH order on the document, return an item with:
- sku: product SKU if visible (match against catalog SKU or aliases)
- product_name: product title as printed
- quantity: integer parsed from patterns like "1x", "2x", "Qty: 3", "x4", default 1
- order_number: order id / AWB / sub-order id
- total_amount: numeric total (price), no currency symbol
- payment_method: "Prepaid" or "COD" (look for COD, Cash on Delivery, Prepaid)
- courier_partner: e.g. Delhivery, Valmo, Xpressbees, Ecom, Shadowfax, India Post
- platform: Meesho / Flipkart / Amazon / Other

If multiple distinct orders exist, return one entry per order. If a single order has quantity N, return ONE entry with quantity=N (do not duplicate).

Catalog for SKU/alias matching:
${JSON.stringify(catalog).slice(0, 4000)}`;

    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract every order from this courier bill / shipping label document.' },
              { type: 'image_url', image_url: { url: `data:${mimeType ?? 'application/pdf'};base64,${pdfBase64}` } },
            ],
          },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'return_orders',
            description: 'Return parsed orders',
            parameters: {
              type: 'object',
              properties: {
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      sku: { type: 'string' },
                      product_name: { type: 'string' },
                      quantity: { type: 'integer' },
                      order_number: { type: 'string' },
                      total_amount: { type: 'number' },
                      payment_method: { type: 'string', enum: ['Prepaid', 'COD'] },
                      courier_partner: { type: 'string' },
                      platform: { type: 'string' },
                    },
                    required: ['quantity'],
                  },
                },
              },
              required: ['items'],
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'return_orders' } },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      if (resp.status === 429) return new Response(JSON.stringify({ error: 'Rate limit. Please retry shortly.' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (resp.status === 402) return new Response(JSON.stringify({ error: 'AI credits exhausted. Add credits in Workspace settings.' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      throw new Error(`AI gateway: ${resp.status} ${text.slice(0, 200)}`);
    }

    const data = await resp.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall?.function?.arguments ? JSON.parse(toolCall.function.arguments) : { items: [] };
    const items: ParsedItem[] = args.items ?? [];

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('parse-bill error:', err);
    return new Response(JSON.stringify({ error: err.message ?? 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
