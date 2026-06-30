// Analiza cada PDF de "revisar facturas" y cruza con las 27 faltantes
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SOURCE = '/Users/miguelangelortizcruz/Desktop/revisar facturas';

// Las 27 faltantes
const FALTAN = [
  { num: '3-Abr',   company: 'GoHighLevel',     amount: 312.00, date: '2026-04-12' },
  { num: '4-Abr',   company: 'GoHighLevel',     amount: 41.90,  date: '2026-04-15' },
  { num: '5-Abr',   company: 'Railway',         amount: 9.61,   date: '2026-04-15' },
  { num: '8-Abr',   company: 'Smartlead',       amount: 33.84,  date: '2026-04-15' },
  { num: '10-Abr',  company: 'GoHighLevel',     amount: 489.94, date: '2026-04-15' },
  { num: '11-Abr',  company: 'Smartlead',       amount: 33.91,  date: '2026-04-15' },
  { num: '12-Abr',  company: 'Stripe',          amount: 25.54,  date: '2026-04-15' },
  { num: '13-Abr',  company: 'Zapmail',         amount: 33.91,  date: '2026-04-15' },
  { num: '20-Abr',  company: 'Verificado Meta', amount: 16.99,  date: '2026-04-20' },
  { num: '2-May',   company: 'Amazon',          amount: 204.49, date: '2026-05-15' },
  { num: '3-May',   company: 'Amazon',          amount: 32.98,  date: '2026-05-15' },
  { num: '5-May',   company: 'GoHighLevel',     amount: 312.11, date: '2026-05-15' },
  { num: '6-May',   company: 'GoHighLevel',     amount: 43.00,  date: '2026-05-15' },
  { num: '7-May',   company: 'Railway',         amount: 10.12,  date: '2026-05-15' },
  { num: '11-May',  company: 'Zapmail',         amount: 20.00,  date: '2026-05-15' },
  { num: '12-May',  company: 'Smartlead',       amount: 35.10,  date: '2026-05-15' },
  { num: '13-May',  company: 'Stripe',          amount: 29.37,  date: '2026-05-15' },
  { num: '14-May',  company: 'Stripe',          amount: 82.01,  date: '2026-05-15' },
  { num: '23-May',  company: 'Verificado Meta', amount: 16.99,  date: '2026-05-20' },
  { num: '1-Jun',   company: 'Amazon',          amount: 15.99,  date: '2026-06-03' },
  { num: '2-Jun',   company: 'Amazon',          amount: 12.64,  date: '2026-06-02' },
  { num: '3-Jun',   company: 'Amazon',          amount: 12.02,  date: '2026-06-03' },
  { num: '4-Jun',   company: 'Amazon',          amount: 45.99,  date: '2026-06-03' },
  { num: '5-Jun',   company: 'RETELL AI',       amount: 3.18,   date: '2026-06-07' },
  { num: '11-Jun',  company: 'Amazon',          amount: 39.25,  date: '2026-06-13' },
  { num: '12-Jun',  company: 'Amazon',          amount: 19.00,  date: '2026-06-13' },
  { num: '18-Jun',  company: 'N8N',             amount: 16.28,  date: '2026-06-22' },
];

async function analyzePDF(filePath) {
  const buffer = readFileSync(filePath);
  const formData = new FormData();
  const blob = new Blob([buffer], { type: 'application/pdf' });
  formData.append('file', blob, filePath.split('/').pop());

  const res = await fetch('https://finanzasque-d.vercel.app/api/analyze-pdf', {
    method: 'POST',
    body: formData,
  });
  return await res.json();
}

async function main() {
  const files = readdirSync(SOURCE).filter(f => f.toLowerCase().endsWith('.pdf'));
  console.log('📁 PDFs encontrados:', files.length);
  console.log('═'.repeat(80));
  console.log('');

  const analyzed = [];

  for (const file of files) {
    process.stdout.write('🔍 ' + file.padEnd(50).substring(0,50));
    try {
      const r = await analyzePDF(join(SOURCE, file));
      if (r.success) {
        const raw = (r.rawText || '').toLowerCase();

        // Detectar empresa (mejor del rawText)
        let empresa = 'desconocida';
        if (raw.includes('highlevel') || raw.includes('high level')) empresa = 'GoHighLevel';
        else if (raw.includes('stripe')) empresa = 'Stripe';
        else if (raw.includes('amazon') || raw.includes('amzn')) empresa = 'Amazon';
        else if (raw.includes('railway')) empresa = 'Railway';
        else if (raw.includes('smartlead')) empresa = 'Smartlead';
        else if (raw.includes('zapmail')) empresa = 'Zapmail';
        else if (raw.includes('claude') || raw.includes('anthropic')) empresa = 'Claude';
        else if (raw.includes('openai') || raw.includes('chatgpt')) empresa = 'ChatGPT';
        else if (raw.includes('slack')) empresa = 'Slack';
        else if (raw.includes('retell')) empresa = 'Retell AI';
        else if (raw.includes('million')) empresa = 'MillionVerifier';
        else if (raw.includes('google workspace')) empresa = 'Google Workspace';
        else if (raw.includes('meta') || raw.includes('verificado')) empresa = 'Verificado Meta';
        else if (raw.includes('n8n')) empresa = 'N8N';

        // Detectar fecha
        const dateMatch = raw.match(/(\d{1,2})[\s\/\-,](enero|febrero|marzo|abril|mayo|junio|julio|january|february|march|april|may|june|july)[\s\/\-,]+(\d{4})/i)
          || raw.match(/(\d{1,2})[\s\/\-](\d{1,2})[\s\/\-](\d{4})/);

        // Detectar moneda
        const isUSD = /\$\d|usd/i.test(raw);
        const isEUR = /€|eur/i.test(raw);

        analyzed.push({
          file, empresa,
          amount: r.data.amount,
          dateRaw: dateMatch ? dateMatch[0] : '?',
          currency: isUSD ? 'USD' : (isEUR ? 'EUR' : '?'),
          firstLines: (r.rawText || '').substring(0, 200).replace(/\n/g, ' | '),
        });
        console.log(' → ' + empresa + ' ' + (r.data.amount || '?') + ' ' + (isUSD?'USD':isEUR?'EUR':'?'));
      } else {
        console.log(' → ❌ no detectado');
      }
    } catch (e) {
      console.log(' → 💥 error:', e.message);
    }
  }

  console.log('');
  console.log('═'.repeat(80));
  console.log('🔍 CRUZANDO CON LAS 27 FALTANTES');
  console.log('═'.repeat(80));

  // Para cada faltante, buscar candidato
  for (const falta of FALTAN) {
    console.log('');
    console.log('❓ ' + falta.num + ' · ' + falta.company + ' · ' + falta.amount + '€ · ' + falta.date);

    // Buscar coincidencias
    const candidatos = analyzed.filter(a => {
      const empMatch = a.empresa.toLowerCase().includes(falta.company.toLowerCase().split(' ')[0])
        || falta.company.toLowerCase().includes(a.empresa.toLowerCase());
      return empMatch;
    });

    if (candidatos.length === 0) {
      console.log('   ⚠️  Sin coincidencia por empresa');
      continue;
    }

    for (const c of candidatos) {
      // Calcular conversion USD si aplica
      const amount = c.amount;
      const amountEUR_si_USD = amount ? amount / 1.15 : null;
      const matchEUR = amount && Math.abs(amount - falta.amount) < 0.5;
      const matchUSD = amountEUR_si_USD && Math.abs(amountEUR_si_USD - falta.amount) < 0.5;
      const flag = matchEUR ? '✅ MATCH EUR' : matchUSD ? '✅ MATCH USD→EUR' : '   no coincide';
      console.log('   ' + flag + ' | ' + c.file.padEnd(50).substring(0,50) + ' | ' + amount + ' | fecha: ' + c.dateRaw);
    }
  }

  console.log('');
  console.log('═'.repeat(80));
  console.log('📋 TODOS LOS PDFs ANALIZADOS:');
  console.log('═'.repeat(80));
  for (const a of analyzed) {
    console.log('  · ' + a.file.padEnd(50).substring(0,50) + ' | ' + a.empresa.padEnd(20).substring(0,20) + ' | ' + (a.amount||'?').toString().padStart(8) + ' ' + a.currency + ' | ' + a.dateRaw);
  }
}

main().catch(e => console.error('💥', e));
