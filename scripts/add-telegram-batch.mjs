// Insertar las 10 transacciones de Telegram (22-28 junio 2026)
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://cmjnvamxnregpuamoxxu.supabase.co',
  'sb_publishable_m1kzzGncftRhSzj45JIcRQ_h9VTizgG'
);

const TRANSACTIONS = [
  // 22 de junio
  { date: '2026-06-22', type: 'expense', category: 'viajes',  amount: 25.90, description: 'Bizum a Álvaro',         method: 'Bizum' },
  { date: '2026-06-22', type: 'expense', category: 'comidas', amount: 24.00, description: 'cena Lu corrales',      method: 'Tarjeta' },
  { date: '2026-06-22', type: 'expense', category: 'ocio',    amount: 8.00,  description: 'peluquería',            method: 'Tarjeta' },
  { date: '2026-06-22', type: 'expense', category: 'ocio',    amount: 7.00,  description: 'cejas',                 method: 'Tarjeta' },
  { date: '2026-06-22', type: 'expense', category: 'comidas', amount: 5.60,  description: 'desayuno',              method: 'Tarjeta' },
  // 23 de junio
  { date: '2026-06-23', type: 'expense', category: 'deporte', amount: 11.00, description: 'geles',                 method: 'Tarjeta' },
  // 26 de junio
  { date: '2026-06-26', type: 'expense', category: 'caballo', amount: 100.00, description: 'montas jairo 96 + 4',  method: 'Tarjeta' },
  // 27 de junio
  { date: '2026-06-27', type: 'expense', category: 'comidas', amount: 30.00, description: 'Greco Wernells',        method: 'Tarjeta' },
  // 28 de junio (hoy)
  { date: '2026-06-28', type: 'expense', category: 'work',    amount: 88.56, description: 'tasa autónomo junio',   method: 'Transferencia' },
  { date: '2026-06-28', type: 'income',  category: 'work',    amount: 1451,  description: 'declaración de la renta 2025', method: 'Transferencia' },
];

async function main() {
  console.log('🚀 Insertando 10 transacciones de Telegram\n');

  const rows = TRANSACTIONS.map((tx, idx) => {
    const timestamp = Date.now() + idx; // único por entrada
    const id = `telegram_${timestamp}_${Math.random().toString(36).substring(2, 9)}`;
    return {
      id,
      type: tx.type,
      category: tx.category,
      number: `TEL-${timestamp}`,
      company: tx.description,
      description: tx.description,
      amount: tx.amount,
      amount_without_vat: tx.amount,
      vat: 0,
      date: tx.date,
      file_name: 'telegram',
      method: tx.method,
      has_invoice: false,
      paid: true,
    };
  });

  // Mostrar resumen
  console.log('📋 Resumen de lo que voy a añadir:\n');
  let totalGastos = 0, totalIngresos = 0;
  for (const r of rows) {
    const emoji = r.type === 'income' ? '💰' : '💸';
    const sign = r.type === 'income' ? '+' : '-';
    console.log(`  ${emoji} ${r.date} | ${sign}${r.amount.toFixed(2)}€ | ${r.category.padEnd(8)} | ${r.description}`);
    if (r.type === 'income') totalIngresos += r.amount;
    else totalGastos += r.amount;
  }
  console.log('\n📊 TOTALES:');
  console.log(`   💸 Gastos:   ${totalGastos.toFixed(2)}€`);
  console.log(`   💰 Ingresos: ${totalIngresos.toFixed(2)}€`);
  console.log(`   📈 Balance:  ${(totalIngresos - totalGastos).toFixed(2)}€\n`);

  // Insertar
  console.log('💾 Insertando en Supabase...');
  const { data, error } = await supabase
    .from('invoices')
    .insert(rows)
    .select();

  if (error) {
    console.log('❌ ERROR:', error.message);
    return;
  }

  console.log(`✅ ${data.length} transacciones insertadas correctamente\n`);

  // Verificar
  const { data: check } = await supabase
    .from('invoices')
    .select('*')
    .like('id', 'telegram_%')
    .gte('date', '2026-06-22')
    .lte('date', '2026-06-28')
    .order('date', { ascending: true });

  console.log(`🔍 Verificación: ${check?.length || 0} entradas Telegram en BBDD (rango 22-28 junio)`);
}

main().catch(e => console.error('💥', e));
