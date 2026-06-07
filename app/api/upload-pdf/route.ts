import { NextResponse, NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * POST /api/upload-pdf
 *
 * Sube un PDF a Supabase Storage (bucket: invoice-pdfs)
 * y devuelve la URL pública del archivo.
 *
 * Body (multipart/form-data):
 * - file: el PDF
 * - fileName: nombre del archivo (opcional, se genera si no se manda)
 * - invoiceId: ID del invoice asociado (opcional, para actualizar pdf_url)
 *
 * Respuesta: { success: true, url: 'https://...', path: '...' }
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    let fileName = formData.get('fileName') as string;
    const invoiceId = formData.get('invoiceId') as string;

    if (!file) {
      return NextResponse.json({ error: 'No se subió ningún archivo' }, { status: 400 });
    }

    // Generar nombre único si no viene
    if (!fileName) {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      fileName = `factura_${timestamp}_${random}.pdf`;
    }

    // Limpiar el nombre para que sea válido como path
    const cleanName = fileName.replace(/[^a-zA-Z0-9._\-\s]/g, '').replace(/\s+/g, '_');
    const path = `invoices/${cleanName}`;

    // Subir a Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const { data, error } = await supabase.storage
      .from('invoice-pdfs')
      .upload(path, buffer, {
        contentType: 'application/pdf',
        upsert: true, // Sobrescribir si existe
      });

    if (error) {
      console.error('Storage upload error:', error);
      return NextResponse.json({
        error: error.message,
        hint: 'Asegúrate de que el bucket "invoice-pdfs" existe. Ejecuta el SQL de SETUP_STORAGE.sql'
      }, { status: 500 });
    }

    // Obtener URL pública
    const { data: urlData } = supabase.storage
      .from('invoice-pdfs')
      .getPublicUrl(path);

    const publicUrl = urlData.publicUrl;

    // Si viene invoiceId, actualizar el campo pdf_url en la tabla invoices
    if (invoiceId) {
      const { error: updateError } = await supabase
        .from('invoices')
        .update({ pdf_url: publicUrl })
        .eq('id', invoiceId);

      if (updateError) {
        console.error('Error updating invoice pdf_url:', updateError);
      }
    }

    return NextResponse.json({
      success: true,
      url: publicUrl,
      path: data.path,
      message: '✅ PDF guardado en Supabase Storage'
    });
  } catch (error: any) {
    console.error('Error uploading PDF:', error);
    return NextResponse.json({
      error: error.message || 'Error subiendo el PDF',
      success: false
    }, { status: 500 });
  }
}
