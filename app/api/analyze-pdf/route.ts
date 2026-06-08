import { NextResponse, NextRequest } from 'next/server';

interface AnalyzedInvoice {
  invoiceNumber: string | null;     // "12" de "Factura Nº 012-2026"
  company: string | null;           // "GHL TECHNOLOGIES S.L."
  description: string | null;       // "Servicios de consultoría web"
  amount: number | null;            // Total bruto
  amountWithoutVAT: number | null;  // Base imponible
  vat: number | null;               // Monto IVA
  ivaPercent: number;               // 21 o 0
}

/** Extrae el número de factura */
function extractInvoiceNumber(text: string): string | null {
  const patterns = [
    /(?:factura|invoice)[\s\/]*(?:n[º°ºo]\.?|num(?:ero)?|nr\.?|#)\s*:?\s*([A-Z]*-?)?(\d+)/i,
    /(?:n[º°ºo]\.?|num(?:ero)?|nr\.?)\s*(?:factura|invoice)?\s*:?\s*([A-Z]*-?)?(\d+)/i,
    /(?:factura|invoice)\s*:\s*([A-Z]*-?)?(\d+)/i,
    /n[º°ºo]\s*:?\s*([A-Z]*-?)?(\d+)/i,
    /(?:invoice\s+number|n[uú]mero\s+de\s+factura)\s*:?\s*([A-Z]*-?)?(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[2]) {
      const num = match[2].replace(/^0+/, '');
      return num || '0';
    }
  }
  return null;
}

/**
 * Extrae el nombre de la EMPRESA (razón social del proveedor/cliente).
 * Busca en las primeras líneas patrones de empresa.
 */
function extractCompany(text: string): string | null {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Patrones que identifican una razón social
  const companyPatterns = [
    /^([A-Z][A-Za-z0-9&\s,\.\-]{2,80}(?:\s+S\.?L\.?(?:U\.?)?|\s+S\.?A\.?|\s+S\.?L\.?L\.?|\s+SL|\s+SA|\s+SLU|\s+SLL|\s+INC\.?|\s+LLC\.?|\s+LTD\.?|\s+GmbH|\s+B\.?V\.?))/,
    /^([A-Z][A-Za-z0-9&\s,\.\-]{3,80}\s+(?:Technologies|Studio|Agency|Solutions|Services|Consulting|Group|Holding))/i,
  ];

  // Buscar en las primeras 25 líneas
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const line = lines[i];

    // Saltar líneas con solo números, fechas, símbolos
    if (/^[\d\s.,€%/\-+]+$/.test(line)) continue;
    if (line.length < 4 || line.length > 100) continue;

    for (const pattern of companyPatterns) {
      const match = line.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
  }

  // Fallback: buscar "Empresa:", "Cliente:", "Proveedor:", "Razón Social:"
  const explicitPatterns = [
    /(?:raz[oó]n\s*social|empresa|cliente|proveedor|company|client|vendor)[:\s]+([A-Z][A-Za-z0-9&\s,\.\-]{3,80})/i,
    /(?:facturar?\s+(?:a|para))[:\s]+([A-Z][A-Za-z0-9&\s,\.\-]{3,80})/i,
  ];

  for (const pattern of explicitPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim().replace(/[\n\r].*$/, '').trim();
    }
  }

  // Último fallback: primera línea válida (no número, no fecha)
  for (const line of lines.slice(0, 8)) {
    if (line.length >= 4 && line.length <= 100 &&
        !/^[\d\s.,€%/\-+]+$/.test(line) &&
        !/^(factura|invoice|fecha|date)/i.test(line)) {
      return line;
    }
  }

  return null;
}

/**
 * Extrae la DESCRIPCIÓN o concepto facturado.
 * Busca "Concepto:", "Descripción:", "Detalle:" o el primer concepto en la línea de detalle.
 */
function extractDescription(text: string): string | null {
  // Patrones explícitos
  const explicitPatterns = [
    /(?:concepto|descripci[oó]n|detalle|description|item|services?|servicio|services?\s+rendered|trabajo\s+realizado)[:\s]+([^\n\r]{5,200})/i,
    /(?:por\s+(?:concepto\s+de|los\s+servicios\s+de))[:\s]+([^\n\r]{5,200})/i,
  ];

  for (const pattern of explicitPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let desc = match[1].trim();
      // Limpiar el resultado
      desc = desc.replace(/\s+/g, ' ');
      // Cortar antes de palabras que indiquen fin
      desc = desc.split(/\s+(?:total|importe|base|iva|vat|subtotal|precio|qty|cantidad|unidades)/i)[0];
      // Truncar a tamaño razonable
      if (desc.length > 150) desc = desc.substring(0, 147) + '...';
      if (desc.length >= 5) return desc.trim();
    }
  }

  // Buscar líneas que parezcan concepto facturado
  // Suelen estar entre "Concepto" y "Total"
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);

  let inItemsSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Marca de inicio de sección de items
    if (/^(concepto|descripci|detalle|description|item|services|servicios)/i.test(line)) {
      inItemsSection = true;
      continue;
    }

    // Marca de fin
    if (inItemsSection && /^(total|importe\s*total|subtotal|base\s*imponible|iva|vat)/i.test(line)) {
      break;
    }

    // Línea de descripción dentro de sección
    if (inItemsSection && line.length >= 8 && line.length <= 200 &&
        !/^[\d\s.,€%/-]+$/.test(line)) {
      // Limpiar precios al final de la línea
      const cleaned = line.replace(/\s*[\d.,]+\s*€?\s*$/g, '').trim();
      if (cleaned.length >= 5) {
        return cleaned;
      }
    }
  }

  return null;
}

/** Extrae monto total, base e IVA */
function extractAmounts(text: string): { total: number | null; base: number | null; vat: number | null; ivaPercent: number } {
  let total: number | null = null;
  let base: number | null = null;
  let vat: number | null = null;

  // TOTAL
  const totalPatterns = [
    /total\s*(?:factura|a\s*pagar|importe|invoice)?\s*[:\s]*€?\s*([\d.,]+)\s*€?/gi,
    /TOTAL[:\s]+€?\s*([\d.,]+)\s*€?/gi,
    /amount\s*(?:total|due)?\s*[:\s]*€?\s*([\d.,]+)\s*€?/gi,
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

  // BASE IMPONIBLE
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

  // IVA monto
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

  let ivaPercent = 0;
  const has21Percent = /(?:iva|vat).*21\s*%|21\s*%.*(?:iva|vat)/i.test(text);
  const hasIvaAmount = vat !== null && vat > 0;
  const hasBaseAndTotal = base !== null && total !== null && Math.abs((total - base) - base * 0.21) < 1;

  if (has21Percent || hasIvaAmount || hasBaseAndTotal) {
    ivaPercent = 21;
    if (total !== null && base === null) {
      base = total / 1.21;
      vat = total - base;
    }
    if (base !== null && total === null) {
      vat = base * 0.21;
      total = base + vat;
    }
    if (total !== null && base !== null && vat === null) {
      vat = total - base;
    }
  } else {
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
    const manualData = formData.get('manualData') ? JSON.parse(formData.get('manualData') as string) : null;

    if (!file) {
      return NextResponse.json({ error: 'No se subió ningún archivo' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Intentar extraer texto con pdf-parse primero
    // IMPORTANTE: Aceptar incluso PDFs pequeños (desde 100 bytes)
    let text = '';
    try {
      const pdfParse: any = require('pdf-parse/lib/pdf-parse.js');
      // Permitir PDFs muy pequeños (> 100 bytes)
      if (buffer.length > 100) {
        const pdfData = await pdfParse(buffer);
        text = pdfData.text || '';
      }
    } catch (e: any) {
      // Si falla por cualquier razón (corrupto, muy pequeño, etc.), ignorar y continuar
      console.error('PDF parse error (será ignorado):', e.message);
      text = '';
    }

    // Si no se extrajo texto (PDF escaneado o muy pequeño), permitir datos manuales
    if (!text || text.length < 10) {
      // Si se proporcionaron datos manuales, usarlos
      if (manualData) {
        const analyzed: AnalyzedInvoice = {
          invoiceNumber: manualData.invoiceNumber || null,
          company: manualData.company || null,
          description: manualData.description || null,
          amount: manualData.amount ? parseFloat(manualData.amount) : null,
          amountWithoutVAT: manualData.amountWithoutVAT ? parseFloat(manualData.amountWithoutVAT) : null,
          vat: manualData.vat ? parseFloat(manualData.vat) : null,
          ivaPercent: manualData.ivaPercent || 0,
        };
        return NextResponse.json({
          success: true,
          data: analyzed,
          isManualEntry: true,
          rawText: 'Entrada manual (PDF pequeño o escaneado)',
        });
      }

      // Devolver error amigable que indique cómo proceder
      return NextResponse.json({
        error: 'No se pudo extraer texto del PDF. Parece ser un PDF escaneado o muy pequeño.',
        suggestion: 'Por favor, completa los datos manualmente en el formulario.',
        allowManualEntry: true
      }, { status: 400 });
    }

    const invoiceNumber = extractInvoiceNumber(text);
    const company = extractCompany(text);
    const description = extractDescription(text);
    const { total, base, vat, ivaPercent } = extractAmounts(text);

    const analyzed: AnalyzedInvoice = {
      invoiceNumber,
      company,
      description,
      amount: total,
      amountWithoutVAT: base,
      vat,
      ivaPercent,
    };

    return NextResponse.json({
      success: true,
      data: analyzed,
      rawText: text.substring(0, 500),
    });
  } catch (error: any) {
    console.error('Error analyzing PDF:', error);
    return NextResponse.json({
      error: error.message || 'Error analizando el PDF'
    }, { status: 500 });
  }
}
