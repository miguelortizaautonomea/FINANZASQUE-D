// Renombrar el campo file_name en BBDD: "N-Mes-Empresa.pdf" → "Mes-N-Empresa.pdf"
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://cmjnvamxnregpuamoxxu.supabase.co',
  'sb_publishable_m1kzzGncftRhSzj45JIcRQ_h9VTizgG'
);

// Obtener TODAS las facturas (paginando si es necesario)
async function main() {
  console.log('🚀 RENOMBRANDO file_name en BBDD\n');

  // Traer todo
  const { data: all, error } = await supabase
    .from('invoices')
    .select('id, file_name, number, company, date');

  if (error) { console.log('❌', error.message); return; }
  console.log('Total entradas a revisar:', all.length);

  // Filtrar las que tengan formato "N-Mes-XXX.pdf" o "N-MesX-XXX.pdf"
  // Patrón: empieza con dígitos + guion + 3 letras de mes
  const MONTH_PATTERN = /^(\d+)-([A-Z][a-z]{2})-(.+)\.pdf$/;

  const toUpdate = [];
  for (const row of all) {
    if (!row.file_name) continue;
    const m = row.file_name.match(MONTH_PATTERN);
    if (m) {
      const number = m[1];
      const month = m[2];
      const rest = m[3];
      const newName = `${month}-${number}-${rest}.pdf`;
      if (newName !== row.file_name) {
        toUpdate.push({ id: row.id, old: row.file_name, new: newName, number: row.number });
      }
    }
  }

  console.log('\n📋 Entradas a renombrar:', toUpdate.length);
  for (const u of toUpdate.slice(0, 20)) {
    console.log(`  ${u.old}  →  ${u.new}`);
  }
  if (toUpdate.length > 20) console.log(`  ... y ${toUpdate.length - 20} más`);

  if (toUpdate.length === 0) {
    console.log('\n✅ No hay nada que renombrar.');
    return;
  }

  console.log('\n💾 Actualizando BBDD...');
  let ok = 0, ko = 0;
  for (const u of toUpdate) {
    const { error: e } = await supabase.from('invoices').update({ file_name: u.new }).eq('id', u.id);
    if (e) { ko++; console.log('  ❌', u.old, ':', e.message); }
    else ok++;
  }

  console.log(`\n🎉 RESULTADO: ${ok} renombradas, ${ko} errores`);
}

main().catch(e => console.error('💥', e));
