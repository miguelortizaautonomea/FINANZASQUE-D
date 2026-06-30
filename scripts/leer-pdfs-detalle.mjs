// Lee el texto completo de cada PDF para identificar la factura
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

const SOURCE = '/Users/miguelangelortizcruz/Desktop/revisar facturas';

async function main() {
  const files = readdirSync(SOURCE).filter(f => f.toLowerCase().endsWith('.pdf')).sort();

  for (const file of files) {
    const buffer = readFileSync(join(SOURCE, file));
    const data = await pdfParse(buffer);
    const text = data.text || '';

    // Extraer línea con "$" o "€" y números
    const moneyLines = text.split('\n').filter(l => /\$|€/.test(l) && /\d/.test(l)).slice(0, 5);
    const dateMatch = text.match(/(\d{1,2})\s*(?:de\s)?(enero|febrero|marzo|abril|mayo|junio|julio|january|february|march|april|may|june|july)\s*(?:de\s)?(\d{4})/i)
      || text.match(/(january|february|march|april|may|june)\s+(\d{1,2}),?\s*(\d{4})/i)
      || text.match(/(\d{1,2})[\s\/-](\d{1,2})[\s\/-](\d{4})/);

    console.log('═'.repeat(80));
    console.log('📄', file);
    if (dateMatch) console.log('   📅 Fecha:', dateMatch[0]);
    for (const ml of moneyLines) console.log('   💰', ml.trim());
  }
}

main().catch(e => console.error('💥', e));
