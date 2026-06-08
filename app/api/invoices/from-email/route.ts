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

// Reutilizamos la lógica de extracción del endpoint analyze-pdf
function extractInvoiceNumber(text: string): string | null {
  const patterns = [
    /(?:factura|invoice)[\s\/]*(?:n[º°ºo]\.?|num(?:ero)?|nr\.?|#)\s*:?\s*([A-Z]*-?)?(\d+)/i,
    /(?:n[º°ºo]\.?|num(?:ero)?|nr\.?)\s*(?:factura|invoice)?\s*:?\s*([A-Z]*-?)?(\d+)/i,
    /(?:factura|invoice)\s*:\s*([A-Z]*-?)?(\d+)/i,
    /n[º°ºo]\s*:?\s*([A-Z]*-?)?(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[2]) {
      const num = match[2].replace(/^0+/, '');
      return num || '0';
    }
  }
  return null;
}

function extractCompany(text: string, filename: string): string {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const companyPatterns = [
    /^([A-Z][A-Za-z0-9&\s,\.\-]{2,80}(?:\s+S\.?L\.?(?:U\.?)?|\s+S\.?A\.?|\s+SL|\s+SA|\s+SLU|\s+INC\.?|\s+LLC\.?|\s+LTD\.?|\s+GmbH|\s+B\.?V\.?))/,
  ];

  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const line = lines[i];
    if (/^[\d\s.,€%/\-+]+$/.test(line)) continue;
    if (line.length < 4 || line.length > 100) continue;

    for (const pattern of companyPatterns) {
      const match = line.match(pattern);
      if (match) return match[1].trim();
    }
  }

  // Fallback: primera línea válida
  for (const line of lines.slice(0, 5)) {
    if (line.length >= 4 && line.length <= 100 && !/^[\d\s.,€%/\-+]+$/.test(line) &&
        !/^(factura|invoice|fecha|date)/i.test(line)) {
      return line;
    }
  }

  return filename.replace(/\.pdf$/i, '').substring(0, 60) || 'Factura email';
}

function extractDescription(text: string): string | null {
  const m = text.match(/(?:concepto|descripci[oó]n|detalle|description|services?)[:\s]+([^\n\r]{5,200})/i);
  if (m && m[1]) {
    let desc = m[1].trim().replace(/\s+/g, ' ');
    desc = desc.split(/\s+(?:total|importe|base|iva|subtotal|precio|qty|cantidad|unidades)/i)[0];
    if (desc.length > 150) desc = desc.substring(0, 147) + '...';
    if (desc.length >= 5) return desc.trim();
  }
  return null;
}

// Detección de moneda y tasa de cambio a EUR
function detectCurrency(text: string): { currency: 'EUR' | 'USD' | 'GBP' | 'AED'; rateToEUR: number } {
  const upperText = text.toUpperCase();

  // Indicadores claros de moneda (palabras explícitas tienen prioridad)
  const usdHints = /\bUSD\b|\$\s*\d|US\s*\$|U\.S\.\s*Dollar|Dollar/i.test(text);
  const eurHints = /\bEUR\b|€\s*\d|\d\s*€|Euro/i.test(text);
  const gbpHints = /\bGBP\b|£\s*\d|Pound/i.test(text);
  const aedHints = /\bAED\b|Dirham|UAE/i.test(text);

  // Prioridad: AED > GBP > USD > EUR (orden de menor a mayor probabilidad)
  if (aedHints) return { currency: 'AED', rateToEUR: 0.25 };  // 1 AED ≈ 0.25 EUR
  if (gbpHints && !eurHints) return { currency: 'GBP', rateToEUR: 1.17 }; // 1 GBP ≈ 1.17 EUR
  if (usdHints && !eurHints) return { currency: 'USD', rateToEUR: 1 / 1.15 }; // 1 USD ≈ 0.87 EUR
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
    /total\s*(?:factura|a\s*pagar|importe|due|charged|paid)?\s*[:\s]*[€$£]?\s*([\d.,]+)\s*[€$£]?/gi,
    /TOTAL[:\s]+[€$£]?\s*([\d.,]+)\s*[€$£]?/gi,
    /AED\s*([\d.,]+)/gi,
    /grand\s*total[:\s]+[€$£]?\s*([\d.,]+)/gi,
  ];

  let maxFound = 0;
  for (const pattern of totalPatterns) {
    const matches = Array.from(text.matchAll(pattern));
    for (const m of matches) {
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

  const basePatterns = [/base\s*imponible[:\s]*€?\s*([\d.,]+)/gi, /subtotal[:\s]*€?\s*([\d.,]+)/gi];
  for (const p of basePatterns) {
    const m = text.match(p);
    if (m) {
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
  const patterns = [
    /fecha[:\s]+(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/i,
    /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const day = m[1].padStart(2, '0');
      const month = m[2].padStart(2, '0');
      const year = m[3];
      if (parseInt(year) >= 2024 && parseInt(year) <= 2027) return `${year}-${month}-${day}`;
    }
  }
  // Default: hoy
  return new Date().toISOString().split('T')[0];
}

// Mapear de frontend a DB
// Solo incluimos pdf_url si tiene valor (para tolerar BBDDs sin esta columna aún)
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
 * 3. Crea automáticamente la factura en Supabase
 *
 * Body (multipart/form-data):
 * - file: el PDF de la factura
 * - type: 'income' | 'expense' (opcional, default: 'expense')
 * - subject: asunto del email (opcional, para descripción)
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
      return NextResponse.json({ error: 'No se subió ningún archivo PDF' }, { status: 400 });
    }

    // Extraer texto del PDF
    const buffer = Buffer.from(await file.arrayBuffer());
    const pdfParse: any = require('pdf-parse/lib/pdf-parse.js');
    const pdfData = await pdfParse(buffer);
    const text = pdfData.text;

    if (!text || text.length < 10) {
      return NextResponse.json({
        error: 'PDF sin texto extraíble (puede ser escaneado)',
        success: false
      }, { status: 400 });
    }

    // Analizar
    const invoiceNumber = extractInvoiceNumber(text);
    const filename = file.name || 'email.pdf';
    let company = extractCompany(text, filename);

    // Si la empresa no se detectó bien, intentar desde el remitente del email
    if ((!company || company.length < 4) && sender) {
      // Extraer dominio del email del remitente (ej: "Stripe <invoices@stripe.com>" → "Stripe")
      const senderMatch = sender.match(/^([^<]+?)\s*</) || sender.match(/@([^.]+)\./);
      if (senderMatch) company = senderMatch[1].trim();
    }

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

    // Si hubo conversión de moneda, añadir nota a la descripción
    if (originalCurrency !== 'EUR' && originalAmount !== null) {
      const conversionNote = `[Original: ${originalAmount.toFixed(2)} ${originalCurrency} → ${total.toFixed(2)} EUR]`;
      description = description ? `${description} ${conversionNote}` : conversionNote;
    }

    // Crear el invoice
    const newInvoice = {
      id: `email_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      type,
      category: 'work',
      number: invoiceNumber || `EMAIL-${Date.now()}`,
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

    // 📤 SIEMPRE: Subir PDF a Supabase Storage
    let pdfUrl: string | null = null;
    try {
      const monthMap: Record<string, string> = {
        '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
        '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
        '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic'
      };
      const monthShort = monthMap[date.slice(5, 7)] || 'Sin';
      const cleanCompany = company.replace(/[^a-zA-Z0-9\s\-]/g, '').trim().substring(0, 50);
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

    // Añadir pdfUrl al invoice antes de guardar en DB
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

    // 🚀 Subir PDF a Google Drive vía webhook de n8n (fire-and-forget)
    const driveWebhook = process.env.DRIVE_WEBHOOK_EXPENSES;
    if (driveWebhook) {
      try {
        const monthMap: Record<string, string> = {
          '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
          '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
          '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic'
        };
        const month = monthMap[date.slice(5, 7)] || 'Sin';
        const cleanCompany = company.replace(/[^a-zA-Z0-9\s\-]/g, '').trim().substring(0, 50);
        const driveFileName = `${month}-${invoiceNumber || 'X'}-${cleanCompany}.pdf`;

        const driveFormData = new FormData();
        const pdfBlob = new Blob([buffer], { type: 'application/pdf' });
        driveFormData.append('file', pdfBlob, driveFileName);
        driveFormData.append('fileName', driveFileName);
        driveFormData.append('company', company);
        driveFormData.append('amount', total.toFixed(2));
        driveFormData.append('month', month);

        // Fire-and-forget (no esperamos respuesta)
        fetch(driveWebhook, {
          method: 'POST',
          body: driveFormData,
        }).catch(err => console.error('Drive upload error:', err));
      } catch (driveErr) {
        console.error('Error preparing Drive upload:', driveErr);
      }
    }

    return NextResponse.json({
      success: true,
      invoice: newInvoice,
      currency: { original: originalCurrency, converted: 'EUR', originalAmount, finalAmount: total },
      message: `✅ Factura "${company}" añadida: ${total.toFixed(2)}€${conversionMsg}`,
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
