import { NextResponse, NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';

interface AnalyzedData {
  invoiceNumber: string | null;
  company: string | null;
  description: string | null;
  amount: number | null;
  amountWithoutVAT: number | null;
  vat: number | null;
  ivaPercent: number;
}

// Reutilizamos la l√≥gica de extracci√≥n del endpoint analyze-pdf
function extractInvoiceNumber(text: string): string | null {
  const safeText = text || '';
  const patterns = [
    /(?:factura|invoice)[\s\/]*(?:n[¬∫¬∞¬∫o]\.?|num(?:ero)?|nr\.?|#)\s*:?\s*([A-Z]*-?)?(\d+)/i,
    /(?:n[¬∫¬∞¬∫o]\.?|num(?:ero)?|nr\.?)\s*(?:factura|invoice)?\s*:?\s*([A-Z]*-?)?(\d+)/i,
    /(?:factura|invoice)\s*:\s*([A-Z]*-?)?(\d+)/i,
    /n[¬∫¬∞¬∫o]\s*:?\s*([A-Z]*-?)?(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = safeText.match(pattern);
    if (match && match[2] && typeof match[2] === 'string') {
      const num = match[2].replace(/^0+/, '');
      return num || '0';
    }
  }
  return null;
}

// Diccionario de empresas conocidas (SaaS, servicios comunes)
// Si se encuentra el keyword en el sender, filename o texto ‚Üí devuelve el nombre amigable
const KNOWN_COMPANIES: Record<string, string> = {
  'anthropic': 'Claude',
  'claude.ai': 'Claude',
  'openai': 'ChatGPT',
  'chatgpt': 'ChatGPT',
  'stripe': 'Stripe',
  'gohighlevel': 'GoHighLevel',
  'highlevel': 'GoHighLevel',
  'msgsndr': 'GoHighLevel',
  'ghl': 'GoHighLevel',
  'smartlead': 'Smartlead',
  'mailerlite': 'MailerLite',
  'slack': 'Slack',
  'zapmail': 'Zapmail',
  'zapier': 'Zapier',
  'twilio': 'Twilio',
  'loom': 'Loom',
  'n8n': 'N8N',
  'google workspace': 'Google Workspace',
  'workspace': 'Google Workspace',
  'apple.com': 'Apple',
  'itunes': 'Apple',
  'verificado meta': 'Verificado Meta',
  'meta platforms': 'Verificado Meta',
  'github': 'GitHub',
  'vercel': 'Vercel',
  'supabase': 'Supabase',
  'railway': 'Railway',
  'notion': 'Notion',
  'figma': 'Figma',
  'canva': 'Canva',
  'circle.so': 'Circle Club',
  'circle club': 'Circle Club',
  'theplaze': 'The Plaze',
  'plaze llc': 'The Plaze',
  'retell': 'Retell AI',
  'replicate': 'Replicate',
  'cloudflare': 'Cloudflare',
  'aws.amazon': 'AWS',
  'digitalocean': 'DigitalOcean',
  'render.com': 'Render',
  'fly.io': 'Fly.io',
  'millionverifier': 'MillionVerifier',
  'mailgun': 'Mailgun',
  'sendgrid': 'SendGrid',
  'postmark': 'Postmark',
  'calendly': 'Calendly',
  'typeform': 'Typeform',
  'airtable': 'Airtable',
  'monday.com': 'Monday',
  'asana': 'Asana',
  'trello': 'Trello',
  'linear.app': 'Linear',
  'cursor.sh': 'Cursor',
  'cursor.com': 'Cursor',
  'midjourney': 'Midjourney',
  'elevenlabs': 'ElevenLabs',
  'descript': 'Descript',
  'capcut': 'CapCut',
  'adobe': 'Adobe',
};

/**
 * Detecta empresas conocidas buscando en el sender (email), filename y texto del PDF.
 * Esto soluciona casos donde el PDF dice "Anthropic, PBC" pero queremos "Claude".
 */
function detectKnownCompany(text: string, sender: string, filename: string): string | null {
  const searchSpace = `${sender || ''} ${filename || ''} ${(text || '').substring(0, 2000)}`.toLowerCase();
  for (const [keyword, displayName] of Object.entries(KNOWN_COMPANIES)) {
    if (searchSpace.includes(keyword.toLowerCase())) {
      return displayName;
    }
  }
  return null;
}

/**
 * Extrae el nombre legible del remitente del email.
 * "Anthropic <billing@anthropic.com>" ‚Üí "Anthropic"
 * "billing@stripe.com" ‚Üí "Stripe"
 */
function extractSenderName(sender: string): string | null {
  if (!sender) return null;
  // Caso 1: "Nombre Bonito <email@dominio.com>"
  const namedMatch = sender.match(/^"?([^"<]+?)"?\s*<[^>]+>/);
  if (namedMatch && namedMatch[1]) {
    const name = namedMatch[1].trim();
    if (name.length >= 2 && !/^[\d\s.,@\-]+$/.test(name)) {
      return name.substring(0, 50);
    }
  }
  // Caso 2: solo email "billing@stripe.com" ‚Üí "Stripe"
  const emailMatch = sender.match(/@([a-z0-9\-]+)\.[a-z]+/i);
  if (emailMatch && emailMatch[1]) {
    const domain = emailMatch[1];
    // Capitalizar primera letra
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  }
  return null;
}

function extractCompany(text: string, filename: string): string {
  const safeFilename = filename || 'email.pdf';
  const safeText = text || '';
  const lines = safeText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const companyPatterns = [
    /^([A-Z][A-Za-z0-9&\s,\.\-]{2,80}(?:\s+S\.?L\.?(?:U\.?)?|\s+S\.?A\.?|\s+SL|\s+SA|\s+SLU|\s+INC\.?|\s+LLC\.?|\s+LTD\.?|\s+GmbH|\s+B\.?V\.?))/,
  ];

  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const line = lines[i];
    if (/^[\d\s.,‚Ç¨%/\-+]+$/.test(line)) continue;
    if (line.length < 4 || line.length > 100) continue;

    for (const pattern of companyPatterns) {
      const match = line.match(pattern);
      if (match && match[1]) return match[1].trim();
    }
  }

  // Fallback: primera l√≠nea v√°lida
  for (const line of lines.slice(0, 5)) {
    if (line.length >= 4 && line.length <= 100 && !/^[\d\s.,‚Ç¨%/\-+]+$/.test(line) &&
        !/^(factura|invoice|fecha|date)/i.test(line)) {
      return line;
    }
  }

  return safeFilename.replace(/\.pdf$/i, '').substring(0, 60) || 'Factura email';
}

// Limpia un string para usarlo como filename (seguro ante null/undefined)
function safeCleanCompany(value: string | undefined | null): string {
  if (!value || typeof value !== 'string') return 'Empresa';
  return value.replace(/[^a-zA-Z0-9\s\-]/g, '').trim().substring(0, 50) || 'Empresa';
}

function extractDescription(text: string): string | null {
  const safeText = text || '';
  const m = safeText.match(/(?:concepto|descripci[o√≥]n|detalle|description|services?)[:\s]+([^\n\r]{5,200})/i);
  if (m && m[1] && typeof m[1] === 'string') {
    let desc = m[1].trim().replace(/\s+/g, ' ');
    desc = desc.split(/\s+(?:total|importe|base|iva|subtotal|precio|qty|cantidad|unidades)/i)[0];
    if (desc.length > 150) desc = desc.substring(0, 147) + '...';
    if (desc.length >= 5) return desc.trim();
  }
  return null;
}

// Detecci√≥n de moneda y tasa de cambio a EUR
function detectCurrency(text: string): { currency: 'EUR' | 'USD' | 'GBP' | 'AED'; rateToEUR: number } {
  const upperText = text.toUpperCase();

  // Indicadores claros de moneda (palabras expl√≠citas tienen prioridad)
  const usdHints = /\bUSD\b|\$\s*\d|US\s*\$|U\.S\.\s*Dollar|Dollar/i.test(text);
  const eurHints = /\bEUR\b|‚Ç¨\s*\d|\d\s*‚Ç¨|Euro/i.test(text);
  const gbpHints = /\bGBP\b|¬£\s*\d|Pound/i.test(text);
  const aedHints = /\bAED\b|Dirham|UAE/i.test(text);

  // Prioridad: AED > GBP > USD > EUR (orden de menor a mayor probabilidad)
  if (aedHints) return { currency: 'AED', rateToEUR: 0.25 };  // 1 AED ‚âà 0.25 EUR
  if (gbpHints && !eurHints) return { currency: 'GBP', rateToEUR: 1.17 }; // 1 GBP ‚âà 1.17 EUR
  if (usdHints && !eurHints) return { currency: 'USD', rateToEUR: 1 / 1.15 }; // 1 USD ‚âà 0.87 EUR
  return { currency: 'EUR', rateToEUR: 1 }; // Default
}

function extractAmount(text: string): {
  total: number | null;
  base: number | null;
  vat: number | null;
  ivaPercent: number;
  originalCurrency: 'EUR' | 'USD' | 'GBP' | 'AED';
  originalAmount: number | null;
} {
  let total: number | null = null;
  let base: number | null = null;
  let vat: number | null = null;

  // Detectar moneda
  const { currency, rateToEUR } = detectCurrency(text);

  const totalPatterns = [
    /total\s*(?:factura|a\s*pagar|importe|due|charged|paid)?\s*[:\s]*[‚Ç¨$¬£]?\s*([\d.,]+)\s*[‚Ç¨$¬£]?/gi,
    /TOTAL[:\s]+[‚Ç¨$¬£]?\s*([\d.,]+)\s*[‚Ç¨$¬£]?/gi,
    /AED\s*([\d.,]+)/gi,
    /grand\s*total[:\s]+[‚Ç¨$¬£]?\s*([\d.,]+)/gi,
  ];

  let maxFound = 0;
  for (const pattern of totalPatterns) {
    const matches = Array.from(text.matchAll(pattern));
    for (const m of matches) {
      if (!m || !m[1]) continue;
      const amount = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(amount) && amount > 0 && amount < 100000 && amount > maxFound) {
        maxFound = amount;
      }
    }
  }
  if (maxFound > 0) total = maxFound;

  // Guardar el monto original antes de convertir
  const originalAmount = total;

  // Convertir a EUR si no es EUR
  if (total !== null && currency !== 'EUR') {
    total = total * rateToEUR;
  }

  const basePatterns = [/base\s*imponible[:\s]*‚Ç¨?\s*([\d.,]+)/gi, /subtotal[:\s]*‚Ç¨?\s*([\d.,]+)/gi];
  for (const p of basePatterns) {
    const m = text.match(p);
    if (m && m[1]) {
      const a = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(a) && a > 0) {
        base = currency !== 'EUR' ? a * rateToEUR : a;
        break;
      }
    }
  }

  const has21 = /(?:iva|vat).*21\s*%|21\s*%.*(?:iva|vat)/i.test(text);
  let ivaPercent = 0;
  if (has21 || (total !== null && base !== null && Math.abs((total - base) - base * 0.21) < 1)) {
    ivaPercent = 21;
    if (total !== null && base === null) { base = total / 1.21; vat = total - base; }
    if (total !== null && base !== null && vat === null) vat = total - base;
  } else {
    ivaPercent = 0;
    if (total !== null) { base = total; vat = 0; }
  }

  return { total, base, vat, ivaPercent, originalCurrency: currency, originalAmount };
}

function extractDate(text: string): string {
  const safeText = text || '';
  const patterns = [
    /fecha[:\s]+(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/i,
    /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/,
  ];
  for (const p of patterns) {
    const m = safeText.match(p);
    if (m && m[1] && m[2] && m[3]) {
      const day = m[1].padStart(2, '0');
      const month = m[2].padStart(2, '0');
      const year = m[3];
      if (parseInt(year) >= 2024 && parseInt(year) <= 2027) return `${year}-${month}-${day}`;
    }
  }
  // Default: hoy
  return new Date().toISOString().split('T')[0];
}

// Auto-genera n√∫mero para facturas de GASTO con formato "N-Mes"
// Consulta Supabase para encontrar el siguiente n√∫mero correlativo del mes
async function getNextExpenseNumber(dateString: string): Promise<string> {
  const dateObj = new Date(dateString);
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1;
  const monthMap: Record<number, string> = {
    1: 'Ene', 2: 'Feb', 3: 'Mar', 4: 'Abr',
    5: 'May', 6: 'Jun', 7: 'Jul', 8: 'Ago',
    9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dic'
  };
  const monthShort = monthMap[month];
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  try {
    const { data } = await supabase
      .from('invoices')
      .select('number')
      .eq('type', 'expense')
      .eq('has_invoice', true)
      .gte('date', startDate)
      .lte('date', endDate);

    let maxNum = 0;
    for (const inv of (data || [])) {
      const match = inv.number?.match(/^(\d+)-/);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNum) maxNum = num;
      }
    }
    return `${maxNum + 1}-${monthShort}`;
  } catch (e) {
    console.error('Error getting next expense number:', e);
    return `${Date.now() % 1000}-${monthShort}`;
  }
}

// Mapear de frontend a DB
// Solo incluimos pdf_url si tiene valor (para tolerar BBDDs sin esta columna a√∫n)
function mapToDB(invoice: any) {
  const base: any = {
    id: invoice.id,
    type: invoice.type,
    category: invoice.category,
    number: invoice.number,
    company: invoice.company,
    description: invoice.description || null,
    amount: invoice.amount,
    amount_without_vat: invoice.amountWithoutVAT,
    vat: invoice.vat,
    date: invoice.date,
    file_name: invoice.fileName,
    method: invoice.method,
    has_invoice: invoice.hasInvoice || false,
    paid: invoice.paid || false,
  };
  if (invoice.pdfUrl) base.pdf_url = invoice.pdfUrl;
  return base;
}

/**
 * POST /api/invoices/from-email
 *
 * Endpoint TODO-EN-UNO para n8n:
 * 1. Recibe un PDF (multipart/form-data field: 'file')
 * 2. Analiza el PDF para extraer datos
 * 3. Crea autom√°ticamente la factura en Supabase
 *
 * Body (multipart/form-data):
 * - file: el PDF de la factura
 * - type: 'income' | 'expense' (opcional, default: 'expense')
 * - subject: asunto del email (opcional, para descripci√≥n)
 * - sender: remitente del email (opcional, para empresa)
 *
 * Respuesta: { success: true, invoice: {...}, analyzed: {...} }
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const type = (formData.get('type') as string || 'expense') as 'income' | 'expense';
    const subject = formData.get('subject') as string || '';
    const sender = formData.get('sender') as string || '';

    if (!file) {
      return NextResponse.json({ error: 'No se subi√≥ ning√∫n archivo PDF' }, { status: 400 });
    }

    // Extraer texto del PDF
    const buffer = Buffer.from(await file.arrayBuffer());
    const pdfParse: any = require('pdf-parse/lib/pdf-parse.js');
    const pdfData = await pdfParse(buffer);
    const text = pdfData.text;

    if (!text || text.length < 10) {
      return NextResponse.json({
        error: 'PDF sin texto extra√≠ble (puede ser escaneado)',
        success: false
      }, { status: 400 });
    }

    // Analizar
    const invoiceNumber = extractInvoiceNumber(text);
    const filename = file.name || 'email.pdf';

    // üéØ DETECCI√ìN INTELIGENTE DE EMPRESA - 4 estrategias por orden de prioridad:
    // 1) Empresas conocidas (Anthropic ‚Üí Claude, OpenAI ‚Üí ChatGPT, etc.)
    // 2) Nombre del remitente del email ("Anthropic <billing@...>" ‚Üí "Anthropic")
    // 3) Extracci√≥n del texto del PDF (patrones S.L., S.A., etc.)
    // 4) Fallback al nombre del archivo
    let company: string =
      detectKnownCompany(text, sender, filename) ||
      extractSenderName(sender) ||
      extractCompany(text, filename) ||
      'Empresa desconocida';

    // GUARANT√çA FINAL: company SIEMPRE debe ser un string v√°lido
    if (!company || typeof company !== 'string') company = 'Empresa desconocida';

    let description = extractDescription(text) || subject || null;
    const { total, base, vat, ivaPercent, originalCurrency, originalAmount } = extractAmount(text);
    const date = extractDate(text);

    if (!total) {
      return NextResponse.json({
        error: 'No se pudo extraer el importe de la factura',
        success: false,
        analyzed: { invoiceNumber, company, description, text: text.substring(0, 300) }
      }, { status: 400 });
    }

    // Si hubo conversi√≥n de moneda, a√±adir nota a la descripci√≥n
    if (originalCurrency !== 'EUR' && originalAmount !== null) {
      const conversionNote = `[Original: ${originalAmount.toFixed(2)} ${originalCurrency} ‚Üí ${total.toFixed(2)} EUR]`;
      description = description ? `${description} ${conversionNote}` : conversionNote;
    }

    // üõ°Ô∏è DEDUPLICACI√ìN: evita crear la misma factura varias veces cuando n8n
    // reintenta el webhook o el email llega repetido. Buscamos una factura
    // creada en las √∫ltimas 24h con misma empresa + fecha + importe (¬±1 c√©ntimo).
    const dedupeSince = new Date();
    dedupeSince.setHours(dedupeSince.getHours() - 24);
    const { data: existingDup } = await supabase
      .from('invoices')
      .select('id, number, company, amount, date, created_at')
      .eq('type', type)
      .eq('company', company)
      .eq('date', date)
      .gte('amount', total - 0.02)
      .lte('amount', total + 0.02)
      .gte('created_at', dedupeSince.toISOString())
      .limit(1);

    if (existingDup && existingDup.length > 0) {
      const dup = existingDup[0];
      console.log(`[from-email] Duplicate detected: ${company} ${total}‚Ç¨ ${date} -> skipping (existing id=${dup.id})`);
      return NextResponse.json({
        success: true,
        duplicate: true,
        invoice: dup,
        message: `‚ö†Ô∏è Duplicado detectado: ${company} ${total.toFixed(2)}‚Ç¨ del ${date} ya existe (id: ${dup.id}). No se cre√≥ nada nuevo ni se subi√≥ a Drive.`,
        driveUpload: 'skipped-duplicate'
      });
    }

    // ü§ñ AUTO-NUMERACI√ìN: para gastos generamos n√∫mero correlativo del mes (ej: "1-Jun")
    // Para ingresos mantenemos el n√∫mero extra√≠do del PDF (es el n¬∫ de factura emitida)
    let finalNumber: string;
    if (type === 'expense') {
      finalNumber = await getNextExpenseNumber(date);
    } else {
      finalNumber = invoiceNumber || `EMAIL-${Date.now()}`;
    }

    // Crear el invoice
    const newInvoice = {
      id: `email_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      type,
      category: 'work',
      number: finalNumber,
      company,
      description,
      amount: total,
      amountWithoutVAT: base || total,
      vat: vat || 0,
      date,
      fileName: filename,
      method: 'Tarjeta',
      hasInvoice: true,
      paid: type === 'expense', // Gastos vienen ya pagados, ingresos vienen pendientes
    };

    // üì§ SIEMPRE: Subir PDF a Supabase Storage
    let pdfUrl: string | null = null;
    try {
      const monthMap: Record<string, string> = {
        '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
        '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
        '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic'
      };
      const dateStr = date || new Date().toISOString().split('T')[0];
      const monthShort = monthMap[dateStr.slice(5, 7)] || 'Sin';
      const cleanCompany = safeCleanCompany(company);
      // Formato: "Mes-N√∫mero-Empresa-timestamp.pdf"
      const storageFileName = `${monthShort}-${invoiceNumber || 'X'}-${cleanCompany}-${Date.now()}.pdf`;
      const storagePath = `invoices/${storageFileName}`;

      const { error: uploadError } = await supabase.storage
        .from('invoice-pdfs')
        .upload(storagePath, buffer, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('invoice-pdfs').getPublicUrl(storagePath);
        pdfUrl = urlData.publicUrl;
      } else {
        console.error('Storage upload error:', uploadError);
      }
    } catch (storageErr) {
      console.error('Error uploading to storage:', storageErr);
    }

    // A√±adir pdfUrl al invoice antes de guardar en DB
    (newInvoice as any).pdfUrl = pdfUrl;

    // Guardar en Supabase
    const { data, error } = await supabase
      .from('invoices')
      .insert([mapToDB(newInvoice)])
      .select()
      .single();

    if (error) {
      return NextResponse.json({
        error: error.message,
        success: false,
        analyzed: newInvoice
      }, { status: 500 });
    }

    const conversionMsg = originalCurrency !== 'EUR'
      ? ` (convertido de ${originalAmount?.toFixed(2)} ${originalCurrency})`
      : '';

    // üöÄ Subir PDF a Google Drive v√≠a webhook de n8n (fire-and-forget)
    const driveWebhook = process.env.DRIVE_WEBHOOK_EXPENSES;
    if (driveWebhook) {
      try {
        const cleanCompany = safeCleanCompany(company);
        // finalNumber viene en formato "N-Mes" (ej: "1-Jun")
        // Invertimos a "Mes-N-Empresa.pdf" ‚Üí "Jun-1-Stripe.pdf"
        const numMatch = finalNumber?.match(/^(\d+)-(\w+)$/);
        const flippedNumber = numMatch ? `${numMatch[2]}-${numMatch[1]}` : finalNumber;
        const driveFileName = `${flippedNumber}-${cleanCompany}.pdf`;

        const driveFormData = new FormData();
        const pdfBlob = new Blob([buffer], { type: 'application/pdf' });
        driveFormData.append('file', pdfBlob, driveFileName);
        driveFormData.append('fileName', driveFileName);
        driveFormData.append('company', company);
        driveFormData.append('amount', total.toFixed(2));

        // Fire-and-forget (no esperamos respuesta)
        fetch(driveWebhook, {
          method: 'POST',
          body: driveFormData,
        }).catch(err => console.error('Drive upload error:', err));
      } catch (driveErr) {
        console.error('Error preparing Drive upload:', driveErr);
      }
    }

    // Nombre del archivo listo para usar en n8n al subir a Drive
    // Formato: "1-Jun-Claude.pdf" (numero-mes-empresa)
    // Nombre amigable para Drive en formato "Mes-N-Empresa.pdf"
    const dispMatch = finalNumber?.match(/^(\d+)-(\w+)$/);
    const dispFlipped = dispMatch ? `${dispMatch[2]}-${dispMatch[1]}` : finalNumber;
    const driveDisplayFileName = `${dispFlipped}-${safeCleanCompany(company)}.pdf`;

    return NextResponse.json({
      success: true,
      invoice: newInvoice,
      driveFileName: driveDisplayFileName, // üëà Para usar en n8n: {{ $json.driveFileName }}
      currency: { original: originalCurrency, converted: 'EUR', originalAmount, finalAmount: total },
      message: `‚úÖ Factura "${company}" a√±adida: ${total.toFixed(2)}‚Ç¨${conversionMsg}`,
      driveUpload: driveWebhook ? 'queued' : 'disabled'
    });
  } catch (error: any) {
    console.error('Error procesando email PDF:', error);
    return NextResponse.json({
      error: error.message || 'Error procesando el PDF',
      success: false
    }, { status: 500 });
  }
}
