import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

// Encola un PDF para que el worker drive-sync.mjs del VPS lo suba a Drive.
// Reemplaza las llamadas fire-and-forget a los webhooks de n8n.
//
// Dos formas de llamarlo:
//
// 1) JSON (preferido) — cuando el PDF YA está en Supabase Storage:
//    { pdfUrl, fileName, type, invoiceNumber?, invoiceId?, company?, amount?, invoiceDate? }
//
// 2) multipart/form-data — compatibilidad: para enviar un PDF nuevo.
//    Campos: file (Blob PDF), fileName, type, invoiceNumber?, invoiceId?, ...
//    El PDF se sube primero a Supabase Storage y luego se encola.

export async function POST(req: NextRequest) {
  try {
    const ctype = req.headers.get('content-type') || '';
    let payload: any;

    if (ctype.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file') as File | null;
      const fileName = (form.get('fileName') as string) || (file?.name) || `factura-${Date.now()}.pdf`;
      const type = (form.get('type') as string) || 'income';
      let pdfUrl = (form.get('pdfUrl') as string) || '';

      if (!pdfUrl && file) {
        // Subir primero a Storage
        const buffer = Buffer.from(await file.arrayBuffer());
        const path = `invoices/${Date.now()}-${fileName}`;
        const { error: upErr } = await supabase.storage
          .from('invoice-pdfs')
          .upload(path, buffer, { contentType: 'application/pdf', upsert: true });
        if (upErr) throw new Error(`storage: ${upErr.message}`);
        pdfUrl = supabase.storage.from('invoice-pdfs').getPublicUrl(path).data.publicUrl;
      }

      payload = {
        pdfUrl,
        fileName,
        type,
        invoiceNumber: form.get('invoiceNumber') || null,
        invoiceId: form.get('invoiceId') || null,
        company: form.get('company') || form.get('clientName') || null,
        amount: form.get('amount') || form.get('total') || null,
        invoiceDate: form.get('invoiceDate') || null,
      };
    } else {
      payload = await req.json();
    }

    if (!payload.pdfUrl) return NextResponse.json({ error: 'pdfUrl requerido' }, { status: 400 });
    if (!payload.fileName) return NextResponse.json({ error: 'fileName requerido' }, { status: 400 });
    if (payload.type !== 'income' && payload.type !== 'expense') {
      return NextResponse.json({ error: 'type debe ser income|expense' }, { status: 400 });
    }

    const { data, error } = await supabase.from('drive_queue').insert([{
      invoice_id: payload.invoiceId || null,
      type: payload.type,
      pdf_url: payload.pdfUrl,
      file_name: payload.fileName,
      invoice_number: payload.invoiceNumber || null,
      company: payload.company || null,
      amount: payload.amount != null ? Number(payload.amount) : null,
      invoice_date: payload.invoiceDate || null,
    }]).select().single();

    if (error) throw error;
    return NextResponse.json({ ok: true, queued: data });
  } catch (e: any) {
    console.error('drive-queue error:', e);
    return NextResponse.json({ ok: false, error: e.message || String(e) }, { status: 500 });
  }
}

export async function GET() {
  const { data, error } = await supabase
    .from('drive_queue')
    .select('id, type, file_name, status, attempts, last_error, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data });
}
