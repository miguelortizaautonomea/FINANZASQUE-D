import { createClient } from '@supabase/supabase-js';
import { copyFileSync } from 'fs';
const supabase = createClient(
  'https://cmjnvamxnregpuamoxxu.supabase.co',
  'sb_publishable_m1kzzGncftRhSzj45JIcRQ_h9VTizgG'
);

const USD_TO_EUR = 1 / 1.15;
const SOURCE = `${process.env.HOME}/Desktop/fact pendientes`;
const DEST_GASTOS = `${process.env.HOME}/Desktop/Gastos`;

// Las 4 facturas detectadas
const INVOICES = [
  {
    sourceFile: '5553245508.pdf',
    newName: '14-Abr-GoogleWorkspace.pdf',
    destMonth: 'Abril',
    number: '14-Abr',
    company: 'Google Workspace',
    description: 'Suscripción Business Starter + Standard (Abril 2026)',
    amountEUR: 8.10,
    ivaPercent: 0,
    date: '2026-04-30',
  },
  {
    sourceFile: '5581102353.pdf',
    newName: '20-May-GoogleWorkspace.pdf',
    destMonth: 'Mayo',
    number: '20-May',
    company: 'Google Workspace',
    description: 'Suscripción Business Standard (Mayo 2026)',
    amountEUR: 15.94,
    ivaPercent: 0,
    date: '2026-05-31',
  },
  {
    sourceFile: 'INV-000001.pdf',
    newName: '21-May-ThePlaze.pdf',
    destMonth: 'Mayo',
    number: '21-May',
    company: 'The Plaze',
    description: 'Servicio (THE PLAZE LLC)',
    amountUSD: 80,
    ivaPercent: 0,
    date: '2026-05-19',
  },
  {
    sourceFile: 'Invoice - AA00689542.pdf',
    newName: '22-May-CircleClub.pdf',
    destMonth: 'Mayo',
    number: '22-May',
    company: 'Circle Club',
    description: 'Servicios EVER GLOW MARKET LLC',
    amountUSD: 697,
    ivaPercent: 0,
    date: '2026-05-16',
  },
];

async function main() {
  console.log('🚀 AÑADIENDO FACTURAS PENDIENTES\n');

  const toInsert = [];

  for (const inv of INVOICES) {
    // Calcular importe en EUR
    let amountEUR = inv.amountEUR;
    let originalNote = '';
    if (inv.amountUSD) {
      amountEUR = inv.amountUSD * USD_TO_EUR;
      originalNote = ` ($${inv.amountUSD} USD → €${amountEUR.toFixed(2)})`;
    }

    console.log(`📄 ${inv.number} - ${inv.company}`);
    console.log(`   💰 ${amountEUR.toFixed(2)}€${originalNote}`);

    // Copiar archivo renombrado
    try {
      copyFileSync(
        `${SOURCE}/${inv.sourceFile}`,
        `${DEST_GASTOS}/${inv.destMonth}/${inv.newName}`
      );
      console.log(`   📂 ${inv.destMonth}/${inv.newName}`);
    } catch (e) {
      console.log(`   ⚠️  No se pudo copiar: ${e.message}`);
    }

    // Calcular IVA
    const base = inv.ivaPercent === 21 ? amountEUR / 1.21 : amountEUR;
    const vat = inv.ivaPercent === 21 ? amountEUR - base : 0;

    toInsert.push({
      id: `gasto_${inv.number}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      type: 'expense',
      category: 'work',
      number: inv.number,
      company: inv.company,
      description: inv.description,
      amount: amountEUR,
      amount_without_vat: base,
      vat: vat,
      date: inv.date,
      file_name: inv.newName,
      method: 'Tarjeta',
      has_invoice: true,
      paid: true,
    });
    console.log();
  }

  console.log(`📤 Insertando ${toInsert.length} facturas en Supabase...\n`);
  const { error } = await supabase.from('invoices').insert(toInsert);
  if (error) {
    console.log('❌ Error:', error.message);
    return;
  }

  console.log('🎉 ¡COMPLETADO!');
  for (const inv of toInsert) {
    console.log(`   ✅ ${inv.number} - ${inv.company} → ${inv.amount.toFixed(2)}€`);
  }
}

main().catch(console.error);
