import { createClient } from '@supabase/supabase-js';
import { readFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const SUPABASE_URL = 'https://cmjnvamxnregpuamoxxu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_m1kzzGncftRhSzj45JIcRQ_h9VTizgG';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const SOURCE = `${process.env.HOME}/Desktop/Gastos/Abril`;

const FILES_TO_PROCESS = [
  { file: 'Apple(5).pdf', company: 'Apple', newNumber: 9 },
  { file: 'GHL agencia Abril(3).pdf', company: 'GoHighLevel', newNumber: 10 },
  { file: 'Smartlead(2).pdf', company: 'Smartlead', newNumber: 11 },
  { file: 'Stripe Abril Gastos (1).pdf', company: 'Stripe', newNumber: 12 },
  { file: 'Zapmail(4).pdf', company: 'Zapmail', newNumber: 13 },
];

function extractAmount(text) {
  const patterns = [
    /total\s*(?:factura|a\s*pagar|importe|due|charged|paid)?\s*[:\s]*[€$£]?\s*([\d.,]+)\s*[€$£]?/gi,
    /TOTAL[:\s]+[€$£]?\s*([\d.,]+)\s*[€$£]?/gi,
    /amount\s*(?:total|due|charged|paid)?\s*[:\s]*[€$£]?\s*([\d.,]+)\s*[€$£]?/gi,
    /grand\s*total[:\s]+[€$£]?\s*([\d.,]+)/gi,
  ];

  let maxFound = 0;
  for (const pattern of patterns) {
    const matches = Array.from(text.matchAll(pattern));
    for (const m of matches) {
      const amount = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(amount) && amount > 0 && amount < 100000 && amount > maxFound) {
        maxFound = amount;
      }
    }
  }

  // Si no encontramos con patrones, buscar montos en €
  if (maxFound === 0) {
    const allMatches = Array.from(text.matchAll(/([\d]{1,4}[.,][\d]{2})\s*€|€\s*([\d]{1,4}[.,][\d]{2})/g));
    for (const m of allMatches) {
      const val = m[1] || m[2];
      const amount = parseFloat(val.replace(/\./g, '').replace(',', '.'));
      if (!isNaN(amount) && amount > 0 && amount < 100000 && amount > maxFound) {
        maxFound = amount;
      }
    }
  }

  return maxFound > 0 ? maxFound : null;
}

function detectIVA(text, total) {
  const has21 = /(?:iva|vat).*21\s*%|21\s*%.*(?:iva|vat)/i.test(text);
  if (has21 && total) {
    const base = total / 1.21;
    const vat = total - base;
    return { base, vat, ivaPercent: 21 };
  }
  return { base: total, vat: 0, ivaPercent: 0 };
}

async function main() {
  console.log('🚀 AÑADIENDO 5 FACTURAS EXTRA DE ABRIL\n');

  const invoices = [];

  for (const item of FILES_TO_PROCESS) {
    const filepath = join(SOURCE, item.file);
    console.log(`📄 Procesando: ${item.file}`);

    try {
      const buffer = readFileSync(filepath);
      const pdfData = await pdfParse(buffer);
      const text = pdfData.text;

      const amount = extractAmount(text);
      if (!amount) {
        console.log(`  ❌ No se pudo extraer el importe`);
        continue;
      }

      const { base, vat, ivaPercent } = detectIVA(text, amount);

      // Renombrar archivo
      const newName = `${item.newNumber}-Abr-${item.company}.pdf`;
      const destPath = join(SOURCE, newName);
      try {
        copyFileSync(filepath, destPath);
        console.log(`  ✅ Renombrado: ${newName}`);
      } catch (e) {
        console.log(`  ⚠️  No se pudo renombrar: ${e.message}`);
      }

      const invoice = {
        id: `gasto_Abril_${item.newNumber}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        type: 'expense',
        category: 'work',
        number: `${item.newNumber}-Abr`,
        company: item.company,
        description: null,
        amount: amount,
        amount_without_vat: base,
        vat: vat,
        date: '2026-04-15',
        file_name: newName,
        method: 'Tarjeta',
        has_invoice: true,
        paid: true,
      };

      invoices.push(invoice);
      console.log(`  💰 Total: ${amount.toFixed(2)}€ | Base: ${base.toFixed(2)}€ | IVA: ${vat.toFixed(2)}€ (${ivaPercent}%)`);
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }

  console.log(`\n📤 Insertando ${invoices.length} facturas en Supabase...\n`);

  const { error } = await supabase.from('invoices').insert(invoices);
  if (error) {
    console.log('❌ Error:', error.message);
    return;
  }

  console.log(`🎉 ¡COMPLETADO! ${invoices.length} facturas añadidas:\n`);
  for (const inv of invoices) {
    console.log(`   ✅ ${inv.number} - ${inv.company} → ${inv.amount.toFixed(2)}€`);
  }
}

main().catch(console.error);
