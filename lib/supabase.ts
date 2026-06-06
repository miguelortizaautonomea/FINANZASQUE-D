import { createClient } from '@supabase/supabase-js';

// Fallback a placeholder en caso de que las env vars no estén configuradas (evita romper el build)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface InvoiceDB {
  id: string;
  type: 'income' | 'expense';
  category: string;
  number: string;
  company: string;
  description?: string;
  amount: number;
  amount_without_vat: number;
  vat: number;
  date: string;
  file_name: string;
  method: string;
  has_invoice: boolean;
  paid?: boolean;
  created_at?: string;
}
