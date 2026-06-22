// Test de generación de PDF COMPLETO igual al del panel
import { jsPDF } from 'jspdf';
import { writeFileSync } from 'fs';

const issueData = {
  clientBlock: "Racks Labs S.L.\nNIF: B12345678\nCalle Falsa 123\n28001 Madrid\nEspaña",
  concept: "Servicios de consultoría técnica, automatización n8n, integración WhatsApp y configuración avanzada de pipelines",
  units: "1",
  pricePerUnit: "1500",
  hasIVA: true,
};

const invoiceFullNumber = "029-2026";
const today = "2026-06-22";

const parseClientBlock = (block) => {
  const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return { name: 'Cliente', htmlLines: '' };
  return { name: lines[0], htmlLines: '' };
};
const clientInfo = parseClientBlock(issueData.clientBlock);

const units = parseFloat(issueData.units) || 1;
const pricePerUnit = parseFloat(issueData.pricePerUnit) || 0;
const subtotal = units * pricePerUnit;
const iva = issueData.hasIVA ? subtotal * 0.21 : 0;
const total = subtotal + iva;

const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

const BLUE = [30, 64, 175];
const BLACK = [26, 26, 26];
const GRAY = [107, 114, 128];
const LIGHT_GRAY = [229, 231, 235];
const BG_BLUE = [239, 246, 255];

let y = 20;

doc.setFontSize(20);
doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]);
doc.setFont('helvetica', 'bold');
doc.text('Miguel Ángel Ortiz Cruz', 15, y);

doc.setFontSize(8);
doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
doc.setFont('helvetica', 'normal');
doc.text('FACTURA', 195, y - 5, { align: 'right' });
doc.setFontSize(18);
doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
doc.setFont('helvetica', 'bold');
doc.text(`Nº ${invoiceFullNumber}`, 195, y + 2, { align: 'right' });
doc.setFontSize(9);
doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
doc.setFont('helvetica', 'normal');
const dateFormatted = new Date(today).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
doc.text(dateFormatted, 195, y + 7, { align: 'right' });

y += 6;
doc.setFontSize(8);
doc.setTextColor(74, 74, 74);
doc.text('NIF: 49549728T', 15, y);
y += 4;
doc.text('Calle Alemania 55', 15, y);
y += 4;
doc.text('21110 Aljaraque (Huelva), España', 15, y);
y += 4;
doc.text('miguelortizpersonal12@gmail.com', 15, y);

y += 5;
doc.setDrawColor(BLUE[0], BLUE[1], BLUE[2]);
doc.setLineWidth(0.7);
doc.line(15, y, 195, y);

y += 10;
doc.setFontSize(8);
doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]);
doc.setFont('helvetica', 'bold');
doc.text('FACTURAR A', 15, y);

y += 2;
doc.setDrawColor(LIGHT_GRAY[0], LIGHT_GRAY[1], LIGHT_GRAY[2]);
doc.setLineWidth(0.2);
doc.line(15, y, 195, y);

y += 6;
doc.setFillColor(BLUE[0], BLUE[1], BLUE[2]);
doc.rect(15, y - 2, 1.5, 25, 'F');

doc.setFontSize(12);
doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
doc.setFont('helvetica', 'bold');
doc.text(clientInfo.name, 20, y + 2);

doc.setFontSize(9);
doc.setFont('helvetica', 'normal');
doc.setTextColor(74, 74, 74);
const clientLines = issueData.clientBlock.split('\n').map(l => l.trim()).filter(l => l.length > 0).slice(1);
let clientY = y + 7;
for (const line of clientLines) {
  doc.text(line, 20, clientY);
  clientY += 4;
}
y = Math.max(y + 25, clientY + 2);

y += 5;
doc.setFontSize(8);
doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]);
doc.setFont('helvetica', 'bold');
doc.text('CONCEPTOS', 15, y);

y += 4;
doc.setFillColor(BLUE[0], BLUE[1], BLUE[2]);
doc.rect(15, y, 180, 8, 'F');
doc.setTextColor(255, 255, 255);
doc.setFontSize(8);
doc.setFont('helvetica', 'bold');
doc.text('DESCRIPCIÓN', 17, y + 5);
doc.text('UDS.', 130, y + 5, { align: 'center' });
doc.text('PRECIO UNIT.', 160, y + 5, { align: 'center' });
doc.text('TOTAL', 192, y + 5, { align: 'right' });

y += 8;
doc.setDrawColor(LIGHT_GRAY[0], LIGHT_GRAY[1], LIGHT_GRAY[2]);
doc.setLineWidth(0.2);
doc.rect(15, y, 180, 16, 'S');
doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
doc.setFontSize(9);
doc.setFont('helvetica', 'normal');
const conceptLines = doc.splitTextToSize(issueData.concept || 'Servicio', 110);
doc.text(conceptLines, 17, y + 6);
doc.text(String(units), 130, y + 6, { align: 'center' });
doc.text(`${pricePerUnit.toFixed(2).replace('.', ',')} €`, 175, y + 6, { align: 'right' });
doc.setFont('helvetica', 'bold');
doc.text(`${(units * pricePerUnit).toFixed(2).replace('.', ',')} €`, 192, y + 6, { align: 'right' });

y += 20;

const totalsX = 115;
const totalsWidth = 80;

doc.setFontSize(9);
doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
doc.setFont('helvetica', 'normal');
doc.text('Base imponible', totalsX + 2, y);
doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
doc.setFont('helvetica', 'bold');
doc.text(`${subtotal.toFixed(2).replace('.', ',')} €`, totalsX + totalsWidth - 2, y, { align: 'right' });

y += 5;
doc.setDrawColor(LIGHT_GRAY[0], LIGHT_GRAY[1], LIGHT_GRAY[2]);
doc.line(totalsX, y - 2, totalsX + totalsWidth, y - 2);

doc.setFontSize(9);
doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
doc.setFont('helvetica', 'normal');
doc.text(`IVA (${issueData.hasIVA ? '21' : '0'} %)`, totalsX + 2, y);
doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
doc.setFont('helvetica', 'bold');
doc.text(`${iva.toFixed(2).replace('.', ',')} €`, totalsX + totalsWidth - 2, y, { align: 'right' });

y += 6;
doc.setFillColor(BG_BLUE[0], BG_BLUE[1], BG_BLUE[2]);
doc.rect(totalsX, y - 4, totalsWidth, 10, 'F');
doc.setDrawColor(BLUE[0], BLUE[1], BLUE[2]);
doc.setLineWidth(0.5);
doc.rect(totalsX, y - 4, totalsWidth, 10, 'S');

doc.setFontSize(11);
doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]);
doc.setFont('helvetica', 'bold');
doc.text('TOTAL A PAGAR', totalsX + 2, y + 2);
doc.text(`${total.toFixed(2).replace('.', ',')} €`, totalsX + totalsWidth - 2, y + 2, { align: 'right' });

y += 16;

doc.setDrawColor(BLUE[0], BLUE[1], BLUE[2]);
doc.setLineWidth(0.5);
doc.rect(15, y, 180, 22, 'S');
doc.setFontSize(8);
doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]);
doc.setFont('helvetica', 'bold');
doc.text('FORMA DE PAGO', 17, y + 5);

doc.setFontSize(9);
doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
doc.setFont('helvetica', 'normal');
doc.text('Transferencia bancaria al siguiente IBAN:', 17, y + 11);

doc.setFont('courier', 'bold');
doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]);
doc.text('ES82 2100 7144 1902 0012 5905', 17, y + 17);

y += 27;

doc.setFontSize(8);
doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
doc.setFont('helvetica', 'normal');

if (issueData.hasIVA) {
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
  doc.text('Forma de pago:', 15, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
  doc.text('Transferencia bancaria al IBAN indicado.', 45, y);
  y += 5;
  doc.text('Factura emitida con IVA 21 % según régimen general de autónomos en España.', 15, y);
} else {
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
  doc.text('OPERACIÓN EXTRACOMUNITARIA', 15, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
  const legalLines = doc.splitTextToSize('"NO SUJETA A IVA POR EL ART. 69 y 70 DE LA LEY 37/92 DEL IVA"', 180);
  doc.text(legalLines, 15, y);
  y += 4 * legalLines.length;
}

y += 5;
doc.setDrawColor(LIGHT_GRAY[0], LIGHT_GRAY[1], LIGHT_GRAY[2]);
doc.line(15, y, 195, y);
y += 4;
doc.setFontSize(7);
doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
doc.setFont('helvetica', 'italic');
doc.text('Esta factura ha sido generada electrónicamente · Conserve este documento como justificante', 105, y, { align: 'center' });

const blob = doc.output('arraybuffer');
writeFileSync('/tmp/test-invoice-full.pdf', Buffer.from(blob));
console.log('✅ PDF COMPLETO generado: /tmp/test-invoice-full.pdf');
console.log('   Tamaño:', Buffer.from(blob).length, 'bytes');
