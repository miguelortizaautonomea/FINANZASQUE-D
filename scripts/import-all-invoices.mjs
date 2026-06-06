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

// Las pendientes (no cobradas): 16, 25, 26
const PENDING_INVOICES = ['016', '025', '026', '16', '25', '26'];

function extractInvoiceNumber(filename) {
  const m = filename.match(/Factura\s+0*(\d+)-/i);
  return m ? m[1] : null;
}

function extractCompany(filename) {
  const m = filename.match(/Factura\s+\d+-\d+\s*-\s*(.+)\.pdf$/i);
  if (m) return m[1].replace(/_/g, '.').trim();
  return null;
}

function extractAmounts(text) {
  let total = null, base = null, vat = null;

  const totalPatterns = [
    /total\s*(?:factura|a\s*pagar|importe)?\s*[:\s]*€?\s*([\d.,]+)\s*€?/gi,
    /TOTAL[:\s]+€?\s*([\d.,]+)\s*€?/gi,
  ];
  for (const p of totalPatterns) {
    const matches = Array.from(text.matchAll(p));
    if (matches.length > 0) {
      const amount = parseFloat(matches[matches.length - 1][1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(amount) && amount > 0) { total = amount; break; }
    }
  }

  const basePatterns = [/base\s*imponible[:\s]*€?\s*([\d.,]+)/gi, /subtotal[:\s]*€?\s*([\d.,]+)/gi];
  for (const p of basePatterns) {
    const matches = Array.from(text.matchAll(p));
    if (matches.length > 0) {
      const amount = parseFloat(matches[0][1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(amount) && amount > 0) { base = amount; break; }
    }
  }

  const ivaPatterns = [/iva\s*\(?\s*21\s*%\s*\)?[:\s]*€?\s*([\d.,]+)/gi, /iva[:\s]+€?\s*([\d.,]+)/gi];
  for (const p of ivaPatterns) {
    const matches = Array.from(text.matchAll(p));
    if (matches.length > 0) {
      const amount = parseFloat(matches[0][1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(amount) && amount > 0) { vat = amount; break; }
    }
  }

  const has21 = /(?:iva|vat).*21\s*%|21\s*%.*(?:iva|vat)/i.test(text);
  const hasIvaAmount = vat !== null && vat > 0;
  const hasBaseAndTotal = base !== null && total !== null && Math.abs((total - base) - base * 0.21) < 1;

  let ivaPercent = 0;
  if (has21 || hasIvaAmount || hasBaseAndTotal) {
    ivaPercent = 21;
    if (total !== null && base === null) { base = total / 1.21; vat = total - base; }
    if (base !== null && total === null) { vat = base * 0.21; total = base + vat; }
    if (total !== null && base !== null && vat === null) { vat = total - base; }
  } else {
    ivaPercent = 0;
    if (total !== null) { base = total; vat = 0; }
  }

  return { total, base, vat, ivaPercent };
}

function extractDescription(text) {
  const m = text.match(/(?:concepto|descripci[oó]n|detalle)[:\s]+([^\n\r]{5,200})/i);
  if (m && m[1]) {
    let desc = m[1].trim().replace(/\s+/g, ' ');
    desc = desc.split(/\s+(?:total|importe|base|iva|subtotal|precio|qty|cantidad|unidades)/i)[0];
    if (desc.length > 150) desc = desc.substring(0, 147) + '...';
    if (desc.length >= 5) return desc.trim();
  }

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);
  let inItems = false;
  for (const line of lines) {
    if (/^(concepto|descripci|detalle)/i.test(line)) { inItems = true; continue; }
    if (inItems && /^(total|importe\s*total|subtotal|base\s*imponible|iva)/i.test(line)) break;
    if (inItems && line.length >= 8 && !/^[\d\s.,€%/-]+$/.test(line)) {
      const cleaned = line.replace(/\s*[\d.,]+\s*€?\s*$/g, '').trim();
      if (cleaned.length >= 5) return cleaned;
    }
  }
  return null;
}

function extractDate(text) {
  const patterns = [/fecha[:\s]+(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/i, /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const day = m[1].padStart(2, '0');
      const month = m[2].padStart(2, '0');
      const year = m[3];
      if (parseInt(year) >= 2024 && parseInt(year) <= 2027) return `${year}-${month}-${day}`;
    }
  }
  return null;
}

async function processInvoice(filename) {
  const filepath = join(INVOICES_FOLDER, filename);
  try {
    const buffer = readFileSync(filepath);
    const pdfData = await pdfParse(buffer);
    const text = pdfData.text;

    const number = extractInvoiceNumber(filename);
    const company = extractCompany(filename);
    const description = extractDescription(text);
    const { total, base, vat, ivaPercent } = extractAmounts(text);
    const date = extractDate(text);

    if (!total || !company) return null;

    const isPending = PENDING_INVOICES.includes(number);

    return {
      id: `factura_ing_${number}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      type: 'income',
      category: 'work',
      number,
      company,
      description: description || null,
      amount: total,
      amount_without_vat: base || total,
      vat: vat || 0,
      date: date || '2026-05-01',
      file_name: filename,
      method: 'Transferencia',
      has_invoice: true,
      paid: !isPending, // 016, 025, 026 son PENDIENTES (paid:false)
    };
  } catch (e) {
    console.log(`  ❌ Error en ${filename}: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log('🚀 IMPORTANDO TODAS LAS FACTURAS DE INGRESOS\n');

  // Eliminar facturas de ingresos existentes desde Abril
  console.log('🗑️  Limpiando facturas de ingresos previas desde Abril...');
  const { error: deleteError } = await supabase
    .from('invoices')
    .delete()
    .eq('type', 'income')
    .eq('has_invoice', true)
    .gte('date', '2026-04-01');

  if (deleteError) {
    console.log('❌ Error eliminando:', deleteError.message);
    return;
  }
  console.log('✅ Facturas previas eliminadas\n');

  const files = readdirSync(INVOICES_FOLDER).filter(f => f.endsWith('.pdf') && f.startsWith('Factura'));
  console.log(`📄 Procesando ${files.length} PDFs...\n`);

  const invoices = [];
  for (const file of files) {
    const inv = await processInvoice(file);
    if (inv) {
      invoices.push(inv);
      const status = inv.paid ? '✅ COBRADA' : '⏳ PENDIENTE';
      console.log(`  ${status} Nº${inv.number} | ${inv.company.substring(0, 40)} | ${inv.amount.toFixed(2)}€`);
    }
  }

  console.log(`\n📤 Insertando ${invoices.length} facturas...\n`);

  const { error } = await supabase.from('invoices').insert(invoices);
  if (error) {
    console.log('❌ Error insertando:', error.message);
    return;
  }

  const pagadas = invoices.filter(i => i.paid);
  const pendientes = invoices.filter(i => !i.paid);
  const totalPagado = pagadas.reduce((s, i) => s + i.amount, 0);
  const totalPendiente = pendientes.reduce((s, i) => s + i.amount, 0);

  console.log(`\n🎉 ¡COMPLETADO!`);
  console.log(`   ✅ Cobradas: ${pagadas.length} (${totalPagado.toFixed(2)}€)`);
  console.log(`   ⏳ Pendientes: ${pendientes.length} (${totalPendiente.toFixed(2)}€)`);
  console.log(`   💰 Total facturado: ${(totalPagado + totalPendiente).toFixed(2)}€`);
}

main().catch(console.error);
