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

function extractAmount(text: string): { total: number | null; base: number | null; vat: number | null; ivaPercent: number } {
  let total: number | null = null;
  let base: number | null = null;
  let vat: number | null = null;

  const totalPatterns = [
    /total\s*(?:factura|a\s*pagar|importe|due|charged|paid)?\s*[:\s]*[€$£]?\s*([\d.,]+)\s*[€$£]?/gi,
    /TOTAL[:\s]+[€$£]?\s*([\d.,]+)\s*[€$£]?/gi,
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

  const basePatterns = [/base\s*imponible[:\s]*€?\s*([\d.,]+)/gi, /subtotal[:\s]*€?\s*([\d.,]+)/gi];
  for (const p of basePatterns) {
    const m = text.match(p);
    if (m) {
      const a = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(a) && a > 0) { base = a; break; }
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

  return { total, base, vat, ivaPercent };
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
function mapToDB(invoice: any) {
  return {
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

    const description = extractDescription(text) || subject || null;
    const { total, base, vat, ivaPercent } = extractAmount(text);
    const date = extractDate(text);

    if (!total) {
      return NextResponse.json({
        error: 'No se pudo extraer el importe de la factura',
        success: false,
        analyzed: { invoiceNumber, company, description, text: text.substring(0, 300) }
      }, { status: 400 });
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

    return NextResponse.json({
      success: true,
      invoice: newInvoice,
      message: `✅ Factura "${company}" añadida: ${total.toFixed(2)}€`
    });
  } catch (error: any) {
    console.error('Error procesando email PDF:', error);
    return NextResponse.json({
      error: error.message || 'Error procesando el PDF',
      success: false
    }, { status: 500 });
  }
}
