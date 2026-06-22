// Test rápido de generación de PDF con jsPDF
import { jsPDF } from 'jspdf';
import { writeFileSync } from 'fs';

const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

const BLUE = [30, 64, 175];
const BLACK = [26, 26, 26];

doc.setFontSize(20);
doc.setTextColor(...BLUE);
doc.setFont('helvetica', 'bold');
doc.text('Miguel Ángel Ortiz Cruz', 15, 20);

doc.setFontSize(18);
doc.setTextColor(...BLACK);
doc.text('Nº 029-2026', 195, 22, { align: 'right' });

doc.setFontSize(12);
doc.text('Cliente: Racks Labs S.L.', 15, 50);

doc.setFontSize(14);
doc.setTextColor(...BLUE);
doc.text('TOTAL: 1815,00 €', 15, 100);

const blob = doc.output('arraybuffer');
writeFileSync('/tmp/test-invoice.pdf', Buffer.from(blob));
console.log('✅ PDF generado en /tmp/test-invoice.pdf');
console.log('   Tamaño:', Buffer.from(blob).length, 'bytes');
