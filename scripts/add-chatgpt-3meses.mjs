// Añadir 3 facturas ChatGPT (Abril, Mayo, Junio 2026)
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabase = createClient(
  'https://cmjnvamxnregpuamoxxu.supabase.co',
  'sb_publishable_m1kzzGncftRhSzj45JIcRQ_h9VTizgG'
);

const DRIVE_WEBHOOK = 'https://primary-production-dda1c.up.railway.app/webhook/factura-gasto';

const INVOICES = [
  {
    pdfPath: '/Users/miguelangelortizcruz/Desktop/fact abril-mayo de gastos/Invoice-FNGEFUOL-0005.pdf',
    number: '21-Abr',
    date: '2026-04-07',
    total: 23.00,
    driveName: '21-Abr-ChatGPT.pdf',
    description: 'Suscripción ChatGPT Abril 2026',
  },
  {
    pdfPath: '/Users/miguelangelortizcruz/Desktop/fact abril-mayo de gastos/Invoice-FNGEFUOL-0006.pdf',
    number: '24-May',
    date: '2026-05-07',
    total: 8.00,
    driveName: '24-May-ChatGPT.pdf',
    description: 'Suscripción ChatGPT Mayo 2026',
  },
  {
    pdfPath: '/Users/miguelangelortizcruz/Desktop/fact abril-mayo de gastos/Invoice-FNGEFUOL-0007.pdf',
    number: '22-Jun',
    date: '2026-06-07',
    total: 8.00,
    driveName: '22-Jun-ChatGPT.pdf',
    description: 'Suscripción ChatGPT Junio 2026',
  },
];

async function processOne(item, idx) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📄 [${idx+1}/3] ${item.driveName}`);
  console.log('='.repeat(60));

  const base = Math.round((item.total / 1.21) * 100) / 100;
  const vat = Math.round((item.total - base) * 100) / 100;

  const invoice = {
    id: `manual_chatgpt_${item.number}_${Date.now()}_${idx}`,
    type: 'expense',
    category: 'work',
    number: item.number,
    company: 'ChatGPT',
    description: item.description,
    amount: item.total,
    amount_without_vat: base,
    vat,
    date: item.date,
    file_name: item.driveName,
    method: 'Tarjeta',
    has_invoice: true,
    paid: true,
  };

  // 1) Supabase
  console.log('💾 Insertando en BBDD...');
  const { error: dbErr } = await supabase.from('invoices').insert([invoice]);
  if (dbErr) { console.log('   ❌', dbErr.message); return; }
  console.log('   ✅', item.number, '·', item.total + '€', '(IVA 21%)');

  // 2) Storage
  const buffer = readFileSync(item.pdfPath);
  const storagePath = `invoices/${item.driveName.replace('.pdf','')}-${Date.now()}.pdf`;
  const { error: sErr } = await supabase.storage.from('invoice-pdfs').upload(storagePath, buffer, { contentType: 'application/pdf', upsert: true });
  if (!sErr) {
    const url = supabase.storage.from('invoice-pdfs').getPublicUrl(storagePath).data.publicUrl;
    await supabase.from('invoices').update({ pdf_url: url }).eq('id', invoice.id);
    console.log('📁 Storage OK');
  }

  // 3) Drive
  console.log('☁️  Subiendo a Drive...');
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: 'application/pdf' }), item.driveName);
  fd.append('fileName', item.driveName);
  fd.append('company', 'ChatGPT');
  fd.append('amount', item.total.toString());

  const res = await fetch(DRIVE_WEBHOOK, { method: 'POST', body: fd });
  const text = await res.text();
  if (res.ok) {
    console.log('   ✅ OK');
    try { console.log('   🔗', JSON.parse(text).link); } catch {}
  } else {
    console.log('   ❌ HTTP', res.status, ':', text.substring(0, 200));
  }
}

async function main() {
  console.log('🚀 Añadiendo 3 facturas ChatGPT (Abril-Mayo-Junio 2026)\n');
  for (let i = 0; i < INVOICES.length; i++) {
    await processOne(INVOICES[i], i);
  }
  console.log('\n🎉 TODAS COMPLETADAS');
  console.log('   📋 21-Abr · ChatGPT · 23€');
  console.log('   📋 24-May · ChatGPT · 8€');
  console.log('   📋 22-Jun · ChatGPT · 8€');
  console.log('   💰 Total: 39€');
}

main().catch(e => console.error('💥', e));
