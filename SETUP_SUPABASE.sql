-- ================================================================
-- SETUP SUPABASE PARA FINANZAPP
-- Ejecutar este script en: Supabase → SQL Editor → New query
-- ================================================================

-- Crear tabla de invoices
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category TEXT NOT NULL,
  number TEXT NOT NULL,
  company TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  amount_without_vat NUMERIC NOT NULL DEFAULT 0,
  vat NUMERIC NOT NULL DEFAULT 0,
  date DATE NOT NULL,
  file_name TEXT DEFAULT 'manual',
  method TEXT DEFAULT 'Otro',
  has_invoice BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_type ON invoices(type);
CREATE INDEX IF NOT EXISTS idx_invoices_category ON invoices(category);
CREATE INDEX IF NOT EXISTS idx_invoices_has_invoice ON invoices(has_invoice);

-- Habilitar Row Level Security (RLS)
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Política: permitir TODAS las operaciones (público para esta app)
CREATE POLICY "Enable all operations for everyone" ON invoices
  FOR ALL USING (true) WITH CHECK (true);

-- Verificar que la tabla se creó
SELECT 'Tabla invoices creada correctamente' AS status;
