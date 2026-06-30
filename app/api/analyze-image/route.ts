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

// Mi nombre y datos personales (para filtrar y NO confundirlo con el vendedor)
const MY_NAME_REGEX = /miguel\s*[áa]ngel?\s*ortiz|miguel\.?ortiz|49549728T/i;

function extractCompany(text: string): string | null {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // 1) Empresas conocidas (incluido "amazon" via dominio amzn)
  const KNOWN: [string, string][] = [
    ['mercadona', 'Mercadona'], ['carrefour', 'Carrefour'], ['lidl', 'Lidl'],
    ['aldi', 'Aldi'], ['eroski', 'Eroski'], ['consum', 'Consum'],
    ['amazon', 'Amazon'], ['amzn', 'Amazon'], ['el corte ingles', 'El Corte Inglés'],
    ['media markt', 'Media Markt'], ['decathlon', 'Decathlon'],
    ['leroy merlin', 'Leroy Merlin'], ['ikea', 'IKEA'],
    ['apple.com', 'Apple'], ['itunes', 'Apple'], ['app store', 'Apple'],
    ['google workspace', 'Google Workspace'], ['workspace', 'Google Workspace'],
    ['meta platforms', 'Verificado Meta'], ['verificado meta', 'Verificado Meta'],
    ['netflix', 'Netflix'], ['spotify', 'Spotify'],
    ['gohighlevel', 'GoHighLevel'], ['highlevel', 'GoHighLevel'], ['msgsndr', 'GoHighLevel'],
    ['stripe.com', 'Stripe'], ['stripe', 'Stripe'],
    ['openai', 'ChatGPT'], ['chatgpt', 'ChatGPT'],
    ['claude.ai', 'Claude'], ['anthropic', 'Claude'],
    ['railway.com', 'Railway'], ['railway corp', 'Railway'],
    ['smartlead', 'Smartlead'], ['slack', 'Slack'],
    ['zapmail', 'Zapmail'], ['twilio', 'Twilio'],
    ['mailerlite', 'MailerLite'], ['retell', 'Retell AI'],
    ['circle.so', 'Circle Club'], ['circle club', 'Circle Club'],
    ['wernells', 'Wernells Center'],
    ['serendipia', 'Serendipia LLC'], ['theplaze', 'The Plaze'],
    ['repsol', 'Repsol'], ['cepsa', 'Cepsa'], ['shell', 'Shell'],
    ['mcdonald', 'McDonalds'], ['burger king', 'Burger King'],
    ['starbucks', 'Starbucks'], ['telepizza', 'Telepizza'],
    ['n8n', 'N8N'],
  ];

  const lowerText = text.toLowerCase();
  for (const [k, display] of KNOWN) {
    if (lowerText.includes(k)) return display;
  }

  // 2) Buscar "Sold by", "Vendido por", "From:", "De:"
  const vendorPatterns = [
    /(?:sold\s*by|vendido\s*por|vendor|vendedor)[:\s]+([A-Z][A-Za-z0-9&\s\.\-]{3,80})/i,
    /(?:from|de|emitida\s*por)[:\s]+([A-Z][A-Za-z0-9&\s\.\-]{3,80}\s+(?:S\.?L\.?|S\.?A\.?|SL|SA|SLU|INC\.?|LLC\.?|LTD\.?|GmbH|B\.?V\.?|S\.?R\.?L\.?))/i,
  ];
  for (const p of vendorPatterns) {
    const m = text.match(p);
    if (m && m[1] && !MY_NAME_REGEX.test(m[1])) {
      let c = m[1].trim().replace(/[\n\r].*$/, '').trim();
      if (c.length >= 3 && c.length <= 80) return c.substring(0, 60);
    }
  }

  // 3) Patrón de razón social (S.L., S.A., LLC...)
  const companyPatterns = [
    /([A-Z][A-Za-z0-9&\s,\.\-]{2,80}(?:\s+S\.?L\.?(?:U\.?)?|\s+S\.?A\.?|\s+SL|\s+SA|\s+SLU|\s+INC\.?|\s+LLC\.?|\s+LTD\.?|\s+GmbH|\s+B\.?V\.?|\s+S\.?R\.?L\.?))/,
  ];
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const line = lines[i];
    if (/^[\d\s.,€%/\-+]+$/.test(line)) continue;
    if (line.length < 3 || line.length > 100) continue;
    if (MY_NAME_REGEX.test(line)) continue; // saltar mi nombre
    for (const p of companyPatterns) {
      const m = line.match(p);
      if (m && m[1]) return m[1].trim();
    }
  }

  // 4) Fallback: primera línea con letras que NO sea mi nombre o etiquetas
  for (const line of lines.slice(0, 8)) {
    if (line.length < 3 || line.length > 80) continue;
    if (!/[A-Za-z]/.test(line)) continue;
    if (MY_NAME_REGEX.test(line)) continue;
    if (/^(factura|invoice|fecha|date|total|ticket|importe|customer|billing|delivery|sold|vendor|recipient|cliente|destinatario|page|paid)/i.test(line)) continue;
    return line.substring(0, 50);
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

// Normaliza un número que puede tener . o , como decimal
function parseMoney(raw: string): number {
  if (!raw) return NaN;
  let s = raw.trim().replace(/\s/g, '');
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    // 1.500,75 (EU) o 1,500.75 (US): el último separador es decimal
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastDot > lastComma) return parseFloat(s.replace(/,/g, ''));
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  }
  // Solo coma o solo punto: tratar como decimal si tiene 1-2 dígitos detrás
  if (hasComma) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length <= 2) return parseFloat(s.replace(',', '.'));
    // Si tiene 3 dígitos detrás, es miles → eliminar
    if (parts.length === 2 && parts[1].length === 3) return parseFloat(s.replace(',', ''));
  }
  return parseFloat(s);
}

function extractAmount(text: string): { total: number | null; base: number | null; vat: number | null; ivaPercent: number } {
  let total: number | null = null;
  let base: number | null = null;
  let vat: number | null = null;

  // === 1) Buscar TOTAL con contexto (prioridad alta) ===
  // Acepta "Total: 15.99 €", "Total payable € 15.99", "Total a pagar 23,50€", etc.
  const totalPatterns = [
    /total\s*(?:payable|pendiente|a\s*pagar|factura|importe|due|charged|paid)?\s*[:\s]*[€$£]?\s*([\d]+[\.,]\d{1,3}|\d+)\s*[€$£]?/gi,
    /TOTAL\s*[:\s]*[€$£]?\s*([\d]+[\.,]\d{1,3}|\d+)\s*[€$£]?/gi,
    /importe\s*(?:total|a\s*pagar)\s*[:\s]*[€$£]?\s*([\d]+[\.,]\d{1,3}|\d+)/gi,
    /grand\s*total\s*[:\s]*[€$£]?\s*([\d]+[\.,]\d{1,3}|\d+)/gi,
  ];

  // === 2) Buscar TODOS los importes con € o $ (también con espacios) ===
  const allAmounts: number[] = [];
  // Detecta: "15.99€", "15.99 €", "€ 15.99", "€15.99", "$15.99", etc.
  const moneyRegex = /[€$£]\s*(\d+[\.,]\d{1,2})|(\d+[\.,]\d{1,2})\s*[€$£]/g;
  let m;
  while ((m = moneyRegex.exec(text)) !== null) {
    const raw = m[1] || m[2];
    if (!raw) continue;
    const num = parseMoney(raw);
    if (!isNaN(num) && num > 0 && num < 100000) allAmounts.push(num);
  }

  // === 3) Match con contexto "Total" ===
  const totalCandidates: number[] = [];
  for (const p of totalPatterns) {
    let mt;
    while ((mt = p.exec(text)) !== null) {
      const num = parseMoney(mt[1]);
      if (!isNaN(num) && num > 0 && num < 100000) totalCandidates.push(num);
    }
  }

  if (totalCandidates.length > 0) {
    // El último candidato suele ser el total final
    total = totalCandidates[totalCandidates.length - 1];
  } else if (allAmounts.length > 0) {
    // Sin contexto: usar el mayor
    total = Math.max(...allAmounts);
  }

  // === 4) IVA detection ===
  const has21 = /21\s*%|iva.*21|vat.*21/i.test(text);
  const has10 = /10\s*%|iva.*10|vat.*10/i.test(text);
  const has4 = /\b4\s*%|iva.*4\b|vat.*4\b/i.test(text);

  let ivaPercent = 0;
  if (has21) ivaPercent = 21;
  else if (has10) ivaPercent = 10;
  else if (has4) ivaPercent = 4;

  // === 5) Buscar base imponible explícita ===
  const baseMatch = text.match(/(?:base\s*imponible|subtotal|importe\s*neto|net\s*amount)\s*[:\s]*[€$£]?\s*([\d]+[\.,]\d{1,3}|\d+)/i);
  if (baseMatch) {
    const b = parseMoney(baseMatch[1]);
    if (!isNaN(b) && b > 0) base = b;
  }

  if (ivaPercent > 0 && total !== null) {
    if (base === null) base = total / (1 + ivaPercent / 100);
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
