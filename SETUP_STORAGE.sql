-- =============================================================
-- SETUP DE STORAGE PARA PDFs DE FACTURAS
-- Ejecutar UNA SOLA VEZ en Supabase → SQL Editor
-- =============================================================

-- 1. Crear el bucket "invoice-pdfs" (público)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoice-pdfs',
  'invoice-pdfs',
  true,
  10485760,  -- 10MB max por archivo
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf']::text[];

-- 2. Política: permitir LEER PDFs (público)
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
CREATE POLICY "Public read access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'invoice-pdfs');

-- 3. Política: permitir SUBIR PDFs (anónimo - solo para esta app)
DROP POLICY IF EXISTS "Anyone can upload" ON storage.objects;
CREATE POLICY "Anyone can upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'invoice-pdfs');

-- 4. Política: permitir ACTUALIZAR PDFs (para upsert)
DROP POLICY IF EXISTS "Anyone can update" ON storage.objects;
CREATE POLICY "Anyone can update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'invoice-pdfs');

-- 5. Política: permitir BORRAR PDFs
DROP POLICY IF EXISTS "Anyone can delete" ON storage.objects;
CREATE POLICY "Anyone can delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'invoice-pdfs');

-- 6. Añadir columna pdf_url a la tabla invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT
  'invoice-pdfs' AS bucket_id,
  (SELECT count(*) FROM storage.buckets WHERE id = 'invoice-pdfs') AS bucket_exists,
  (SELECT count(*) FROM storage.policies WHERE bucket_id = 'invoice-pdfs') AS policies_count,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'pdf_url') AS pdf_url_column_exists;
