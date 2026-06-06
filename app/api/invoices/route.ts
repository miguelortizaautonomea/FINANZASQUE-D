import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
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

function parseAmount(amount: string): number {
  if (!amount) return 0;
  let cleaned = amount.replace(/[€\s]/g, '');
  cleaned = cleaned.replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseDateDDMMYYYY(dateStr: string): string | null {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;

  let day = parseInt(parts[0], 10);
  let month = parseInt(parts[1], 10);
  let year = parseInt(parts[2], 10);

  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

  if (year < 100) {
    year = year < 70 ? 2000 + year : 1900 + year;
  }

  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  // Create date at midnight UTC to avoid timezone issues
  const date = new Date(Date.UTC(year, month - 1, day));

  // Validate the date
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1 || date.getUTCFullYear() !== year) {
    return null;
  }

  // Return ISO date string (YYYY-MM-DD)
  return date.toISOString().split('T')[0];
}

export async function GET() {
  try {
    // Try to read from root first, fallback to public
    let csvText: string;
    try {
      const filePath = join(process.cwd(), 'combined.csv');
      csvText = readFileSync(filePath, 'utf-8');
    } catch {
      // Fallback to public folder
      const publicPath = join(process.cwd(), 'public', 'combined.csv');
      csvText = readFileSync(publicPath, 'utf-8');
    }

    const lines = csvText.split('\n').filter(line => line.trim());
    const invoices: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      if (!line.trim() || line.includes('ENERO') || line.includes('FEBRERO') ||
          line.includes('MARZO') || line.includes('Abril') || line.includes('Mayo') ||
          line.includes('JUNIO') || line.includes('JULIO') || line.includes('AGOSTO') ||
          line.includes('SEPTIEMBRE') || line.includes('OCTUBRE') || line.includes('NOVIEMBRE') ||
          line.includes('DICIEMBRE') || line.startsWith('-,-') || line === ',,,,,,,,,') {
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
        id: `csv_${i}_${Date.now()}`,
        type: isIncome ? 'income' : 'expense',
        category: categoria || (isIncome ? 'Ingreso' : 'Otros'),
        number: descripcion || `${categoria}-${i}`,
        company: descripcion || 'Sin empresa',
        amount,
        amountWithoutVAT: amount,
        vat: 0,
        date: formattedDate,
        fileName: `csv_import.csv`,
        method: metodo || 'Otro',
      });
    }

    return NextResponse.json({ invoices });
  } catch (error) {
    return NextResponse.json({ invoices: [], error: 'Failed to load invoices' }, { status: 500 });
  }
}
