// Test E2E completo de todos los endpoints del panel
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://cmjnvamxnregpuamoxxu.supabase.co',
  'sb_publishable_m1kzzGncftRhSzj45JIcRQ_h9VTizgG'
);

const BASE = 'https://finanzasque-d.vercel.app';
const results = [];

function ok(name, msg = '') { results.push({ name, status: '✅', msg }); }
function fail(name, msg = '') { results.push({ name, status: '❌', msg }); }

// 1. GET /api/invoices
console.log('1️⃣  GET /api/invoices...');
try {
  const res = await fetch(`${BASE}/api/invoices`);
  const data = await res.json();
  if (res.ok && Array.isArray(data.invoices)) {
    ok('GET /api/invoices', `${data.invoices.length} facturas`);
  } else {
    fail('GET /api/invoices', `status ${res.status}`);
  }
} catch (e) {
  fail('GET /api/invoices', e.message);
}

// 2. POST /api/invoices (crear test)
console.log('2️⃣  POST /api/invoices...');
const testId = `test_e2e_${Date.now()}`;
try {
  const res = await fetch(`${BASE}/api/invoices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: testId,
      type: 'expense',
      category: 'work',
      number: 'TEST',
      company: 'E2E TEST',
      amount: 1.0,
      amountWithoutVAT: 1.0,
      vat: 0,
      date: '2026-06-18',
      fileName: 'test.pdf',
      method: 'Tarjeta',
      hasInvoice: false,
    }),
  });
  if (res.ok) {
    ok('POST /api/invoices', 'creación OK');
  } else {
    const err = await res.text();
    fail('POST /api/invoices', `status ${res.status}: ${err.substring(0, 200)}`);
  }
} catch (e) {
  fail('POST /api/invoices', e.message);
}

// 3. PUT /api/invoices (actualizar)
console.log('3️⃣  PUT /api/invoices...');
try {
  const res = await fetch(`${BASE}/api/invoices`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: testId,
      type: 'expense',
      category: 'work',
      number: 'TEST-UPD',
      company: 'E2E TEST UPDATED',
      amount: 2.0,
      amountWithoutVAT: 2.0,
      vat: 0,
      date: '2026-06-18',
      fileName: 'test.pdf',
      method: 'Tarjeta',
      hasInvoice: false,
    }),
  });
  if (res.ok) ok('PUT /api/invoices', 'actualización OK');
  else fail('PUT /api/invoices', `status ${res.status}`);
} catch (e) {
  fail('PUT /api/invoices', e.message);
}

// 4. DELETE /api/invoices
console.log('4️⃣  DELETE /api/invoices...');
try {
  const res = await fetch(`${BASE}/api/invoices?id=${testId}`, { method: 'DELETE' });
  if (res.ok) ok('DELETE /api/invoices', 'eliminación OK');
  else fail('DELETE /api/invoices', `status ${res.status}`);
} catch (e) {
  fail('DELETE /api/invoices', e.message);
}

// 5. POST /api/upload-pdf (sin file)
console.log('5️⃣  POST /api/upload-pdf...');
try {
  const fd = new FormData();
  const blob = new Blob(['%PDF-1.4\n%test\n%%EOF'], { type: 'application/pdf' });
  fd.append('file', blob, 'e2e-test.pdf');
  fd.append('fileName', 'e2e-test.pdf');
  const res = await fetch(`${BASE}/api/upload-pdf`, { method: 'POST', body: fd });
  const data = await res.json();
  if (res.ok && data.success) {
    ok('POST /api/upload-pdf', `URL: ${data.url?.substring(0, 60)}...`);
    // Limpiar el test
    const path = data.path;
    if (path) await supabase.storage.from('invoice-pdfs').remove([path]);
  } else {
    fail('POST /api/upload-pdf', data.error || `status ${res.status}`);
  }
} catch (e) {
  fail('POST /api/upload-pdf', e.message);
}

// 6. POST /api/analyze-pdf (sin file)
console.log('6️⃣  POST /api/analyze-pdf (sin file → debe dar 400)...');
try {
  const fd = new FormData();
  const res = await fetch(`${BASE}/api/analyze-pdf`, { method: 'POST', body: fd });
  if (res.status === 400) ok('POST /api/analyze-pdf', 'validación OK (400 sin file)');
  else fail('POST /api/analyze-pdf', `esperaba 400, recibí ${res.status}`);
} catch (e) {
  fail('POST /api/analyze-pdf', e.message);
}

// 7. POST /api/invoices/from-email (sin file)
console.log('7️⃣  POST /api/invoices/from-email (sin file → debe dar 400)...');
try {
  const fd = new FormData();
  const res = await fetch(`${BASE}/api/invoices/from-email`, { method: 'POST', body: fd });
  if (res.status === 400) ok('POST /api/invoices/from-email', 'validación OK (400 sin file)');
  else fail('POST /api/invoices/from-email', `esperaba 400, recibí ${res.status}`);
} catch (e) {
  fail('POST /api/invoices/from-email', e.message);
}

// Cleanup: borrar cualquier test sobrante
await supabase.from('invoices').delete().like('id', 'test_e2e_%');
await supabase.from('invoices').delete().eq('company', 'E2E TEST');
await supabase.from('invoices').delete().eq('company', 'E2E TEST UPDATED');

console.log('\n=== RESULTADOS ===\n');
for (const r of results) {
  console.log(`${r.status} ${r.name}${r.msg ? ` — ${r.msg}` : ''}`);
}
const passed = results.filter(r => r.status === '✅').length;
const failed = results.filter(r => r.status === '❌').length;
console.log(`\n📊 ${passed}/${results.length} tests OK${failed ? ` (${failed} fallos)` : ''}`);
