import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://cmjnvamxnregpuamoxxu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_m1kzzGncftRhSzj45JIcRQ_h9VTizgG';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function parseAmount(amount) {
  if (!amount) return 0;
  let cleaned = amount.replace(/[€\s]/g, '');
  cleaned = cleaned.replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseDateDDMMYYYY(dateStr) {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;

  let day = parseInt(parts[0], 10);
  let month = parseInt(parts[1], 10);
  let year = parseInt(parts[2], 10);

  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  if (year < 100) year = year < 70 ? 2000 + year : 1900 + year;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1) return null;

  return date.toISOString().split('T')[0];
}

async function migrate() {
  console.log('🚀 Iniciando migración a Supabase...');

  // Verificar si ya hay datos
  const { count, error: countError } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('❌ Error verificando datos:', countError.message);
    return;
  }

  if (count > 0) {
    console.log(`⚠️  Ya existen ${count} registros. Eliminando para hacer migración limpia...`);
    const { error: deleteError } = await supabase
      .from('invoices')
      .delete()
      .neq('id', 'never_match');
    if (deleteError) {
      console.error('❌ Error eliminando:', deleteError.message);
      return;
    }
    console.log('✅ Datos anteriores eliminados.');
  }

  // Leer CSV
  const csvPath = join(__dirname, '..', 'public', 'combined.csv');
  console.log(`📂 Leyendo CSV: ${csvPath}`);
  const csvText = readFileSync(csvPath, 'utf-8');

  const lines = csvText.split('\n').filter(line => line.trim());
  const invoices = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    if (!line.trim() || line.includes('ENERO') || line.includes('FEBRERO') ||
        line.includes('MARZO') || line.includes('Abril') || line.includes('Mayo') ||
        line.includes('JUNIO') || line.includes('JULIO') || line.includes('AGOSTO') ||
        line.includes('SEPTIEMBRE') || line.includes('OCTUBRE') || line.includes('NOVIEMBRE') ||
        line.includes('DICIEMBRE') || line.startsWith('-,-')) {
      continue;
    }

    const values = parseCSVLine(line);
    if (values.length < 5) continue;

    const fecha = values[0]?.trim();
    const descripcion = values[1]?.trim();
    const categoria = values[2]?.trim();
    const tipo = values[3]?.trim();
    const cantidad = values[4]?.trim();
    const metodo = values[5]?.trim();

    if (!fecha || !tipo || !cantidad) continue;

    const isIncome = tipo.toLowerCase().includes('ingreso');
    const isExpense = tipo.toLowerCase().includes('gasto');
    if (!isIncome && !isExpense) continue;

    const amount = parseAmount(cantidad);
    if (amount === 0) continue;

    const formattedDate = parseDateDDMMYYYY(fecha);
    if (!formattedDate) continue;

    invoices.push({
      id: `csv_${i}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      type: isIncome ? 'income' : 'expense',
      category: categoria || (isIncome ? 'Ingreso' : 'Otros'),
      number: descripcion || `${categoria}-${i}`,
      company: descripcion || 'Sin empresa',
      amount,
      amount_without_vat: amount,
      vat: 0,
      date: formattedDate,
      file_name: 'csv_import.csv',
      method: metodo || 'Otro',
      has_invoice: false,
    });
  }

  console.log(`📊 Total facturas parseadas: ${invoices.length}`);

  // Insertar en batches de 50
  const batchSize = 50;
  let inserted = 0;

  for (let i = 0; i < invoices.length; i += batchSize) {
    const batch = invoices.slice(i, i + batchSize);
    const { error } = await supabase.from('invoices').insert(batch);
    if (error) {
      console.error(`❌ Error en batch ${i / batchSize + 1}:`, error.message);
      console.error('Detalles:', error);
      return;
    }
    inserted += batch.length;
    console.log(`✅ Insertados ${inserted}/${invoices.length}`);
  }

  console.log(`\n🎉 Migración completada: ${inserted} registros en Supabase!`);
}

migrate().catch(console.error);
