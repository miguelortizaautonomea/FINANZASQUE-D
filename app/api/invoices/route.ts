import { NextResponse, NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';

// Mapear de DB a frontend
function mapFromDB(row: any) {
  return {
    id: row.id,
    type: row.type,
    category: row.category,
    number: row.number,
    company: row.company,
    description: row.description || '',
    amount: parseFloat(row.amount),
    amountWithoutVAT: parseFloat(row.amount_without_vat),
    vat: parseFloat(row.vat),
    date: row.date,
    fileName: row.file_name,
    method: row.method,
    hasInvoice: row.has_invoice,
    paid: row.paid || false,
    pdfUrl: row.pdf_url || null,
  };
}

// Mapear de frontend a DB
function mapToDB(invoice: any) {
  return {
    id: invoice.id,
    type: invoice.type,
    category: invoice.category,
    number: invoice.number,
    company: invoice.company,
    description: invoice.description || null,
    amount: invoice.amount,
    amount_without_vat: invoice.amountWithoutVAT,
    vat: invoice.vat,
    date: invoice.date,
    file_name: invoice.fileName,
    method: invoice.method,
    has_invoice: invoice.hasInvoice || false,
    paid: invoice.paid || false,
    pdf_url: invoice.pdfUrl || null,
  };
}

// GET - Obtener todas las facturas
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .order('date', { ascending: false });

    if (error) throw error;

    const invoices = (data || []).map(mapFromDB);
    return NextResponse.json({ invoices });
  } catch (error: any) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json({ invoices: [], error: error.message }, { status: 500 });
  }
}

// POST - Crear nueva factura
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const newInvoice = mapToDB(body);

    const { data, error } = await supabase
      .from('invoices')
      .insert([newInvoice])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ invoice: mapFromDB(data) });
  } catch (error: any) {
    console.error('Error creating invoice:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - Actualizar factura existente
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;
    const dbUpdates = mapToDB({ id, ...updates });
    delete (dbUpdates as any).id;

    const { data, error } = await supabase
      .from('invoices')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ invoice: mapFromDB(data) });
  } catch (error: any) {
    console.error('Error updating invoice:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Eliminar factura
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
    }

    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting invoice:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
