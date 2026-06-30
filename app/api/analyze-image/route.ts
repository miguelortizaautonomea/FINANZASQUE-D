import { NextResponse, NextRequest } from 'next/server';

// Endpoint para hacer OCR de una IMAGEN (foto de factura) y extraer los datos
// Usa OCR.space API (gratis con API key "helloworld" para demo)

interface AnalyzedInvoice {
  invoiceNumber: string | null;
  company: string | null;
  description: string | null;
  amount: number | null;
  amountWithoutVAT: number | null;
  vat: number | null;
  ivaPercent: number;
}

// === EXTRACTORS (mismos que analyze-pdf) ===
function extractInvoiceNumber(text: string): string | null {
  const safeText = text || '';
  const patterns = [
    /(?:factura|invoice|ticket|n[º°ºo])[\s\/]*(?:n[º°ºo]\.?|num(?:ero)?|nr\.?|#)\s*:?\s*([A-Z]*-?)?(\d+)/i,
    /(?:n[º°ºo]\.?|num(?:ero)?|nr\.?)\s*(?:factura|invoice)?\s*:?\s*([A-Z]*-?)?(\d+)/i,
    /n[º°ºo]\s*:?\s*([A-Z]*-?)?(\d+)/i,
  ];
  for (const pattern of patterns) {
    const m = safeText.match(pattern);
    if (m && m[2] && typeof m[2] === 'string') {
      const num = m[2].replace(/^0+/, '');
      return num || '0';
    }
  }
  return null;
}

function extractCompany(text: string): string | null {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Conocidas (rápido)
  const KNOWN = ['mercadona', 'carrefour', 'lidl', 'aldi', 'dia', 'eroski', 'consum',
    'amazon', 'el corte ingles', 'media markt', 'decathlon', 'leroy merlin', 'ikea',
    'apple', 'google', 'microsoft', 'meta', 'netflix', 'spotify', 'gohighlevel',
    'highlevel', 'stripe', 'openai', 'chatgpt', 'claude', 'anthropic', 'railway',
    'smartlead', 'slack', 'zapmail', 'twilio', 'verificado meta', 'mailerlite',
    'circle.so', 'circle club', 'wernells', 'retell', 'serendipia',
    'repsol', 'cepsa', 'shell', 'bp', 'galp', 'mcdonald', 'burger king', 'kfc',
    'starbucks', 'dominos', 'telepizza'];

  const lowerText = text.toLowerCase();
  for (const k of KNOWN) {
    if (lowerText.includes(k)) {
      // Devolver con la capitalización original aproximada
      const idx = lowerText.indexOf(k);
      const orig = text.substring(idx, idx + k.length);
      return orig.charAt(0).toUpperCase() + orig.slice(1);
    }
  }

  // Patterns de razón social
  const companyPatterns = [
    /^([A-Z][A-Za-z0-9&\s,\.\-]{2,80}(?:\s+S\.?L\.?(?:U\.?)?|\s+S\.?A\.?|\s+SL|\s+SA|\s+SLU|\s+INC\.?|\s+LLC\.?|\s+LTD\.?))/,
  ];

  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const line = lines[i];
    if (/^[\d\s.,€%/\-+]+$/.test(line)) continue;
    if (line.length < 3 || line.length > 100) continue;
    for (const p of companyPatterns) {
      const m = line.match(p);
      if (m && m[1]) return m[1].trim();
    }
  }

  // Fallback: primera línea con letras
  for (const line of lines.slice(0, 5)) {
    if (line.length >= 3 && line.length <= 80 && /[A-Za-z]/.test(line) &&
        !/^(factura|invoice|fecha|date|total|ticket|importe)/i.test(line)) {
      return line.substring(0, 50);
    }
  }
  return null;
}

function extractDescription(text: string): string | null {
  const m = text.match(/(?:concepto|descripci[oó]n|detalle|description)[:\s]+([^\n\r]{5,200})/i);
  if (m && m[1]) {
    let desc = m[1].trim().replace(/\s+/g, ' ');
    desc = desc.split(/\s+(?:total|importe|base|iva|subtotal|precio)/i)[0];
    if (desc.length > 100) desc = desc.substring(0, 97) + '...';
    if (desc.length >= 5) return desc.trim();
  }
  return null;
}

function extractAmount(text: string): { total: number | null; base: number | null; vat: number | null; ivaPercent: number } {
  let total: number | null = null;
  let base: number | null = null;
  let vat: number | null = null;

  // Buscar TODOS los números con € y quedarse con el mayor (probablemente el total)
  const allAmounts: number[] = [];
  const moneyRegex = /([\d]+[\.,]?\d{0,2})\s*€|€\s*([\d]+[\.,]?\d{0,2})|\$\s*([\d]+[\.,]?\d{0,2})|([\d]+[\.,]\d{2})/g;
  let m;
  while ((m = moneyRegex.exec(text)) !== null) {
    const raw = m[1] || m[2] || m[3] || m[4];
    if (!raw) continue;
    const num = parseFloat(raw.replace(',', '.'));
    if (!isNaN(num) && num > 0 && num < 100000) {
      allAmounts.push(num);
    }
  }

  // Buscar total con contexto
  const totalContextRegex = /total[\s:]*([\d\.,]+)/gi;
  let mt;
  while ((mt = totalContextRegex.exec(text)) !== null) {
    const num = parseFloat(mt[1].replace(',', '.'));
    if (!isNaN(num) && num > 0 && num < 100000) {
      total = num; // último match (suele ser el total final)
    }
  }

  // Si no hay match con "total", coger el mayor de todos
  if (total === null && allAmounts.length > 0) {
    total = Math.max(...allAmounts);
  }

  // IVA detection
  const has21 = /(?:iva|vat).*21\s*%|21\s*%.*(?:iva|vat)/i.test(text);
  const has10 = /(?:iva|vat).*10\s*%|10\s*%.*(?:iva|vat)/i.test(text);
  const has4 = /(?:iva|vat).*4\s*%|4\s*%.*(?:iva|vat)/i.test(text);

  let ivaPercent = 0;
  if (has21) ivaPercent = 21;
  else if (has10) ivaPercent = 10;
  else if (has4) ivaPercent = 4;

  if (ivaPercent > 0 && total !== null) {
    base = total / (1 + ivaPercent / 100);
    vat = total - base;
  } else if (total !== null) {
    base = total;
    vat = 0;
  }

  return { total, base, vat, ivaPercent };
}

// === ENDPOINT POST ===
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'No se subió ningún archivo' }, { status: 400 });

    // Llamar a OCR.space API
    const OCR_API_KEY = process.env.OCR_SPACE_API_KEY || 'helloworld';
    const ocrFormData = new FormData();
    ocrFormData.append('apikey', OCR_API_KEY);
    ocrFormData.append('language', 'spa');
    ocrFormData.append('isOverlayRequired', 'false');
    ocrFormData.append('detectOrientation', 'true');
    ocrFormData.append('scale', 'true');
    ocrFormData.append('OCREngine', '2'); // Engine 2: mejor calidad
    ocrFormData.append('file', file);

    const ocrRes = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: ocrFormData,
    });

    if (!ocrRes.ok) {
      const errText = await ocrRes.text();
      return NextResponse.json({
        error: 'Error en OCR.space: HTTP ' + ocrRes.status,
        detail: errText.substring(0, 200),
        success: false,
      }, { status: 500 });
    }

    const ocrData = await ocrRes.json();
    if (ocrData.IsErroredOnProcessing) {
      return NextResponse.json({
        error: ocrData.ErrorMessage?.[0] || 'OCR processing failed',
        success: false,
      }, { status: 500 });
    }

    const text = ocrData.ParsedResults?.[0]?.ParsedText || '';
    if (!text || text.length < 5) {
      return NextResponse.json({
        error: 'No se detectó texto en la imagen',
        success: false,
      }, { status: 400 });
    }

    // Extraer datos del texto
    const invoiceNumber = extractInvoiceNumber(text);
    const company = extractCompany(text);
    const description = extractDescription(text);
    const { total, base, vat, ivaPercent } = extractAmount(text);

    const analyzed: AnalyzedInvoice = {
      invoiceNumber,
      company,
      description,
      amount: total,
      amountWithoutVAT: base,
      vat,
      ivaPercent,
    };

    return NextResponse.json({
      success: true,
      data: analyzed,
      rawText: text.substring(0, 500),
    });
  } catch (error: any) {
    console.error('Error in /api/analyze-image:', error);
    return NextResponse.json({
      error: error.message || 'Error analizando la imagen',
      success: false,
    }, { status: 500 });
  }
}
