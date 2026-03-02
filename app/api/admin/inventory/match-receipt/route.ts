import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import Anthropic from '@anthropic-ai/sdk';

interface Product {
  id: string;
  brand: string | null;
  name: string;
  barcode: string;
  category: string;
}

interface ParsedItem {
  receipt_text: string;
  parsed_name: string;
  barcode: string | null;
  price: number;
  quantity: number;
  product_id: string | null;
  confidence: 'high' | 'medium' | 'low';
  is_new_product: boolean;
  suggested_brand: string | null;
  suggested_category: string | null;
  reasoning: string;
}

interface AIResponse {
  items: ParsedItem[];
  subtotal: number | null;
  total: number | null;
  tax: number | null;
  items_count: number;
  store_name: string;
  notes: string;
}

export async function POST(request: NextRequest) {
  // JWT verification
  const authHeader = request.headers.get('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'No authorization token' }, { status: 401 });
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  try {
    jwt.verify(token, secret);
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  // Check for Anthropic API key
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({
      error: 'Anthropic API key not configured',
      hint: 'Add ANTHROPIC_API_KEY to your Vercel environment variables'
    }, { status: 500 });
  }

  // Parse request body
  let body: {
    imageUrl: string;
    products: Product[];
    storeName: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { imageUrl, products, storeName } = body;

  if (!imageUrl || typeof imageUrl !== 'string') {
    return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 });
  }

  if (!products || !Array.isArray(products)) {
    return NextResponse.json({ error: 'products array is required' }, { status: 400 });
  }

  try {
    const anthropic = new Anthropic({
      apiKey: anthropicKey
    });

    // Build the prompt
    const prompt = `You are reading a store receipt image. Extract every purchased item with its price.

Store: ${storeName || 'Unknown'}

PRODUCT CATALOG (items the user has in their inventory system):
${products.length > 0 ? products.map(p => `ID: ${p.id} | Barcode: ${p.barcode} | ${p.brand || 'N/A'} - ${p.name} (${p.category})`).join('\n') : '(No products in catalog yet)'}

Tasks:
1. Read every item line on the receipt — item name/description, barcode/UPC if visible, and price
2. Match each item to the product catalog. Receipts use heavy abbreviations:
   - "BRE" = "Black Rifle Energy" or "Black Rifle Coffee Company"
   - "PJT MNGO" = "Project Mango"
   - "RGR BERY" = "Ranger Berry"
   - "FDM PNCH" = "Freedom Punch"
   - "MNSTR" = "Monster Energy"
   - "ALE" or "ALANI" = "Alani Nu"
   - Use barcode numbers to match if they appear on receipt and in catalog
3. Identify items NOT in the catalog as new products (is_new_product: true)
4. Extract subtotal, total, tax amounts
5. For new products, suggest a brand and category

Respond ONLY with valid JSON, no markdown, no backticks:
{
  "items": [
    {
      "receipt_text": "abbreviated text as printed on receipt",
      "parsed_name": "full product name (your best interpretation)",
      "barcode": "UPC if visible, null otherwise",
      "price": 2.37,
      "quantity": 1,
      "product_id": "uuid if matched to catalog, null if not",
      "confidence": "high",
      "is_new_product": false,
      "suggested_brand": null,
      "suggested_category": null,
      "reasoning": "brief explanation"
    }
  ],
  "subtotal": 14.96,
  "total": 14.96,
  "tax": 0.00,
  "items_count": 5,
  "store_name": "${storeName || 'Unknown'}",
  "notes": "any observations about the receipt"
}

Important:
- Extract ALL product items, not just ones matching the catalog
- price and quantity must be numbers
- For items not in catalog: product_id is null, is_new_product is true
- confidence: "high" = certain match, "medium" = likely, "low" = uncertain
- Ignore tax lines, payment lines, change amounts — only actual product items`;

    console.log('[AI Vision] Sending receipt image with', products.length, 'products in catalog');

    // Prepare image content - try URL first, fall back to base64 if needed
    let imageContent: Anthropic.ImageBlockParam;

    // Check if the URL is accessible (Supabase public URLs should work)
    // If it fails, we'll need to fetch and convert to base64
    try {
      // Try using URL directly first
      imageContent = {
        type: 'image',
        source: {
          type: 'url',
          url: imageUrl
        }
      };

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            imageContent,
            {
              type: 'text',
              text: prompt
            }
          ]
        }]
      });

      return processAIResponse(response, products);

    } catch (urlError: unknown) {
      // If URL method fails, try fetching and converting to base64
      console.log('[AI Vision] URL method failed, trying base64:', urlError instanceof Error ? urlError.message : 'Unknown error');

      try {
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
          throw new Error(`Failed to fetch image: ${imageResponse.status}`);
        }

        const imageBuffer = await imageResponse.arrayBuffer();
        const base64Data = Buffer.from(imageBuffer).toString('base64');

        // Determine media type
        const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
        const mediaType = contentType.startsWith('image/') ? contentType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' : 'image/jpeg';

        imageContent = {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: base64Data
          }
        };

        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          messages: [{
            role: 'user',
            content: [
              imageContent,
              {
                type: 'text',
                text: prompt
              }
            ]
          }]
        });

        return processAIResponse(response, products);

      } catch (base64Error) {
        console.error('[AI Vision] Base64 method also failed:', base64Error);
        return NextResponse.json({
          error: 'Failed to process receipt image',
          details: base64Error instanceof Error ? base64Error.message : 'Unknown error'
        }, { status: 500 });
      }
    }

  } catch (error) {
    console.error('[AI Vision] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'AI vision processing failed'
    }, { status: 500 });
  }
}

function processAIResponse(response: Anthropic.Message, products: Product[]): NextResponse {
  // Extract text from response
  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return NextResponse.json({ error: 'No text response from AI' }, { status: 500 });
  }

  const text = textContent.text.trim();
  console.log('[AI Vision] Response length:', text.length);

  // Parse the JSON response
  let result: AIResponse;
  try {
    // Clean up response - remove markdown code blocks if present
    let jsonStr = text;
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    result = JSON.parse(jsonStr);
  } catch (parseError) {
    console.error('[AI Vision] Failed to parse response:', text.substring(0, 500));
    return NextResponse.json({
      error: 'Failed to parse AI response',
      raw: text.substring(0, 1000)
    }, { status: 500 });
  }

  // Post-process: barcode matching override
  if (result.items && Array.isArray(result.items)) {
    for (const item of result.items) {
      if (item.barcode && !item.product_id) {
        // Try to find product by barcode
        const matchedProduct = products.find(p => p.barcode === item.barcode);
        if (matchedProduct) {
          item.product_id = matchedProduct.id;
          item.is_new_product = false;
          item.confidence = 'high';
          item.reasoning = `Barcode match: ${item.barcode}`;
          console.log('[AI Vision] Barcode override:', item.barcode, '->', matchedProduct.name);
        }
      }
    }
  }

  // Validate and sanitize
  const validatedResult: AIResponse = {
    items: (result.items || []).map(item => ({
      receipt_text: item.receipt_text || '',
      parsed_name: item.parsed_name || item.receipt_text || 'Unknown',
      barcode: item.barcode || null,
      price: typeof item.price === 'number' ? item.price : parseFloat(String(item.price)) || 0,
      quantity: typeof item.quantity === 'number' ? item.quantity : parseInt(String(item.quantity)) || 1,
      product_id: item.product_id || null,
      confidence: ['high', 'medium', 'low'].includes(item.confidence) ? item.confidence : 'low',
      is_new_product: item.is_new_product === true,
      suggested_brand: item.suggested_brand || null,
      suggested_category: item.suggested_category || null,
      reasoning: item.reasoning || ''
    })),
    subtotal: typeof result.subtotal === 'number' ? result.subtotal : null,
    total: typeof result.total === 'number' ? result.total : null,
    tax: typeof result.tax === 'number' ? result.tax : null,
    items_count: result.items_count || result.items?.length || 0,
    store_name: result.store_name || 'Unknown',
    notes: result.notes || ''
  };

  console.log('[AI Vision] Returning', validatedResult.items.length, 'items, total:', validatedResult.total);

  return NextResponse.json({
    success: true,
    ...validatedResult
  });
}
