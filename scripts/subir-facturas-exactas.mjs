// Sube las 13 facturas EXACTAS al Drive vía webhook de n8n + actualiza BBDD
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const supabase = createClient(
  'https://cmjnvamxnregpuamoxxu.supabase.co',
  'sb_publishable_m1kzzGncftRhSzj45JIcRQ_h9VTizgG'
);

const SOURCE = '/Users/miguelangelortizcruz/Desktop/revisar facturas';
const DRIVE_WEBHOOK = 'https://primary-production-dda1c.up.railway.app/webhook/factura-gasto';

const FACTURAS = [
  // ABRIL
  { id_html: 'abr_3',  number: '3-Abr',  pdf: 'Invoice-AB0HL32L-0012.pdf',         newName: 'Abr-3-GoHighLevel.pdf' },
  { id_html: 'abr_5',  number: '5-Abr',  pdf: 'Invoice-B0DPSBZ1-0013.pdf',         newName: 'Abr-5-Railway.pdf' },
  { id_html: 'abr_11', number: '11-Abr', pdf: 'Smartlead(2).pdf',                  newName: 'Abr-11-Smartlead.pdf' },
  { id_html: 'abr_12', number: '12-Abr', pdf: 'Stripe Abril Gastos (1).pdf',       newName: 'Abr-12-Stripe.pdf' },
  // MAYO
  { id_html: 'may_2',  number: '2-May',  pdf: 'FACTURA MESA ELEVABLE AMAZON 1.pdf', newName: 'May-2-Amazon.pdf' },
  { id_html: 'may_3',  number: '3-May',  pdf: 'FACTURA PIZZARRA AMAZN 2.pdf',       newName: 'May-3-Amazon.pdf' },
  { id_html: 'may_5',  number: '5-May',  pdf: 'Invoice-AB0HL32L-0014.pdf',         newName: 'May-5-GoHighLevel.pdf' },
  { id_html: 'may_6',  number: '6-May',  pdf: 'Invoice-AB0HL32L-0015.pdf',         newName: 'May-6-GoHighLevel.pdf' },
  { id_html: 'may_7',  number: '7-May',  pdf: 'Invoice-B0DPSBZ1-0014.pdf',         newName: 'May-7-Railway.pdf' },
  // JUNIO
  { id_html: 'jun_1',  number: '1-Jun',  pdf: 'FACTURA AMAZN 4.pdf',               newName: 'Jun-1-Amazon.pdf' },
  { id_html: 'jun_2',  number: '2-Jun',  pdf: 'FACTURA AMAZN 6.pdf',               newName: 'Jun-2-Amazon.pdf' },
  { id_html: 'jun_3',  number: '3-Jun',  pdf: 'FACTURA AMZN 3.pdf',                newName: 'Jun-3-Amazon.pdf' },
  { id_html: 'jun_4',  number: '4-Jun',  pdf: 'FACTURRA AMAZN 5.pdf',              newName: 'Jun-4-Amazon.pdf' },
];

const exitos = [];
const fallos = [];

async function uploadOne(item, idx) {
  console.log(`\n[${idx+1}/${FACTURAS.length}] ${item.newName}`);

  // 1) Leer PDF
  const path = join(SOURCE, item.pdf);
  let buffer;
  try {
    buffer = readFileSync(path);
  } catch (e) {
    console.log('   ❌ No se encontró el PDF:', item.pdf);
    fallos.push({ ...item, error: 'PDF no encontrado' });
    return;
  }

  // 2) Subir a Drive vía webhook
  const fd = new FormData();
  const blob = new Blob([buffer], { type: 'application/pdf' });
  fd.append('file', blob, item.newName);
  fd.append('fileName', item.newName);
  fd.append('company', item.newName.replace(/\.pdf$/, '').split('-').slice(2).join('-'));

  try {
    const res = await fetch(DRIVE_WEBHOOK, { method: 'POST', body: fd });
    const txt = await res.text();
    if (!res.ok) {
      console.log('   ❌ HTTP', res.status, ':', txt.substring(0, 100));
      fallos.push({ ...item, error: 'HTTP ' + res.status });
      return;
    }
    const j = JSON.parse(txt);
    console.log('   ✅ Drive:', j.link);

    // 3) Actualizar file_name en BBDD
    const { error: dbErr } = await supabase
      .from('invoices')
      .update({ file_name: item.newName })
      .eq('type', 'expense')
      .eq('has_invoice', true)
      .eq('number', item.number);
    if (dbErr) {
      console.log('   ⚠️  Error BBDD:', dbErr.message);
    } else {
      console.log('   ✅ BBDD actualizada:', item.number, '→ file_name:', item.newName);
    }
    exitos.push(item);
  } catch (e) {
    console.log('   💥', e.message);
    fallos.push({ ...item, error: e.message });
  }
}

async function main() {
  console.log('🚀 SUBIENDO 13 FACTURAS EXACTAS A DRIVE\n' + '='.repeat(60));
  for (let i = 0; i < FACTURAS.length; i++) {
    await uploadOne(FACTURAS[i], i);
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMEN FINAL');
  console.log('='.repeat(60));
  console.log('✅ Éxitos: ' + exitos.length);
  console.log('❌ Fallos: ' + fallos.length);
  if (fallos.length > 0) {
    console.log('\nFallos:');
    for (const f of fallos) console.log('  ·', f.number, '|', f.pdf, '| Error:', f.error);
  }

  // Generar lista de IDs para pre-marcar en HTML
  console.log('\n📋 IDs a marcar en HTML:');
  console.log('   ', exitos.map(e => "'" + e.id_html + "'").join(', '));
}

main().catch(e => console.error('💥', e));
