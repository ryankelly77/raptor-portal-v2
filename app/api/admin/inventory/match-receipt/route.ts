import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import Anthropic from '@anthropic-ai/sdk';

interface OcrLine {
  description: string;
  price: number;
}

interface Product {
  id: string;
  brand: string | null;
  name: string;
  category: string;
}

interface MatchResult {
  receipt_index: number;
  product_id: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  reasoning: string;
}

export async function POST(request: NextRequest) {
  // JWT verification - same as crud/route.ts
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
    ocrLines: OcrLine[];
    products: Product[];
    storeName: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { ocrLines, products, storeName } = body;

  if (!ocrLines || !Array.isArray(ocrLines) || ocrLines.length === 0) {
    return NextResponse.json({ error: 'ocrLines array is required' }, { status: 400 });
  }

  if (!products || !Array.isArray(products) || products.length === 0) {
    return NextResponse.json({ error: 'products array is required' }, { status: 400 });
  }

  try {
    const anthropic = new Anthropic({
      apiKey: anthropicKey
    });

    // Build the prompt
    const prompt = `You are matching store receipt line items to a product catalog.

Store: ${storeName || 'Unknown'}

RECEIPT LINES:
${ocrLines.map((l, i) => `${i}. "${l.description}" — $${l.price.toFixed(2)}`).join('\n')}

PRODUCT CATALOG:
${products.map(p => `ID: ${p.id} | ${p.brand || 'N/A'} | ${p.name} | ${p.category}`).join('\n')}

For each receipt line, determine which product from the catalog it most likely refers to. Store receipts use heavy abbreviations:
- "BRE" or "BLK RFL" = Black Rifle Coffee/Energy
- "MNSTR" = Monster
- "PJT" or "PROJ" = Project
- "ENRGY" = Energy
- "GV" = Great Value
- "KS" = Kirkland Signature
- Single letters at end (F, T, X) are tax codes, ignore them

Respond ONLY with a valid JSON array, no other text or markdown:
[
  {
    "receipt_index": 0,
    "product_id": "uuid-here-or-null",
    "confidence": "high",
    "reasoning": "brief explanation"
  }
]

Confidence levels:
- "high": Very confident match (brand + product clearly match)
- "medium": Likely match but some ambiguity
- "low": Possible match, needs human review
- "none": Not a product (tax, bags, fees) or no matching product in catalog

If a receipt line doesn't match any product, use "product_id": null.`;

    console.log('[AI Match] Sending request to Claude with', ocrLines.length, 'lines and', products.length, 'products');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });

    // Extract text from response
    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json({ error: 'No text response from AI' }, { status: 500 });
    }

    const text = textContent.text.trim();
    console.log('[AI Match] Raw response:', text.substring(0, 500));

    // Parse the JSON response
    let matches: MatchResult[];
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

      matches = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('[AI Match] Failed to parse response:', text);
      return NextResponse.json({
        error: 'Failed to parse AI response',
        raw: text
      }, { status: 500 });
    }

    // Validate and sanitize matches
    const validatedMatches = matches.map(match => ({
      receipt_index: typeof match.receipt_index === 'number' ? match.receipt_index : -1,
      product_id: match.product_id || null,
      confidence: ['high', 'medium', 'low', 'none'].includes(match.confidence) ? match.confidence : 'none',
      reasoning: match.reasoning || ''
    }));

    console.log('[AI Match] Returning', validatedMatches.length, 'matches');

    return NextResponse.json({
      success: true,
      matches: validatedMatches
    });

  } catch (error) {
    console.error('[AI Match] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'AI matching failed'
    }, { status: 500 });
  }
}
