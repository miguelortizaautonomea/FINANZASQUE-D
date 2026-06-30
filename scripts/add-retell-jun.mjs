// Añadir Retell AI Junio 2026 (Nº 21-Jun)
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabase = createClient(
  'https://cmjnvamxnregpuamoxxu.supabase.co',
  'sb_publishable_m1kzzGncftRhSzj45JIcRQ_h9VTizgG'
);

const PDF_PATH = '/Users/miguelangelortizcruz/Desktop/Invoice-IS798S74-0003.pdf';
const DRIVE_WEBHOOK = 'https://primary-production-dda1c.up.railway.app/webhook/factura-gasto';

const TOTAL_EUR = 31.40 / 1.15;

const invoice = {
  id: `manual_retell_jun_${Date.now()}`,
  type: 'expense',
  category: 'work',
  number: '21-Jun',
  company: 'Retell AI',
  description: 'Retell Platform + Voice + ElevenLabs (may-jun 2026) [Original: 31.40 USD → ' + TOTAL_EUR.toFixed(2) + ' EUR]',
  amount: Math.round(TOTAL_EUR * 100) / 100,
  amount_without_vat: Math.round(TOTAL_EUR * 100) / 100,
  vat: 0,
  date: '2026-06-21',
  file_name: '21-Jun-RetellAI.pdf',
  method: 'Tarjeta',
  has_invoice: true,
  paid: true,
};

async function main() {
  console.log('🚀 Añadiendo Retell AI 21-Jun · ' + invoice.amount + '€\n');

  console.log('💾 1/3 Supabase...');
  const { error } = await supabase.from('invoices').insert([invoice]);
  if (error) { console.log('❌', error.message); return; }
  console.log('   ✅');

  console.log('\n📁 2/3 Storage...');
  const buffer = readFileSync(PDF_PATH);
  const path = `invoices/21-Jun-RetellAI-${Date.now()}.pdf`;
  const { error: sErr } = await supabase.storage.from('invoice-pdfs').upload(path, buffer, { contentType: 'application/pdf', upsert: true });
  if (sErr) console.log('   ⚠️ ', sErr.message);
  else {
    const url = supabase.storage.from('invoice-pdfs').getPublicUrl(path).data.publicUrl;
    await supabase.from('invoices').update({ pdf_url: url }).eq('id', invoice.id);
    console.log('   ✅', url);
  }

  console.log('\n☁️  3/3 Drive...');
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: 'application/pdf' }), '21-Jun-RetellAI.pdf');
  fd.append('fileName', '21-Jun-RetellAI.pdf');
  fd.append('company', 'Retell AI');
  fd.append('amount', invoice.amount.toString());
  const res = await fetch(DRIVE_WEBHOOK, { method: 'POST', body: fd });
  const text = await res.text();
  if (res.ok) {
    console.log('   ✅ OK');
    try { console.log('   🔗', JSON.parse(text).link); } catch { console.log('   📄', text.substring(0, 200)); }
  } else console.log('   ❌ HTTP', res.status, ':', text.substring(0, 200));

  console.log('\n🎉 21-Jun · Retell AI · ' + invoice.amount + '€');
}
main().catch(e => console.error('💥', e));
