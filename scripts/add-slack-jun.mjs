// Añadir factura de Slack Junio 2026
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabase = createClient(
  'https://cmjnvamxnregpuamoxxu.supabase.co',
  'sb_publishable_m1kzzGncftRhSzj45JIcRQ_h9VTizgG'
);

const PDF_PATH = '/Users/miguelangelortizcruz/Desktop/slack_invoice_SBIE-12005575.pdf';
const DRIVE_WEBHOOK = 'https://primary-production-dda1c.up.railway.app/webhook/factura-gasto';

const invoice = {
  id: `manual_slack_jun_${Date.now()}`,
  type: 'expense',
  category: 'work',
  number: '19-Jun',
  company: 'Slack',
  description: 'Plan mensual Pro (jun-jul 2026)',
  amount: 8.25,
  amount_without_vat: 8.25,
  vat: 0,
  date: '2026-06-21',
  file_name: '19-Jun-Slack.pdf',
  method: 'Tarjeta',
  has_invoice: true,
  paid: true,
};

async function main() {
  console.log('🚀 Añadiendo factura Slack Junio 2026\n');

  // 1) Insertar en Supabase
  console.log('💾 1/3 Insertando en Supabase...');
  const { data: dbResult, error: dbError } = await supabase
    .from('invoices')
    .insert([invoice])
    .select()
    .single();

  if (dbError) {
    console.log('❌ Error BBDD:', dbError.message);
    return;
  }
  console.log('   ✅ ID:', dbResult.id);

  // 2) Subir PDF a Supabase Storage
  console.log('\n📁 2/3 Subiendo PDF a Supabase Storage...');
  const buffer = readFileSync(PDF_PATH);
  const storagePath = `invoices/19-Jun-Slack-${Date.now()}.pdf`;

  const { error: storageError } = await supabase.storage
    .from('invoice-pdfs')
    .upload(storagePath, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  let pdfUrl = null;
  if (storageError) {
    console.log('   ⚠️  Error storage:', storageError.message);
  } else {
    const { data: urlData } = supabase.storage.from('invoice-pdfs').getPublicUrl(storagePath);
    pdfUrl = urlData.publicUrl;
    console.log('   ✅ URL:', pdfUrl);

    // Actualizar pdf_url en la BBDD
    await supabase.from('invoices').update({ pdf_url: pdfUrl }).eq('id', invoice.id);
  }

  // 3) Subir PDF a Google Drive vía webhook n8n
  console.log('\n☁️  3/3 Subiendo a Google Drive...');
  try {
    const formData = new FormData();
    const blob = new Blob([buffer], { type: 'application/pdf' });
    formData.append('file', blob, '19-Jun-Slack.pdf');
    formData.append('fileName', '19-Jun-Slack.pdf');
    formData.append('company', 'Slack');
    formData.append('amount', '8.25');

    const res = await fetch(DRIVE_WEBHOOK, {
      method: 'POST',
      body: formData,
    });

    const text = await res.text();
    if (res.ok) {
      console.log('   ✅ Subida a Drive OK');
      console.log('   📄 Respuesta:', text.substring(0, 200));
    } else {
      console.log('   ❌ Error Drive (HTTP ' + res.status + '):', text.substring(0, 200));
    }
  } catch (e) {
    console.log('   ❌ Error Drive:', e.message);
  }

  console.log('\n🎉 PROCESO COMPLETADO');
  console.log('   📋 Factura: 19-Jun · Slack · 8,25€');
  console.log('   📅 Fecha: 21/06/2026');
  console.log('   🆔 ID Supabase:', invoice.id);
  if (pdfUrl) console.log('   📎 PDF Storage:', pdfUrl);
}

main().catch(e => console.error('💥', e));
