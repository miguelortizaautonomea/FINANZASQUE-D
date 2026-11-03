-- Ejecutar en Supabase SQL Editor (una vez):
-- https://supabase.com/dashboard/project/cmjnvamxnregpuamoxxu/sql

create table if not exists public.clients (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  block text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.clients enable row level security;

drop policy if exists "service_all" on public.clients;
create policy "service_all" on public.clients for all using (true) with check (true);
