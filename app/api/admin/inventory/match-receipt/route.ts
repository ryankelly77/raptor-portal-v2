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
  store_number: string | null;
  store_address: string | null;
  purchase_date: string | null;
  payment_method: string | null;
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
    storeName?: string; // Optional hint, AI will detect from receipt
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { imageUrl, products } = body;

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

    // Build the prompt - now includes store/date extraction
    const prompt = `You are reading a store receipt image. Extract ALL information from the receipt.

PRODUCT CATALOG (items the user has in their inventory system):
${products.length > 0 ? products.map(p => `ID: ${p.id} | Barcode: ${p.barcode} | ${p.brand || 'N/A'} - ${p.name} (${p.category})`).join('\n') : '(No products in catalog yet)'}

Tasks:
1. STORE INFORMATION - Read from the receipt header:
   - Store name (e.g., "Walmart", "Sam's Club", "Costco", "HEB")
   - Store number if visible (e.g., "#1701")
   - Store address if visible
   - Purchase date (look for date/time stamp, return as YYYY-MM-DD)
   - Payment method (DEBIT, CREDIT, CASH, etc.)

2. PRODUCT ITEMS - Read every item line on the receipt:
   - Item name/description as printed
   - Barcode/UPC if visible
   - Price per item
   - Quantity (look for "x2", "QTY 3", or multiple lines)

3. MATCH TO CATALOG - Match receipt items to the product catalog:
   - Receipts use heavy abbreviations:
     * "BRE" = "Black Rifle Energy" or "Black Rifle Coffee Company"
     * "PJT MNGO" = "Project Mango"
     * "RGR BERY" = "Ranger Berry"
     * "FDM PNCH" = "Freedom Punch"
     * "MNSTR" = "Monster Energy"
     * "ALE" or "ALANI" = "Alani Nu"
   - Use barcode numbers to match if they appear on receipt and in catalog
   - Mark items NOT in catalog as is_new_product: true

4. TOTALS - Extract:
   - Subtotal (before tax)
   - Tax amount
   - Total (what was charged)

Respond ONLY with valid JSON, no markdown, no backticks:
{
  "store_name": "Store Name",
  "store_number": "#1234 or null",
  "store_address": "Address or null",
  "purchase_date": "YYYY-MM-DD or null",
  "payment_method": "DEBIT/CREDIT/CASH or null",
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
      "suggested_brand": "Brand name for new products, null if matched",
      "suggested_category": "Category for new products, null if matched",
      "reasoning": "brief explanation of match"
    }
  ],
  "subtotal": 14.96,
  "tax": 0.00,
  "total": 14.96,
  "items_count": 5,
  "notes": "any observations about the receipt"
}

Important:
- Extract ALL product items, not just ones matching the catalog
- price and quantity must be numbers
- For items not in catalog: product_id is null, is_new_product is true
- confidence: "high" = certain match, "medium" = likely, "low" = uncertain
- Ignore tax lines, payment lines, change amounts — only actual product items
- The purchase_date should be extracted from the receipt, format as YYYY-MM-DD`;

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
    store_number: result.store_number || null,
    store_address: result.store_address || null,
    purchase_date: result.purchase_date || null,
    payment_method: result.payment_method || null,
    notes: result.notes || ''
  };

  console.log('[AI Vision] Returning', validatedResult.items.length, 'items, total:', validatedResult.total, 'store:', validatedResult.store_name);

  return NextResponse.json({
    success: true,
    ...validatedResult
  });
}
