import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/jwt';
import OpenAI from 'openai';

interface ExtractedItem {
  name: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
}

interface ReceiptData {
  storeName: string | null;
  date: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  items: ExtractedItem[];
}

export async function POST(request: NextRequest) {
  // Admin authentication
  const auth = requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json({
      error: 'OpenAI API key not configured',
      hint: 'Add OPENAI_API_KEY to your environment variables'
    }, { status: 500 });
  }

  let body: { imageUrl: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { imageUrl } = body;
  if (!imageUrl) {
    return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 });
  }

  try {
    const openai = new OpenAI({ apiKey: openaiKey });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a receipt parser. Extract all items, quantities, and prices from the receipt image.

Return ONLY valid JSON in this exact format:
{
  "storeName": "Store Name or null",
  "date": "YYYY-MM-DD or null",
  "subtotal": 0.00,
  "tax": 0.00,
  "total": 0.00,
  "items": [
    {
      "name": "Product Name",
      "quantity": 1,
      "unitPrice": 2.99,
      "totalPrice": 2.99
    }
  ]
}

Rules:
- Extract ALL line items you can see
- If quantity is not specified, assume 1
- unitPrice is the price per item
- totalPrice is quantity × unitPrice
- If you can only see total price, set unitPrice to null
- Clean up product names (remove extra codes/numbers)
- Return null for fields you cannot determine
- Do NOT include any text outside the JSON`
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: 'high'
              }
            },
            {
              type: 'text',
              text: 'Extract all items and prices from this receipt. Return only JSON.'
            }
          ]
        }
      ],
      max_tokens: 2000,
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 });
    }

    // Parse the JSON response
    let receiptData: ReceiptData;
    try {
      // Clean up the response - remove markdown code blocks if present
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }
      jsonStr = jsonStr.trim();

      receiptData = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      return NextResponse.json({
        error: 'Failed to parse receipt data',
        raw: content
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: receiptData
    });

  } catch (error) {
    console.error('Receipt OCR error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'OCR failed'
    }, { status: 500 });
  }
}
