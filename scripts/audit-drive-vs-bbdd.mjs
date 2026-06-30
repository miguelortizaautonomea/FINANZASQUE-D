// Auditoría definitiva: lista archivos en Drive vs BBDD
import { createClient } from '@supabase/supabase-js';

const TOKEN = process.env.DRIVE_TOKEN || 'YOUR_TOKEN_HERE';

const FOLDER_GASTOS = '1VUzD-9ZMsFecRNKA6fgYPCgYOIgfTlna';

const supabase = createClient(
  'https://cmjnvamxnregpuamoxxu.supabase.co',
  'sb_publishable_m1kzzGncftRhSzj45JIcRQ_h9VTizgG'
);

async function listDriveFiles(folderId) {
  const allFiles = [];
  let pageToken = null;
  do {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `'${folderId}' in parents and trashed=false`);
    url.searchParams.set('fields', 'nextPageToken,files(id,name,createdTime,size,webViewLink)');
    url.searchParams.set('pageSize', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + TOKEN } });
    if (!res.ok) {
      console.log('❌ Drive API error:', res.status, await res.text());
      return [];
    }
    const data = await res.json();
    allFiles.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return allFiles;
}

async function main() {
  console.log('🔍 LISTANDO ARCHIVOS EN DRIVE "Gastos 3º Trimestre"...\n');
  const driveFiles = await listDriveFiles(FOLDER_GASTOS);
  console.log('Total archivos en Drive:', driveFiles.length);

  // BBDD
  const { data: bbdd } = await supabase
    .from('invoices')
    .select('id, date, number, company, amount, file_name')
    .eq('type', 'expense')
    .eq('has_invoice', true)
    .gte('date', '2026-04-01')
    .order('date', { ascending: true });
  console.log('Total facturas en BBDD (gastos con factura, Abr+):', bbdd.length);

  // Normalizar nombres de Drive
  const driveNames = driveFiles.map(f => f.name);
  const driveSet = new Set(driveNames.map(n => n.toLowerCase()));

  // Helper para detectar si una factura de BBDD está en Drive (con varias estrategias)
  function findInDrive(row) {
    const fn = (row.file_name || '').toLowerCase();
    if (!fn || fn === 'manual' || fn === 'telegram' || fn === 'sin nombre') return null;

    // 1) Match exacto por file_name
    if (driveSet.has(fn)) return driveFiles.find(f => f.name.toLowerCase() === fn);

    // 2) Match por contenido similar (sin extensión)
    const fnBase = fn.replace(/\.pdf$/, '');
    for (const f of driveFiles) {
      const dnLow = f.name.toLowerCase().replace(/\.pdf$/, '');
      if (dnLow === fnBase) return f;
    }

    // 3) Match por número y empresa
    const num = row.number?.toLowerCase().replace(/-/g, '');
    const comp = row.company?.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (num && comp) {
      for (const f of driveFiles) {
        const dn = f.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (dn.includes(num) && dn.includes(comp.substring(0, 5))) return f;
      }
    }
    return null;
  }

  const enDrive = [];
  const noEnDrive = [];

  for (const row of bbdd) {
    const match = findInDrive(row);
    if (match) enDrive.push({ ...row, driveFile: match });
    else noEnDrive.push(row);
  }

  console.log('\n=====================================================================');
  console.log('🚨 NO ENCONTRADAS EN DRIVE (' + noEnDrive.length + ')');
  console.log('=====================================================================\n');
  let totalFalta = 0;
  for (const r of noEnDrive) {
    console.log('  · ' + r.date + ' | ' + (r.number||'').padEnd(10) + ' | ' + r.company.padEnd(30).substring(0,30) + ' | ' + parseFloat(r.amount).toFixed(2).padStart(8) + '€ | file_name: ' + (r.file_name||'(vacío)'));
    totalFalta += parseFloat(r.amount);
  }
  console.log('\n💰 Total monetario faltante: ' + totalFalta.toFixed(2) + '€');

  console.log('\n=====================================================================');
  console.log('✅ SÍ ENCONTRADAS EN DRIVE (' + enDrive.length + ')');
  console.log('=====================================================================\n');
  let totalOk = 0;
  for (const r of enDrive) {
    totalOk += parseFloat(r.amount);
  }
  console.log('  Total monetario OK: ' + totalOk.toFixed(2) + '€');

  console.log('\n=====================================================================');
  console.log('📁 ARCHIVOS EN DRIVE QUE NO COINCIDEN CON BBDD (huérfanos)');
  console.log('=====================================================================\n');
  const bbddFileNames = new Set(bbdd.map(r => (r.file_name||'').toLowerCase()));
  const usedDriveIds = new Set(enDrive.map(r => r.driveFile.id));
  const huerfanos = driveFiles.filter(f => !usedDriveIds.has(f.id));
  console.log('Total archivos huérfanos en Drive: ' + huerfanos.length + '\n');
  for (const f of huerfanos.slice(0, 60)) {
    console.log('  · ' + f.name);
  }
  if (huerfanos.length > 60) console.log('  ... y ' + (huerfanos.length - 60) + ' más');
}

main().catch(e => console.error('💥', e));
