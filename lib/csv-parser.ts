export interface CSVRow {
  Fecha: string;
  Descripción: string;
  Categoría: string;
  Tipo: string;
  Cantidad: string;
  Método: string;
  Notas: string;
}

export interface ParsedInvoice {
  id: string;
  type: 'income' | 'expense';
  category: string;
  number: string;
  company: string;
  amount: number;
  amountWithoutVAT: number;
  vat: number;
  date: string;
  fileName: string;
}

export function parseCSV(csvText: string): ParsedInvoice[] {
  const lines = csvText.split('\n').filter(line => line.trim());
  const headers = lines[0].split(',').map(h => h.trim());

  const invoices: ParsedInvoice[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    // Skip header sections and empty lines
    if (!line.trim() || line.includes('ENERO') || line.includes('FEBRERO') ||
        line.includes('MARZO') || line.includes('Abril') || line.includes('Mayo') ||
        line.includes('JUNIO') || line.includes('JULIO') || line.includes('AGOSTO') ||
        line.includes('SEPTIEMBRE') || line.includes('OCTUBRE') || line.includes('NOVIEMBRE') ||
        line.includes('DICIEMBRE') || line.startsWith('-,-') || line === ',,,,,,,,,') {
      continue;
    }

    // Parse CSV line (handle quoted values)
    const values = parseCSVLine(line);

    if (values.length < 5) continue;

    const fecha = values[0]?.trim();
    const descripcion = values[1]?.trim();
    const categoria = values[2]?.trim();
    const tipo = values[3]?.trim();
    const cantidad = values[4]?.trim();

    // Skip if missing critical fields
    if (!fecha || !tipo || !cantidad) continue;

    // Skip invalid dates
    if (!isValidDate(fecha)) continue;

    // Parse type
    const isIncome = tipo.toLowerCase().includes('ingreso');
    const isExpense = tipo.toLowerCase().includes('gasto');
    if (!isIncome && !isExpense) continue;

    // Parse amount
    const amount = parseAmount(cantidad);
    if (amount === 0) continue;

    // Convert date format from DD/MM/YYYY to YYYY-MM-DD
    const dateObj = parseDateDDMMYYYY(fecha);
    if (!dateObj) continue;

    const formattedDate = dateObj.toISOString().split('T')[0];

    const invoice: ParsedInvoice = {
      id: `csv_${i}_${Date.now()}`,
      type: isIncome ? 'income' : 'expense',
      category: categoria || (isIncome ? 'Ingreso' : 'Otros'),
      number: descripcion || `${categoria}-${i}`,
      company: descripcion || 'Sin empresa',
      amount,
      amountWithoutVAT: amount, // No VAT data in CSV
      vat: 0,
      date: formattedDate,
      fileName: `csv_import_${formattedDate}.csv`,
    };

    invoices.push(invoice);
  }

  return invoices;
}

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

  // Remove € and spaces
  let cleaned = amount.replace(/[€\s]/g, '');

  // Handle European format (comma as decimal separator)
  cleaned = cleaned.replace(',', '.');

  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseDateDDMMYYYY(dateStr: string): Date | null {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;

  let day = parseInt(parts[0], 10);
  let month = parseInt(parts[1], 10);
  let year = parseInt(parts[2], 10);

  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

  // Handle 2-digit years
  if (year < 100) {
    year = year < 70 ? 2000 + year : 1900 + year;
  }

  const date = new Date(year, month - 1, day);

  if (date.getDate() !== day || date.getMonth() !== month - 1) return null;

  return date;
}

function isValidDate(dateStr: string): boolean {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return false;

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);

  return !isNaN(day) && !isNaN(month) && !isNaN(year) &&
         day >= 1 && day <= 31 && month >= 1 && month <= 12 &&
         (year >= 2000 || (year >= 0 && year < 100));
}
