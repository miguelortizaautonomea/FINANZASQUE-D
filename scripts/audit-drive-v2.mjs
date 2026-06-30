// Auditoría DEFINITIVA - matching multi-criterio
import { createClient } from '@supabase/supabase-js';

const TOKEN = process.env.DRIVE_TOKEN || 'YOUR_TOKEN_HERE';
const FOLDER = '1VUzD-9ZMsFecRNKA6fgYPCgYOIgfTlna';

const supabase = createClient(
  'https://cmjnvamxnregpuamoxxu.supabase.co',
  'sb_publishable_m1kzzGncftRhSzj45JIcRQ_h9VTizgG'
);

async function listAll(folderId) {
  const all = [];
  let pt = null;
  do {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `'${folderId}' in parents and trashed=false`);
    url.searchParams.set('fields', 'nextPageToken,files(id,name,size,webViewLink)');
    url.searchParams.set('pageSize', '1000');
    if (pt) url.searchParams.set('pageToken', pt);
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + TOKEN }});
    const d = await r.json();
    all.push(...(d.files || []));
    pt = d.nextPageToken;
  } while (pt);
  return all;
}

function normalize(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Genera todas las posibles representaciones del nombre
function generateKeys(row) {
  const keys = new Set();
  const number = (row.number || '').toLowerCase();
  const numParts = number.match(/^(\d+)-(\w+)$/);
  const companies = [
    row.company,
    row.company?.replace(/[^a-zA-Z0-9\s]/g, ''),
    row.company?.split(' ')[0],
  ].filter(Boolean);

  for (const comp of companies) {
    const compNorm = normalize(comp);
    if (numParts) {
      const [_, num, month] = numParts;
      keys.add(`${month.toLowerCase()}-${num}-${compNorm}`);
      keys.add(`${num}-${month.toLowerCase()}-${compNorm}`);
      keys.add(`${month.toLowerCase()}${num}${compNorm}`);
      keys.add(`${num}${month.toLowerCase()}${compNorm}`);
    }
    keys.add(`${number}${compNorm}`);
    keys.add(`${normalize(number)}${compNorm}`);
  }
  // También el file_name original
  if (row.file_name) keys.add(normalize(row.file_name.replace(/\.pdf$/i, '')));
  return keys;
}

function matchDrive(row, driveFiles) {
  if (!row.file_name || ['manual', 'telegram', 'sin nombre'].includes((row.file_name||'').toLowerCase())) {
    // Sin PDF asociado pero quizás hay algo en Drive con número+empresa
    const keys = generateKeys(row);
    for (const f of driveFiles) {
      const fn = normalize(f.name.replace(/\.pdf$/i, ''));
      for (const k of keys) {
        if (k && k.length > 4 && (fn.includes(k) || k.includes(fn))) return { file: f, reason: 'matchSemántico' };
      }
    }
    return null;
  }

  const targetNorm = normalize(row.file_name.replace(/\.pdf$/i, ''));

  // 1) Match exacto
  for (const f of driveFiles) {
    if (normalize(f.name.replace(/\.pdf$/i, '')) === targetNorm) {
      return { file: f, reason: 'exacto' };
    }
  }

  // 2) Match invertido (Mes-N vs N-Mes)
  const numParts = row.number?.match(/^(\d+)-(\w+)$/);
  if (numParts) {
    const [_, num, month] = numParts;
    const flippedFn = row.file_name.replace(`${num}-${month}`, `${month}-${num}`);
    const flippedNorm = normalize(flippedFn.replace(/\.pdf$/i, ''));
    const reverseFn = row.file_name.replace(`${month}-${num}`, `${num}-${month}`);
    const reverseNorm = normalize(reverseFn.replace(/\.pdf$/i, ''));
    for (const f of driveFiles) {
      const fnN = normalize(f.name.replace(/\.pdf$/i, ''));
      if (fnN === flippedNorm || fnN === reverseNorm) {
        return { file: f, reason: 'inverso' };
      }
    }
  }

  // 3) Match parcial (incluye empresa + número)
  const keys = generateKeys(row);
  for (const f of driveFiles) {
    const fn = normalize(f.name.replace(/\.pdf$/i, ''));
    for (const k of keys) {
      if (k && k.length > 8 && fn === k) return { file: f, reason: 'porKey' };
    }
  }

  return null;
}

async function main() {
  console.log('📡 Listando Drive...');
  const drive = await listAll(FOLDER);
  console.log('   ' + drive.length + ' archivos en Drive\n');

  const { data: bbdd } = await supabase
    .from('invoices').select('id, date, number, company, amount, file_name')
    .eq('type', 'expense').eq('has_invoice', true).gte('date', '2026-04-01')
    .order('date', { ascending: true });
  console.log('🗃️  ' + bbdd.length + ' facturas en BBDD\n');

  const enDrive = [];
  const noEnDrive = [];
  const usedFileIds = new Set();

  for (const row of bbdd) {
    const m = matchDrive(row, drive);
    if (m) {
      enDrive.push({ ...row, driveFile: m.file, reason: m.reason });
      usedFileIds.add(m.file.id);
    } else {
      noEnDrive.push(row);
    }
  }

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🚨 NO ESTÁN EN DRIVE (' + noEnDrive.length + ')');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  let totalFalta = 0;
  for (const r of noEnDrive) {
    console.log('  · ' + r.date + ' | ' + (r.number||'').padEnd(10) + ' | ' + r.company.padEnd(32).substring(0,32) + ' | ' + parseFloat(r.amount).toFixed(2).padStart(8) + '€ | ' + (r.file_name||'(vacío)'));
    totalFalta += parseFloat(r.amount);
  }
  console.log('\n💰 TOTAL FALTANTE: ' + totalFalta.toFixed(2) + '€\n');

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('✅ SÍ ESTÁN EN DRIVE (' + enDrive.length + ')');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  for (const r of enDrive) {
    console.log('  ✓ ' + (r.number||'').padEnd(10) + ' ' + r.company.padEnd(25).substring(0,25) + ' | bbdd: ' + r.file_name.padEnd(35).substring(0,35) + ' → drive: ' + r.driveFile.name);
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('📁 ARCHIVOS EN DRIVE SIN MATCH EN BBDD');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  const huerfanos = drive.filter(f => !usedFileIds.has(f.id));
  console.log('Total: ' + huerfanos.length);
  for (const f of huerfanos) console.log('  · ' + f.name);
}

main().catch(e => console.error('💥', e));
