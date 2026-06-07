import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://cmjnvamxnregpuamoxxu.supabase.co',
  'sb_publishable_m1kzzGncftRhSzj45JIcRQ_h9VTizgG'
);

const EUR_TO_USD = 1.15; // Multiplicar por 1.15 para deshacer la conversión

// Las que el usuario QUIERE mantener convertidas (NO tocar)
const KEEP_CONVERTED = ['10-Abr', '11-Abr', '12-Abr', '13-Abr'];

// Servicios SaaS que se convirtieron en el script anterior
const USD_COMPANIES = [
  'GoHighLevel',
  'Smartlead',
  'Stripe',
  'Zapmail',
  'Twilio',
  'Claude',
  'MillionVerifier',
  'Slack',
  'Railway',
  'OpenAI',
  'ChatGPT',
  'N8N',
  'Loom',
];

async function main() {
  console.log('🔄 REVIRTIENDO CONVERSIÓN USD→EUR (excepto facturas 9-13 de Abril)\n');

  // Obtener facturas que se convirtieron
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('type', 'expense')
    .eq('has_invoice', true)
    .gte('date', '2026-04-01')
    .in('company', USD_COMPANIES);

  if (error) {
    console.log('❌ Error:', error.message);
    return;
  }

  console.log(`📊 Encontradas ${invoices.length} facturas SaaS\n`);

  let reverted = 0;
  let kept = 0;

  for (const inv of invoices) {
    if (KEEP_CONVERTED.includes(inv.number)) {
      console.log(`  ⏸️  ${inv.number} - ${inv.company}: MANTENER (${parseFloat(inv.amount).toFixed(2)}€)`);
      kept++;
      continue;
    }

    const oldAmount = parseFloat(inv.amount);
    const newAmount = oldAmount * EUR_TO_USD;
    const newBase = newAmount / (inv.vat > 0 ? 1.21 : 1);
    const newVat = inv.vat > 0 ? newAmount - newBase : 0;

    console.log(`  🔄 ${inv.number} - ${inv.company}`);
    console.log(`     €${oldAmount.toFixed(2)} → $${newAmount.toFixed(2)}`);

    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        amount: newAmount,
        amount_without_vat: newBase,
        vat: newVat,
      })
      .eq('id', inv.id);

    if (updateError) {
      console.log(`     ❌ Error: ${updateError.message}`);
    } else {
      console.log(`     ✅ Revertido`);
      reverted++;
    }
  }

  console.log(`\n🎉 ¡COMPLETADO!`);
  console.log(`   🔄 Revertidas: ${reverted}`);
  console.log(`   ⏸️  Mantenidas convertidas: ${kept} (10-Abr a 13-Abr)`);
}

main().catch(console.error);
