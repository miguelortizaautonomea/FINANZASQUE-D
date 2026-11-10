import { NextResponse, NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface AnalyzedInvoice {
  invoiceNumber: string | null;
  company: string | null;
  description: string | null;
  amount: number | null;
  amountWithoutVAT: number | null;
  vat: number | null;
  ivaPercent: number;
}

function humanError(message: string, detail?: string, status = 400) {
  return NextResponse.json(
    { success: false, error: message, ...(detail ? { detail } : {}) },
    { status }
  );
}

async function analyzeWithClaude(file: File): Promise<AnalyzedInvoice> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Falta la variable ANTHROPIC_API_KEY en Vercel. Añádela en Project Settings → Environment Variables y vuelve a desplegar.'
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const mediaType = file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg';
  const b64 = buf.toString('base64');

  const prompt = `Eres un extractor de datos de FACTURAS/TICKETS en español. Mira la imagen y devuelve SOLO un JSON válido con estas claves (sin markdown, sin explicación):

{
  "invoiceNumber": "numero de factura o ticket (solo digitos, sin ceros a la izquierda; null si no se ve)",
  "company": "nombre de la EMPRESA que emite la factura (no el cliente, nunca 'Miguel Angel Ortiz'); si es cadena conocida usa el nombre comun: Mercadona, Amazon, Apple, Google Workspace, Verificado Meta, GoHighLevel, Stripe, ChatGPT, Claude, Railway, Smartlead, MailerLite, Telepizza, Repsol, etc.",
  "description": "concepto o descripcion corta de lo comprado; null si no se ve",
  "amount": "IMPORTE TOTAL pagado en EUR como numero (ej: 15.99); null si no se ve",
  "amountWithoutVAT": "base imponible antes de IVA como numero; null si no se ve",
  "vat": "cantidad de IVA en EUR como numero; null si no se ve",
  "ivaPercent": "porcentaje de IVA: 21, 10, 4 o 0"
}

Reglas:
- Devuelve SOLO el JSON, nada mas.
- Numeros como numeros, no strings.
- Si falta un dato, usa null (no inventes).
- El IVA puede estar implicito; si solo se ve el total, pon ivaPercent=21 y calcula base/vat.
- El importe siempre en EUR; si la factura esta en USD convierte dividiendo por 1.15.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-5-5',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Claude API ${res.status}: ${txt.substring(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.content?.[0]?.text || '';
  let jsonStr = content.trim();
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) jsonStr = fence[1].trim();
  const braceStart = jsonStr.indexOf('{');
  const braceEnd = jsonStr.lastIndexOf('}');
  if (braceStart >= 0 && braceEnd > braceStart) jsonStr = jsonStr.substring(braceStart, braceEnd + 1);

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Claude devolvio una respuesta no-JSON: ${content.substring(0, 200)}`);
  }

  const toNum = (v: any): number | null => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number' && isFinite(v)) return v;
    const n = parseFloat(String(v).replace(/[^\d\.,\-]/g, '').replace(',', '.'));
    return isFinite(n) ? n : null;
  };

  const total = toNum(parsed.amount);
  let base = toNum(parsed.amountWithoutVAT);
  let vat = toNum(parsed.vat);
  let ivaPercent = Number(parsed.ivaPercent);
  if (!isFinite(ivaPercent) || ivaPercent < 0 || ivaPercent > 25) ivaPercent = 0;

  if (total !== null) {
    if (ivaPercent > 0 && base === null) base = total / (1 + ivaPercent / 100);
    if (ivaPercent > 0 && vat === null && base !== null) vat = total - base;
    if (ivaPercent === 0 && base === null) base = total;
  }

  const num = (v: any): string | null => {
    if (v === null || v === undefined) return null;
    const s = String(v).replace(/^0+/, '');
    return s || null;
  };

  return {
    invoiceNumber: num(parsed.invoiceNumber),
    company: parsed.company ? String(parsed.company).substring(0, 80) : null,
    description: parsed.description ? String(parsed.description).substring(0, 200) : null,
    amount: total,
    amountWithoutVAT: base,
    vat,
    ivaPercent,
  };
}

export async function POST(req: NextRequest) {
  let file: File | null = null;
  try {
    const formData = await req.formData();
    file = formData.get('file') as File | null;
  } catch (e: any) {
    return humanError('No se pudo leer la foto que enviaste', e?.message, 400);
  }

  if (!file) return humanError('No se subió ninguna foto', undefined, 400);
  if (!file.type.startsWith('image/')) {
    return humanError(`El archivo no parece una imagen (tipo: ${file.type || 'desconocido'})`, undefined, 400);
  }
  if (file.size > 10 * 1024 * 1024) {
    return humanError('La foto pesa mas de 10 MB. Reducela y vuelve a probar.', undefined, 413);
  }

  try {
    const analyzed = await analyzeWithClaude(file);
    return NextResponse.json({ success: true, data: analyzed });
  } catch (error: any) {
    console.error('[analyze-image] error:', error);
    return humanError(
      error?.message || 'Error analizando la imagen',
      undefined,
      500
    );
  }
}
