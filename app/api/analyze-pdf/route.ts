import { NextResponse, NextRequest } from 'next/server';

// Categorías y métodos válidos
const CATEGORIES = ['comidas', 'caballo', 'deporte', 'work', 'ocio', 'caprichos', 'viajes', 'campo', 'regalos', 'coche', 'desayuno'];
const METHODS = ['Tarjeta', 'Efectivo', 'Transferencia', 'Bizum', 'PayPal', 'Otro'];

interface AnalyzedInvoice {
  company: string;
  amount: number | null;
  amountWithoutVAT: number | null;
  vat: number | null;
  ivaPercent: number;
  date: string | null;
  category: string;
  method: string;
  number: string;
  confidence: {
    company: 'high' | 'medium' | 'low';
    amount: 'high' | 'medium' | 'low';
    date: 'high' | 'medium' | 'low';
  };
}

function extractAmount(text: string): { total: number | null; base: number | null; vat: number | null; ivaPercent: number } {
  const lines = text.split('\n');
  let total: number | null = null;
  let base: number | null = null;
  let vat: number | null = null;
  let ivaPercent = 21;

  // Buscar TOTAL (priorizar)
  const totalPatterns = [
    /total\s*(?:factura|a\s*pagar|importe)?\s*[:\s]*€?\s*([\d.,]+)\s*€?/gi,
    /TOTAL[:\s]+([\d.,]+)/gi,
    /importe\s*total[:\s]+([\d.,]+)/gi,
  ];

  for (const pattern of totalPatterns) {
    const matches = Array.from(text.matchAll(pattern));
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      const amount = parseFloat(lastMatch[1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(amount) && amount > 0) {
        total = amount;
        break;
      }
    }
  }

  // Buscar BASE IMPONIBLE
  const basePatterns = [
    /base\s*imponible[:\s]*€?\s*([\d.,]+)\s*€?/gi,
    /subtotal[:\s]*€?\s*([\d.,]+)\s*€?/gi,
    /importe\s*neto[:\s]*€?\s*([\d.,]+)\s*€?/gi,
  ];

  for (const pattern of basePatterns) {
    const matches = Array.from(text.matchAll(pattern));
    if (matches.length > 0) {
      const amount = parseFloat(matches[0][1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(amount) && amount > 0) {
        base = amount;
        break;
      }
    }
  }

  // Buscar IVA (porcentaje y monto)
  const ivaPattern = /iva\s*\(?\s*(\d+)\s*%\s*\)?[:\s]*€?\s*([\d.,]+)?\s*€?/gi;
  const ivaMatches = Array.from(text.matchAll(ivaPattern));
  if (ivaMatches.length > 0) {
    const match = ivaMatches[0];
    ivaPercent = parseInt(match[1]) || 21;
    if (match[2]) {
      const ivaAmount = parseFloat(match[2].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(ivaAmount) && ivaAmount > 0) {
        vat = ivaAmount;
      }
    }
  }

  // Si tenemos total y base, calcular IVA
  if (total !== null && base !== null && vat === null) {
    vat = total - base;
    ivaPercent = Math.round((vat / base) * 100);
  }

  // Si solo tenemos total, calcular base
  if (total !== null && base === null) {
    base = total / (1 + ivaPercent / 100);
    if (vat === null) {
      vat = total - base;
    }
  }

  return { total, base, vat, ivaPercent };
}

function extractDate(text: string): string | null {
  // Buscar fechas en varios formatos
  const datePatterns = [
    // DD/MM/YYYY o DD-MM-YYYY
    /(?:fecha[:\s]+)?(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/g,
    // YYYY-MM-DD
    /(\d{4})-(\d{1,2})-(\d{1,2})/g,
    // DD de mes de YYYY
    /(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/gi,
  ];

  const months: Record<string, number> = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  };

  // Buscar la primera fecha que aparezca después de "fecha:" o al inicio
  const fechaContextPattern = /fecha[:\s]+(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/i;
  const contextMatch = text.match(fechaContextPattern);
  if (contextMatch) {
    const day = contextMatch[1].padStart(2, '0');
    const month = contextMatch[2].padStart(2, '0');
    const year = contextMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Fallback: primera fecha en formato DD/MM/YYYY
  const firstDateMatch = text.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (firstDateMatch) {
    const day = firstDateMatch[1].padStart(2, '0');
    const month = firstDateMatch[2].padStart(2, '0');
    const year = firstDateMatch[3];
    // Validar año razonable
    if (parseInt(year) >= 2020 && parseInt(year) <= 2030) {
      return `${year}-${month}-${day}`;
    }
  }

  // Formato "DD de mes de YYYY"
  const textDatePattern = /(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i;
  const textMatch = text.match(textDatePattern);
  if (textMatch) {
    const day = textMatch[1].padStart(2, '0');
    const monthName = textMatch[2].toLowerCase();
    const monthNum = months[monthName];
    if (monthNum) {
      return `${textMatch[3]}-${String(monthNum).padStart(2, '0')}-${day}`;
    }
  }

  return null;
}

function extractCompany(text: string, type: 'income' | 'expense'): string {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Buscar líneas que parezcan nombre de empresa
  // Suelen estar al inicio del PDF
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const line = lines[i];

    // Saltar líneas con solo números, fechas, etc.
    if (/^[\d\s.,€%/-]+$/.test(line)) continue;
    if (line.length < 3 || line.length > 100) continue;

    // Patrones que indican que es nombre de empresa
    if (/^[A-Z]/.test(line) && (
      line.includes('S.L.') || line.includes('S.A.') ||
      line.includes('SL') || line.includes('SA') ||
      line.includes('S.L.U.') || line.includes('SLU') ||
      /^[A-Z][A-Za-z\s,]+$/.test(line)
    )) {
      return line;
    }
  }

  // Fallback: primera línea válida
  for (const line of lines.slice(0, 5)) {
    if (line.length >= 3 && line.length <= 100 && !/^[\d\s.,€%/-]+$/.test(line)) {
      return line;
    }
  }

  return type === 'income' ? 'Factura Ingreso' : 'Factura Gasto';
}

function suggestCategory(text: string, company: string): string {
  const textLower = (text + ' ' + company).toLowerCase();

  // Mapping de palabras clave → categoría
  const categoryKeywords: Record<string, string[]> = {
    work: ['software', 'hosting', 'dominio', 'workspace', 'google', 'microsoft', 'adobe',
           'subscription', 'saas', 'cloud', 'aws', 'azure', 'paypal', 'stripe', 'asesoría',
           'consultoría', 'gestoría', 'autónomo', 'fiverr', 'upwork', 'oficina'],
    comidas: ['restaurante', 'comida', 'mercadona', 'carrefour', 'lidl', 'aldi', 'supermercado',
              'café', 'bar', 'pizza', 'burger', 'mcdonalds', 'starbucks'],
    coche: ['gasolina', 'repsol', 'cepsa', 'shell', 'taller', 'itv', 'parking'],
    viajes: ['hotel', 'avión', 'tren', 'vuelo', 'iberia', 'vueling', 'ryanair', 'renfe', 'taxi', 'uber', 'cabify', 'booking'],
    deporte: ['gimnasio', 'gym', 'fitness', 'decathlon', 'nike', 'adidas', 'crossfit', 'wellness'],
    ocio: ['cine', 'teatro', 'spotify', 'netflix', 'amazon prime', 'disney', 'hbo'],
  };

  for (const [cat, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(kw => textLower.includes(kw))) {
      return cat;
    }
  }

  return 'work'; // Default para facturas suele ser work
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const type = (formData.get('type') as 'income' | 'expense') || 'expense';

    if (!file) {
      return NextResponse.json({ error: 'No se subió ningún archivo' }, { status: 400 });
    }

    // Convertir File a Buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Extraer texto del PDF usando pdf-parse (v1.1.1)
    // pdf-parse tiene un bug donde intenta leer un test file en producción
    // Hay que importarlo así para evitarlo
    const pdfParse: any = require('pdf-parse/lib/pdf-parse.js');
    const pdfData = await pdfParse(buffer);
    const text = pdfData.text;

    if (!text || text.length < 10) {
      return NextResponse.json({
        error: 'No se pudo extraer texto del PDF. Puede ser un PDF escaneado.'
      }, { status: 400 });
    }

    // Extraer datos
    const { total, base, vat, ivaPercent } = extractAmount(text);
    const date = extractDate(text);
    const company = extractCompany(text, type);
    const category = suggestCategory(text, company);

    const analyzed: AnalyzedInvoice = {
      company,
      amount: total,
      amountWithoutVAT: base,
      vat,
      ivaPercent,
      date,
      category,
      method: 'Tarjeta', // Default
      number: company,
      confidence: {
        company: company.length > 5 ? 'high' : 'medium',
        amount: total !== null ? 'high' : 'low',
        date: date !== null ? 'high' : 'low',
      },
    };

    return NextResponse.json({ success: true, data: analyzed, rawText: text.substring(0, 500) });
  } catch (error: any) {
    console.error('Error analyzing PDF:', error);
    return NextResponse.json({
      error: error.message || 'Error analizando el PDF'
    }, { status: 500 });
  }
}
