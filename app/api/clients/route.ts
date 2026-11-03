import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

// Tabla esperada en Supabase:
//   create table public.clients (
//     id uuid default gen_random_uuid() primary key,
//     name text not null unique,
//     block text not null,
//     created_at timestamptz default now(),
//     updated_at timestamptz default now()
//   );
//   alter table public.clients enable row level security;
//   create policy "service_all" on public.clients for all using (true) with check (true);

export async function GET() {
  const { data, error } = await supabase
    .from('clients')
    .select('name, block')
    .order('name', { ascending: true });
  if (error) {
    // Si la tabla no existe aún, devolvemos lista vacía para no romper el panel.
    return NextResponse.json({ clients: [], error: error.message });
  }
  return NextResponse.json({ clients: data || [] });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const block = String(body?.block || '').trim();
    if (!block) return NextResponse.json({ ok: false, error: 'block requerido' }, { status: 400 });
    const name = String(body?.name || block.split('\n')[0] || '').trim();
    if (!name) return NextResponse.json({ ok: false, error: 'name requerido' }, { status: 400 });

    const { data, error } = await supabase
      .from('clients')
      .upsert({ name, block, updated_at: new Date().toISOString() }, { onConflict: 'name' })
      .select()
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, client: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const name = url.searchParams.get('name');
  if (!name) return NextResponse.json({ ok: false, error: 'name requerido' }, { status: 400 });
  const { error } = await supabase.from('clients').delete().eq('name', name);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
