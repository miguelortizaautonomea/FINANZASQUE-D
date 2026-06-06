import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, copyFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const SUPABASE_URL = 'https://cmjnvamxnregpuamoxxu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_m1kzzGncftRhSzj45JIcRQ_h9VTizgG';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const SOURCE = `${process.env.HOME}/Desktop/fact abril-mayo de gastos`;
const DEST_BASE = `${process.env.HOME}/Desktop/Gastos`;

// Crear carpetas destino si no existen
['Abril', 'Mayo', 'Junio'].forEach(month => {
  const dir = join(DEST_BASE, month);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
});

// Detección de empresa por keywords en texto + nombre del archivo
function detectCompany(text, filename) {
  const fLower = filename.toLowerCase();
  const tLower = text.toLowerCase();
  const all = (fLower + ' ' + tLower).toLowerCase();

  // Empresas conocidas (ordenadas por especificidad)
  const companies = [
    { keys: ['millionverifier', 'million verifier', 'mv-2026'], name: 'MillionVerifier' },
    { keys: ['twilio'], name: 'Twilio' },
    { keys: ['stripe'], name: 'Stripe' },
    { keys: ['slack', 'sbie-'], name: 'Slack' },
    { keys: ['gohighlevel', 'highlevel', 'ghl agencia', 'gohighlevel.com', 'high level'], name: 'GoHighLevel' },
    { keys: ['google workspa'], name: 'GoogleWorkspace' },
    { keys: ['google cloud', 'cloud.google'], name: 'GoogleCloud' },
    { keys: ['amazon', 'amzn', 'amzon', 'amazn'], name: 'Amazon' },
    { keys: ['apple'], name: 'Apple' },
    { keys: ['smartlead'], name: 'Smartlead' },
    { keys: ['zapmail', 'zap mail'], name: 'Zapmail' },
    { keys: ['cheai', 'che ai'], name: 'CheAI' },
    { keys: ['microsoft', 'office365'], name: 'Microsoft' },
    { keys: ['claude', 'anthropic'], name: 'Claude' },
    { keys: ['openai', 'chatgpt'], name: 'OpenAI' },
    { keys: ['notion'], name: 'Notion' },
    { keys: ['cloudflare'], name: 'Cloudflare' },
    { keys: ['vercel'], name: 'Vercel' },
    { keys: ['github'], name: 'GitHub' },
    { keys: ['figma'], name: 'Figma' },
    { keys: ['canva'], name: 'Canva' },
    { keys: ['mailchimp'], name: 'Mailchimp' },
    { keys: ['n8n'], name: 'N8N' },
    { keys: ['loom'], name: 'Loom' },
    { keys: ['zoom'], name: 'Zoom' },
    { keys: ['render'], name: 'Render' },
    { keys: ['railway'], name: 'Railway' },
    { keys: ['linear'], name: 'Linear' },
    { keys: ['rios gallardo', 'jose maria rios'], name: 'JoseMariaRios' },
    { keys: ['mesa elevable', 'invoice-mesa'], name: 'AmazonMesa' },
    { keys: ['pizarra', 'invoice-pizarra'], name: 'AmazonPizarra' },
    { keys: ['ria estudio', 'ria-estudio'], name: 'RiaEstudio' },
  ];

  for (const c of companies) {
    if (c.keys.some(k => all.includes(k))) return c.name;
  }
  return null;
}

// Detectar mes (Abril, Mayo, Junio)
function detectMonth(text, filename) {
  const fLower = filename.toLowerCase();
  const tLower = text.toLowerCase();
  const all = (fLower + ' ' + tLower).toLowerCase();

  // 1. Buscar mes en el filename
  if (/abril/i.test(filename) || /april/i.test(filename)) return 'Abril';
  if (/mayo/i.test(filename) || /\bmay\b/i.test(filename)) return 'Mayo';
  if (/junio/i.test(filename) || /june/i.test(filename) || /\bjun\b/i.test(filename)) return 'Junio';

  // 2. Buscar fecha en el texto
  // Patrón DD/MM/YYYY o DD-MM-YYYY
  const datePatterns = [
    /(\d{1,2})[/\-.\s]+(\d{1,2})[/\-.\s]+2026/g,
    /2026[-./](\d{1,2})[-./](\d{1,2})/g,
  ];

  for (const pattern of datePatterns) {
    const matches = Array.from(text.matchAll(pattern));
    for (const match of matches) {
      let month;
      if (pattern.source.startsWith('2026')) {
        month = parseInt(match[1]);
      } else {
        month = parseInt(match[2]);
      }
      if (month === 4) return 'Abril';
      if (month === 5) return 'Mayo';
      if (month === 6) return 'Junio';
    }
  }

  // 3. Buscar nombre del mes en el texto
  if (/\babril\b/i.test(text) || /\bapril\b/i.test(text)) return 'Abril';
  if (/\bmayo\b/i.test(text) || /\bmay\b/i.test(text)) return 'Mayo';
  if (/\bjunio\b/i.test(text) || /\bjune\b/i.test(text)) return 'Junio';

  return null;
}

// Extraer importe
function extractAmount(text) {
  let total = null;

  const patterns = [
    /total\s*(?:factura|a\s*pagar|importe|due|charged)?\s*[:\s]*[€$£]?\s*([\d.,]+)\s*[€$£]?/gi,
    /TOTAL[:\s]+[€$£]?\s*([\d.,]+)\s*[€$£]?/gi,
    /amount\s*(?:total|due|charged)?\s*[:\s]*[€$£]?\s*([\d.,]+)\s*[€$£]?/gi,
    /grand\s*total[:\s]+[€$£]?\s*([\d.,]+)/gi,
  ];

  for (const pattern of patterns) {
    const matches = Array.from(text.matchAll(pattern));
    if (matches.length > 0) {
      // Tomar el monto más grande de los encontrados
      let maxAmount = 0;
      for (const m of matches) {
        const amount = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
        if (!isNaN(amount) && amount > maxAmount) maxAmount = amount;
      }
      if (maxAmount > 0) {
        total = maxAmount;
        break;
      }
    }
  }

  // Si no encontramos, buscar cualquier monto con €
  if (!total) {
    const ms = Array.from(text.matchAll(/([\d.,]+)\s*€|€\s*([\d.,]+)/g));
    let max = 0;
    for (const m of ms) {
      const val = m[1] || m[2];
      const amount = parseFloat(val.replace(/\./g, '').replace(',', '.'));
      if (!isNaN(amount) && amount > max && amount < 10000) max = amount;
    }
    if (max > 0) total = max;
  }

  return total;
}

// Extraer fecha exacta
function extractDate(text, defaultMonth) {
  const patterns = [
    /fecha[:\s]+(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/i,
    /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/,
    /(\d{4})-(\d{1,2})-(\d{1,2})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let day, month, year;
      if (match[0].includes('-') && match[1].length === 4) {
        year = match[1];
        month = match[2].padStart(2, '0');
        day = match[3].padStart(2, '0');
      } else {
        day = match[1].padStart(2, '0');
        month = match[2].padStart(2, '0');
        year = match[3];
      }
      if (parseInt(year) === 2026) {
        return `${year}-${month}-${day}`;
      }
    }
  }

  // Fallback al mes detectado
  const monthNum = { 'Abril': '04', 'Mayo': '05', 'Junio': '06' }[defaultMonth];
  if (monthNum) return `2026-${monthNum}-15`;

  return null;
}

// Procesar un PDF
async function processFile(filename) {
  const filepath = join(SOURCE, filename);
  try {
    const buffer = readFileSync(filepath);
    const pdfData = await pdfParse(buffer);
    const text = pdfData.text;

    const company = detectCompany(text, filename);
    const month = detectMonth(text, filename);
    const amount = extractAmount(text);
    const date = extractDate(text, month);

    return { filename, company, month, amount, date, text: text.substring(0, 300) };
  } catch (error) {
    return { filename, error: error.message };
  }
}

async function main() {
  console.log('🚀 ANALIZANDO Y ORGANIZANDO FACTURAS DE GASTO\n');

  const files = readdirSync(SOURCE).filter(f => f.endsWith('.pdf'));
  console.log(`📊 ${files.length} PDFs encontrados\n`);

  const results = [];
  for (const file of files) {
    const result = await processFile(file);
    results.push(result);
    if (result.error) {
      console.log(`❌ ${file} → ERROR: ${result.error}`);
    } else {
      const status = result.month && result.company && result.amount ? '✅' : '⚠️ ';
      console.log(`${status} ${file.substring(0, 50).padEnd(50)} → ${result.month || '?'}/${result.company || '?'} → ${result.amount?.toFixed(2) || '?'}€`);
    }
  }

  // Filtrar válidos
  const valid = results.filter(r => r.month && r.company && r.amount && !r.error);
  console.log(`\n✅ ${valid.length}/${files.length} facturas con datos completos`);

  // Agrupar por mes y asignar número
  const byMonth = { 'Abril': [], 'Mayo': [], 'Junio': [] };
  for (const r of valid) {
    if (byMonth[r.month]) byMonth[r.month].push(r);
  }

  // Ordenar cada mes por fecha
  for (const month of Object.keys(byMonth)) {
    byMonth[month].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }

  console.log('\n\n📂 COPIANDO Y RENOMBRANDO ARCHIVOS:\n');

  const invoicesToInsert = [];
  const monthShort = { 'Abril': 'Abr', 'Mayo': 'May', 'Junio': 'Jun' };

  for (const month of Object.keys(byMonth)) {
    console.log(`\n--- ${month.toUpperCase()} ---`);
    let counter = 1;
    for (const r of byMonth[month]) {
      const newName = `${counter}-${monthShort[month]}-${r.company}.pdf`;
      const destPath = join(DEST_BASE, month, newName);
      try {
        copyFileSync(join(SOURCE, r.filename), destPath);
        console.log(`  ✅ ${newName} (${r.amount.toFixed(2)}€) [${r.date}]`);

        invoicesToInsert.push({
          id: `gasto_${month}_${counter}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          type: 'expense',
          category: 'work',
          number: `${counter}-${monthShort[month]}`,
          company: r.company,
          description: null,
          amount: r.amount,
          amount_without_vat: r.amount / 1.21,
          vat: r.amount - (r.amount / 1.21),
          date: r.date,
          file_name: newName,
          method: 'Tarjeta',
          has_invoice: true,
          paid: true,
        });
        counter++;
      } catch (err) {
        console.log(`  ❌ Error copiando ${newName}: ${err.message}`);
      }
    }
  }

  console.log(`\n\n📤 INSERTANDO ${invoicesToInsert.length} FACTURAS DE GASTO EN SUPABASE...\n`);

  // Eliminar gastos previos con has_invoice=true desde abril (para no duplicar)
  console.log('🗑️  Limpiando gastos previos desde Abril...');
  const { error: deleteError } = await supabase
    .from('invoices')
    .delete()
    .eq('type', 'expense')
    .eq('has_invoice', true)
    .gte('date', '2026-04-01');

  if (deleteError) {
    console.log('❌ Error:', deleteError.message);
    return;
  }
  console.log('✅ Gastos previos eliminados');

  // Insertar
  const { error } = await supabase.from('invoices').insert(invoicesToInsert);
  if (error) {
    console.log('❌ Error insertando:', error.message);
    return;
  }

  console.log(`\n🎉 ¡COMPLETADO!`);
  console.log(`   📂 Archivos copiados a: ~/Desktop/Gastos/{Abril,Mayo,Junio}/`);
  console.log(`   💾 ${invoicesToInsert.length} facturas en Supabase`);

  // Mostrar warnings de archivos no procesados
  const failed = results.filter(r => !r.error && (!r.month || !r.company || !r.amount));
  if (failed.length > 0) {
    console.log(`\n⚠️  ${failed.length} archivos NO procesados (revisar manualmente):`);
    for (const f of failed) {
      console.log(`   - ${f.filename}`);
      console.log(`     Mes: ${f.month || '?'} | Empresa: ${f.company || '?'} | Importe: ${f.amount || '?'}`);
    }
  }
}

main().catch(console.error);
