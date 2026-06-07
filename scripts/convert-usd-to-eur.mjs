import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://cmjnvamxnregpuamoxxu.supabase.co',
  'sb_publishable_m1kzzGncftRhSzj45JIcRQ_h9VTizgG'
);

const USD_TO_EUR = 1 / 1.15; // 1 USD = 0.8696 EUR

// Servicios que típicamente facturan en USD
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
  console.log('🚀 CONVIRTIENDO IMPORTES DE USD → EUR\n');
  console.log(`💱 Cambio: 1 EUR = 1.15 USD (1 USD = ${USD_TO_EUR.toFixed(4)} EUR)\n`);

  // Obtener facturas de gasto con factura desde abril 2026
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

  console.log(`📊 Facturas a convertir: ${invoices.length}\n`);

  for (const inv of invoices) {
    const oldAmount = parseFloat(inv.amount);
    const newAmount = oldAmount * USD_TO_EUR;
    const newBase = newAmount / (inv.vat > 0 ? 1.21 : 1);
    const newVat = inv.vat > 0 ? newAmount - newBase : 0;

    console.log(`  💱 ${inv.number} - ${inv.company}`);
    console.log(`     $${oldAmount.toFixed(2)} → €${newAmount.toFixed(2)}`);

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
      console.log(`     ✅ Actualizado`);
    }
  }

  console.log(`\n🎉 ¡COMPLETADO! ${invoices.length} facturas convertidas a EUR`);
}

main().catch(console.error);
