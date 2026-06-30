// Añadir factura Railway Junio 2026 (Nº 20-Jun)
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabase = createClient(
  'https://cmjnvamxnregpuamoxxu.supabase.co',
  'sb_publishable_m1kzzGncftRhSzj45JIcRQ_h9VTizgG'
);

const PDF_PATH = '/Users/miguelangelortizcruz/Desktop/Invoice-B0DPSBZ1-0015.pdf';
const DRIVE_WEBHOOK = 'https://primary-production-dda1c.up.railway.app/webhook/factura-gasto';

// $18.12 USD ÷ 1.15 = 15.76€ total
const TOTAL_EUR = 18.12 / 1.15;
const BASE_EUR = TOTAL_EUR / 1.21;
const VAT_EUR = TOTAL_EUR - BASE_EUR;

const invoice = {
  id: `manual_railway_jun_${Date.now()}`,
  type: 'expense',
  category: 'work',
  number: '20-Jun',
  company: 'Railway',
  description: 'Pro plan (jun-jul 2026) [Original: 18.12 USD → ' + TOTAL_EUR.toFixed(2) + ' EUR]',
  amount: Math.round(TOTAL_EUR * 100) / 100,
  amount_without_vat: Math.round(BASE_EUR * 100) / 100,
  vat: Math.round(VAT_EUR * 100) / 100,
  date: '2026-06-21',
  file_name: '20-Jun-Railway.pdf',
  method: 'Tarjeta',
  has_invoice: true,
  paid: true,
};

async function main() {
  console.log('🚀 Añadiendo Railway 20-Jun · ' + invoice.amount + '€\n');

  // 1) Supabase
  console.log('💾 1/3 Insertando en Supabase...');
  const { error: dbError } = await supabase.from('invoices').insert([invoice]).select();
  if (dbError) { console.log('❌', dbError.message); return; }
  console.log('   ✅ ID:', invoice.id);

  // 2) Storage (intentamos pero no es crítico)
  console.log('\n📁 2/3 Subsiendo a Supabase Storage...');
  const buffer = readFileSync(PDF_PATH);
  const storagePath = `invoices/20-Jun-Railway-${Date.now()}.pdf`;
  const { error: storageError } = await supabase.storage
    .from('invoice-pdfs')
    .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: true });

  let pdfUrl = null;
  if (storageError) {
    console.log('   ⚠️  Storage error (bucket no existe):', storageError.message);
  } else {
    const { data: urlData } = supabase.storage.from('invoice-pdfs').getPublicUrl(storagePath);
    pdfUrl = urlData.publicUrl;
    await supabase.from('invoices').update({ pdf_url: pdfUrl }).eq('id', invoice.id);
    console.log('   ✅ URL:', pdfUrl);
  }

  // 3) Drive
  console.log('\n☁️  3/3 Subiendo a Google Drive...');
  const formData = new FormData();
  const blob = new Blob([buffer], { type: 'application/pdf' });
  formData.append('file', blob, '20-Jun-Railway.pdf');
  formData.append('fileName', '20-Jun-Railway.pdf');
  formData.append('company', 'Railway');
  formData.append('amount', invoice.amount.toString());

  const res = await fetch(DRIVE_WEBHOOK, { method: 'POST', body: formData });
  const text = await res.text();
  if (res.ok) {
    console.log('   ✅ Subida a Drive OK');
    try {
      const j = JSON.parse(text);
      console.log('   🔗 ', j.link);
    } catch { console.log('   📄', text.substring(0, 200)); }
  } else {
    console.log('   ❌ Error Drive HTTP', res.status, ':', text.substring(0, 200));
  }

  console.log('\n🎉 PROCESO COMPLETADO');
  console.log('   📋 20-Jun · Railway · ' + invoice.amount + '€ (IVA 21%)');
  console.log('   📅 Fecha: 21/06/2026');
}

main().catch(e => console.error('💥', e));
