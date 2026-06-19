// Parse courier bill PDF and extract sales line items via Lovable AI (Gemini, multimodal)
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { extractText, getDocumentProxy } from 'npm:unpdf@1.2.0';

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

const decodeBase64 = (input: string) => {
  const clean = input.includes(',') ? input.split(',').pop()! : input;
  return Uint8Array.from(atob(clean), (char) => char.charCodeAt(0));
};

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const extractPdfText = async (pdfBase64: string, mimeType?: string) => {
  if (!/pdf/i.test(mimeType ?? 'application/pdf')) return '';
  try {
    const bytes = decodeBase64(pdfBase64);
    const pdf = await getDocumentProxy(bytes);
    const result = await extractText(pdf, { mergePages: true });
    return String(result.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 24000);
  } catch (err) {
    console.warn('PDF text extraction failed, continuing with AI attachment:', err);
    return '';
  }
};

const parseTextFallback = (text: string, inventory: any[] = []): ParsedItem[] => {
  if (!text) return [];
  const normalizedText = normalize(text);
  const matched = inventory.find((item: any) => {
    const candidates = [item.sku, item.name, item.product_name, ...(item.aliases ?? [])].filter(Boolean).map(String);
    return candidates.some((candidate) => {
      const norm = normalize(candidate);
      return norm.length > 2 && normalizedText.includes(norm);
    });
  });

  const sku = matched?.sku || text.match(/(?:sku|seller sku|product code)\s*[:#-]?\s*([A-Z0-9_\-/ ]{3,40})/i)?.[1]?.trim();
  const qtyMatch = text.match(/(?:qty|quantity)\s*[:#-]?\s*(\d+)/i) || text.match(/\b(\d+)\s*x\b/i) || text.match(/\bx\s*(\d+)\b/i);
  const orderMatch = text.match(/(?:order(?:\s*id|\s*no|\s*number)?|awb|sub\s*order)\s*[:#-]?\s*([A-Z0-9_\-/]{5,40})/i);
  const amountMatch = text.match(/(?:total|amount|cod|collect(?:ible)?)\s*(?:amount)?\s*[:₹#-]?\s*(\d+(?:\.\d{1,2})?)/i);
  const courier = ['Delhivery', 'Valmo', 'Shadowfax', 'XpressBees', 'Xpressbees', 'Ecom', 'India Post'].find((name) => new RegExp(name, 'i').test(text));
  const platform = ['Meesho', 'Flipkart', 'Amazon'].find((name) => new RegExp(name, 'i').test(text));

  if (!sku && !matched?.name && !orderMatch) return [];
  return [{
    sku: sku || matched?.sku,
    product_name: matched?.name || matched?.product_name || sku,
    quantity: Math.max(1, parseInt(qtyMatch?.[1] ?? '1', 10)),
    order_number: orderMatch?.[1],
    total_amount: amountMatch ? parseFloat(amountMatch[1]) : undefined,
    payment_method: /\bCOD\b|cash on delivery/i.test(text) ? 'COD' : /prepaid|paid/i.test(text) ? 'Prepaid' : undefined,
    courier_partner: courier === 'Xpressbees' ? 'XpressBees' : courier,
    platform,
  }];
};

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
    const geminiKey = Deno.env.get('GEMINI_API_KEY');

    if (!apiKey && !geminiKey) {
      throw new Error('API Key missing. Please set GEMINI_API_KEY or LOVABLE_API_KEY in your Supabase secrets.');
    }

    const extractedText = await extractPdfText(pdfBase64, mimeType);

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
${JSON.stringify(catalog).slice(0, 4000)}

OCR / extracted PDF text, if available:
${extractedText || 'No embedded PDF text extracted. Use the attached document/image.'}`;

    let items: ParsedItem[] = [];

    // Helper function to call Gemini directly
    const callGemini = async () => {
      if (!geminiKey) throw new Error('GEMINI_API_KEY is not set for fallback.');
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{
            parts: [
              { text: 'Extract every order from this courier bill / shipping label document.' },
              { inline_data: { mime_type: mimeType || 'application/pdf', data: pdfBase64 } }
            ]
          }],
          tools: [{
            function_declarations: [{
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
                        platform: { type: 'string' }
                      },
                      required: ['quantity']
                    }
                  }
                },
                required: ['items']
              }
            }]
          }],
          tool_config: { function_calling_config: { mode: 'ANY', allowed_function_names: ['return_orders'] } }
        })
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Gemini API Error: ${resp.status} ${text.slice(0, 200)}`);
      }

      const data = await resp.json();
      const toolCall = data?.candidates?.[0]?.content?.parts?.[0]?.functionCall;
      const args = toolCall?.args;
      return args?.items ?? [];
    };

    if (apiKey) {
      try {
        // Use Lovable AI Gateway
        const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: systemPrompt },
              {
                role: 'user',
                content: extractedText
                  ? `Extract every order from this courier bill / shipping label text:\n\n${extractedText}`
                  : [
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
          if (resp.status === 429) throw new Error('Rate limit. Please retry shortly.');
          if (resp.status === 402) throw new Error('AI credits exhausted. Add credits in Workspace settings.');
          throw new Error(`AI gateway: ${resp.status} ${text.slice(0, 200)}`);
        }

        const data = await resp.json();
        const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
        const args = toolCall?.function?.arguments ? JSON.parse(toolCall.function.arguments) : { items: [] };
        items = args.items ?? [];
      } catch (err: any) {
        console.warn('Lovable gateway failed, attempting fallback to Gemini:', err.message);
        if (geminiKey) {
          items = await callGemini();
        } else {
          throw err;
        }
      }
    } else {
      // Use Gemini API directly
      items = await callGemini();
    }

    if (!items.length && extractedText) {
      items = parseTextFallback(extractedText, catalog);
    }

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
