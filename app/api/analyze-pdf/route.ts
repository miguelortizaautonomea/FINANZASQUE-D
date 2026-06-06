import { NextResponse, NextRequest } from 'next/server';

interface AnalyzedInvoice {
  invoiceNumber: string | null;  // Número de factura (ej: "12" de "012-2026")
  amount: number | null;          // Total bruto (con IVA si lo lleva)
  amountWithoutVAT: number | null; // Base imponible (sin IVA)
  vat: number | null;             // Monto del IVA
  ivaPercent: number;             // 21 o 0
  confidence: {
    invoiceNumber: 'high' | 'medium' | 'low';
    amount: 'high' | 'medium' | 'low';
    iva: 'high' | 'medium' | 'low';
  };
}

/**
 * Extrae el número de factura del texto.
 * Ejemplos:
 *   "Factura Nº 012-2026" → "12"
 *   "Invoice Nº 012-2026" → "12"
 *   "Nº: 012/2026" → "12"
 *   "Factura: INV-012" → "12"
 *   "FACTURA Nº 0042" → "42"
 */
function extractInvoiceNumber(text: string): string | null {
  // Patrones ordenados por especificidad
  const patterns = [
    // "Factura / Invoice Nº 012-2026"
    /(?:factura|invoice)[\s\/]*(?:n[º°ºo]\.?|num(?:ero)?|nr\.?|#)\s*:?\s*([A-Z]*-?)?(\d+)/i,
    // "Nº Factura: 012-2026"
    /(?:n[º°ºo]\.?|num(?:ero)?|nr\.?)\s*(?:factura|invoice)?\s*:?\s*([A-Z]*-?)?(\d+)/i,
    // "Factura: 012-2026"
    /(?:factura|invoice)\s*:\s*([A-Z]*-?)?(\d+)/i,
    // "Nº: 012"
    /n[º°ºo]\s*:?\s*([A-Z]*-?)?(\d+)/i,
    // "Invoice number: 012"
    /(?:invoice\s+number|n[uú]mero\s+de\s+factura)\s*:?\s*([A-Z]*-?)?(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[2]) {
      // Quitar ceros a la izquierda: "012" → "12"
      const num = match[2].replace(/^0+/, '');
      // Si todo eran ceros, devolver "0"
      return num || '0';
    }
  }

  return null;
}

/**
 * Extrae el importe total y la base imponible del PDF.
 * Detecta TOTAL (con IVA) y BASE IMPONIBLE.
 */
function extractAmounts(text: string): { total: number | null; base: number | null; vat: number | null; ivaPercent: number } {
  let total: number | null = null;
  let base: number | null = null;
  let vat: number | null = null;

  // Buscar TOTAL (con IVA)
  const totalPatterns = [
    /total\s*(?:factura|a\s*pagar|importe|invoice)?\s*[:\s]*€?\s*([\d.,]+)\s*€?/gi,
    /TOTAL[:\s]+€?\s*([\d.,]+)\s*€?/gi,
    /amount\s*(?:total|due)?\s*[:\s]*€?\s*([\d.,]+)\s*€?/gi,
    /importe\s*total[:\s]+€?\s*([\d.,]+)/gi,
  ];

  for (const pattern of totalPatterns) {
    const matches = Array.from(text.matchAll(pattern));
    if (matches.length > 0) {
      // Tomar la ÚLTIMA aparición (suele ser el total final)
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
    /net\s*amount[:\s]*€?\s*([\d.,]+)\s*€?/gi,
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

  // Buscar IVA específico
  const ivaAmountPatterns = [
    /iva\s*\(?\s*21\s*%\s*\)?[:\s]*€?\s*([\d.,]+)\s*€?/gi,
    /vat\s*\(?\s*21\s*%\s*\)?[:\s]*€?\s*([\d.,]+)\s*€?/gi,
    /iva[:\s]+€?\s*([\d.,]+)\s*€?/gi,
  ];

  for (const pattern of ivaAmountPatterns) {
    const matches = Array.from(text.matchAll(pattern));
    if (matches.length > 0) {
      const amount = parseFloat(matches[0][1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(amount) && amount > 0) {
        vat = amount;
        break;
      }
    }
  }

  // Detectar si tiene IVA 21% o no (0%)
  let ivaPercent = 0;

  // Indicios de IVA 21%
  const has21Percent = /(?:iva|vat).*21\s*%|21\s*%.*(?:iva|vat)/i.test(text);
  const hasIvaAmount = vat !== null && vat > 0;
  const hasBaseAndTotal = base !== null && total !== null && Math.abs((total - base) - base * 0.21) < 1;

  if (has21Percent || hasIvaAmount || hasBaseAndTotal) {
    ivaPercent = 21;

    // Si tenemos total pero no base, calcularla con 21%
    if (total !== null && base === null) {
      base = total / 1.21;
      vat = total - base;
    }
    // Si tenemos base pero no total, calcular total
    if (base !== null && total === null) {
      vat = base * 0.21;
      total = base + vat;
    }
    // Si tenemos total y base, calcular vat
    if (total !== null && base !== null && vat === null) {
      vat = total - base;
    }
  } else {
    // Sin IVA (clientes Andorra/Dubai)
    ivaPercent = 0;
    if (total !== null) {
      base = total;
      vat = 0;
    }
  }

  return { total, base, vat, ivaPercent };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No se subió ningún archivo' }, { status: 400 });
    }

    // Convertir File a Buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Extraer texto del PDF
    const pdfParse: any = require('pdf-parse/lib/pdf-parse.js');
    const pdfData = await pdfParse(buffer);
    const text = pdfData.text;

    if (!text || text.length < 10) {
      return NextResponse.json({
        error: 'No se pudo extraer texto del PDF. Puede ser un PDF escaneado.'
      }, { status: 400 });
    }

    // Extraer SOLO lo que el usuario pide
    const invoiceNumber = extractInvoiceNumber(text);
    const { total, base, vat, ivaPercent } = extractAmounts(text);

    const analyzed: AnalyzedInvoice = {
      invoiceNumber,
      amount: total,
      amountWithoutVAT: base,
      vat,
      ivaPercent,
      confidence: {
        invoiceNumber: invoiceNumber !== null ? 'high' : 'low',
        amount: total !== null ? 'high' : 'low',
        iva: vat !== null || ivaPercent === 0 ? 'high' : 'medium',
      },
    };

    return NextResponse.json({
      success: true,
      data: analyzed,
      rawText: text.substring(0, 500), // Para debugging
    });
  } catch (error: any) {
    console.error('Error analyzing PDF:', error);
    return NextResponse.json({
      error: error.message || 'Error analizando el PDF'
    }, { status: 500 });
  }
}
