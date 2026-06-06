import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const SUPABASE_URL = 'https://cmjnvamxnregpuamoxxu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_m1kzzGncftRhSzj45JIcRQ_h9VTizgG';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const INVOICES_FOLDER = `${process.env.HOME}/Desktop/facturas/Trimestre Abr-May-Jun-Jul/Ingresos`;

function extractInvoiceNumber(filename, text) {
  // De "Factura 012-2026 - ..." → 12
  const fileMatch = filename.match(/Factura\s+0*(\d+)-/i);
  if (fileMatch) return fileMatch[1];

  // Buscar en el texto
  const patterns = [
    /(?:factura|invoice)[\s\/]*(?:n[º°ºo]\.?|num)?\s*:?\s*0*(\d+)/i,
    /n[º°ºo]\s*:?\s*0*(\d+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractCompany(filename, text) {
  // De "Factura 012-2026 - Georgina Martínez Peñalosa.pdf" → "Georgina Martínez Peñalosa"
  const match = filename.match(/Factura\s+\d+-\d+\s*-\s*(.+)\.pdf$/i);
  if (match) {
    return match[1].replace(/_/g, '.').trim();
  }
  return null;
}

function extractAmounts(text) {
  let total = null;
  let base = null;
  let vat = null;

  // Buscar TOTAL
  const totalPatterns = [
    /total\s*(?:factura|a\s*pagar|importe)?\s*[:\s]*€?\s*([\d.,]+)\s*€?/gi,
    /TOTAL[:\s]+€?\s*([\d.,]+)\s*€?/gi,
    /total\s*EUR[:\s]+([\d.,]+)/gi,
  ];

  for (const pattern of totalPatterns) {
    const matches = Array.from(text.matchAll(pattern));
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      const amount = parseFloat(lastMatch[1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(amount) && amount > 0) {
        total = amount;
        break;
      }
    }
  }

  // Buscar BASE IMPONIBLE
  const basePatterns = [
    /base\s*imponible[:\s]*€?\s*([\d.,]+)\s*€?/gi,
    /subtotal[:\s]*€?\s*([\d.,]+)\s*€?/gi,
    /importe\s*neto[:\s]*€?\s*([\d.,]+)\s*€?/gi,
  ];

  for (const pattern of basePatterns) {
    const matches = Array.from(text.matchAll(pattern));
    if (matches.length > 0) {
      const amount = parseFloat(matches[0][1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(amount) && amount > 0) {
        base = amount;
        break;
      }
    }
  }

  // Buscar IVA monto
  const ivaPatterns = [
    /iva\s*\(?\s*21\s*%\s*\)?[:\s]*€?\s*([\d.,]+)\s*€?/gi,
    /iva[:\s]+€?\s*([\d.,]+)\s*€?/gi,
  ];

  for (const pattern of ivaPatterns) {
    const matches = Array.from(text.matchAll(pattern));
    if (matches.length > 0) {
      const amount = parseFloat(matches[0][1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(amount) && amount > 0) {
        vat = amount;
        break;
      }
    }
  }

  // Determinar IVA: 21% o 0%
  const has21Percent = /(?:iva|vat).*21\s*%|21\s*%.*(?:iva|vat)/i.test(text);
  const hasIvaAmount = vat !== null && vat > 0;
  const hasBaseAndTotal = base !== null && total !== null && Math.abs((total - base) - base * 0.21) < 1;

  let ivaPercent = 0;
  if (has21Percent || hasIvaAmount || hasBaseAndTotal) {
    ivaPercent = 21;
    if (total !== null && base === null) {
      base = total / 1.21;
      vat = total - base;
    }
    if (base !== null && total === null) {
      vat = base * 0.21;
      total = base + vat;
    }
    if (total !== null && base !== null && vat === null) {
      vat = total - base;
    }
  } else {
    ivaPercent = 0;
    if (total !== null) {
      base = total;
      vat = 0;
    }
  }

  return { total, base, vat, ivaPercent };
}

function extractDescription(text) {
  // Buscar concepto explícito
  const explicitPatterns = [
    /(?:concepto|descripci[oó]n|detalle|description)[:\s]+([^\n\r]{5,200})/i,
  ];

  for (const pattern of explicitPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let desc = match[1].trim().replace(/\s+/g, ' ');
      desc = desc.split(/\s+(?:total|importe|base|iva|subtotal|precio|qty|cantidad|unidades)/i)[0];
      if (desc.length > 150) desc = desc.substring(0, 147) + '...';
      if (desc.length >= 5) return desc.trim();
    }
  }

  // Buscar entre CONCEPTO y TOTAL
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);
  let inItemsSection = false;
  for (const line of lines) {
    if (/^(concepto|descripci|detalle)/i.test(line)) {
      inItemsSection = true;
      continue;
    }
    if (inItemsSection && /^(total|importe\s*total|subtotal|base\s*imponible|iva)/i.test(line)) {
      break;
    }
    if (inItemsSection && line.length >= 8 && line.length <= 200 &&
        !/^[\d\s.,€%/-]+$/.test(line)) {
      const cleaned = line.replace(/\s*[\d.,]+\s*€?\s*$/g, '').trim();
      if (cleaned.length >= 5) return cleaned;
    }
  }

  return null;
}

function extractDate(text, filename) {
  // Buscar fecha en formato DD/MM/YYYY
  const datePatterns = [
    /fecha[:\s]+(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/i,
    /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      const day = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      const year = match[3];
      if (parseInt(year) >= 2024 && parseInt(year) <= 2027) {
        return `${year}-${month}-${day}`;
      }
    }
  }

  return null;
}

async function processInvoice(filename) {
  const filepath = join(INVOICES_FOLDER, filename);
  console.log(`\n📄 Procesando: ${filename}`);

  try {
    const buffer = readFileSync(filepath);
    const pdfData = await pdfParse(buffer);
    const text = pdfData.text;

    const invoiceNumber = extractInvoiceNumber(filename, text);
    const company = extractCompany(filename, text);
    const description = extractDescription(text);
    const { total, base, vat, ivaPercent } = extractAmounts(text);
    const date = extractDate(text, filename);

    console.log(`  ✓ Nº: ${invoiceNumber}`);
    console.log(`  ✓ Empresa: ${company}`);
    console.log(`  ✓ Descripción: ${description?.substring(0, 60) || 'N/A'}`);
    console.log(`  ✓ Total: ${total?.toFixed(2)}€`);
    console.log(`  ✓ Base: ${base?.toFixed(2)}€`);
    console.log(`  ✓ IVA: ${vat?.toFixed(2)}€ (${ivaPercent}%)`);
    console.log(`  ✓ Fecha: ${date}`);

    if (!total || !company) {
      console.log(`  ⚠️  Datos insuficientes, saltando...`);
      return null;
    }

    // Crear el objeto invoice para Supabase
    const invoice = {
      id: `factura_ing_${invoiceNumber}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      type: 'income',
      category: 'work',
      number: invoiceNumber,
      company: company,
      description: description || null,
      amount: total,
      amount_without_vat: base || total,
      vat: vat || 0,
      date: date || '2026-05-01', // Fallback a mes intermedio del trimestre
      file_name: filename,
      method: 'Transferencia',
      has_invoice: true,
      paid: true,
    };

    return invoice;
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('🚀 IMPORTANDO FACTURAS DE INGRESOS\n');
  console.log(`📂 Carpeta: ${INVOICES_FOLDER}\n`);

  const files = readdirSync(INVOICES_FOLDER)
    .filter(f => f.endsWith('.pdf') && f.startsWith('Factura'));

  console.log(`📊 Encontrados ${files.length} PDFs\n`);

  const invoices = [];
  for (const file of files) {
    const invoice = await processInvoice(file);
    if (invoice) invoices.push(invoice);
  }

  console.log(`\n\n📤 Listas para insertar: ${invoices.length} facturas\n`);

  // Verificar si ya existen facturas con esos números
  const { data: existing } = await supabase
    .from('invoices')
    .select('number, type, has_invoice, date')
    .eq('type', 'income')
    .eq('has_invoice', true)
    .gte('date', '2026-04-01');

  console.log(`📋 Facturas de ingresos existentes en BBDD desde Abril: ${existing?.length || 0}`);

  // Insertar en batches
  const batchSize = 10;
  let inserted = 0;

  for (let i = 0; i < invoices.length; i += batchSize) {
    const batch = invoices.slice(i, i + batchSize);
    const { error } = await supabase.from('invoices').insert(batch);
    if (error) {
      console.error(`\n❌ Error en batch:`, error.message);
      return;
    }
    inserted += batch.length;
    console.log(`✅ Insertados ${inserted}/${invoices.length}`);
  }

  console.log(`\n🎉 ¡COMPLETADO! ${inserted} facturas subidas a Supabase`);
  console.log(`💡 Todas marcadas como: hasInvoice=true, paid=true, type=income, category=work, method=Transferencia`);
}

main().catch(console.error);
