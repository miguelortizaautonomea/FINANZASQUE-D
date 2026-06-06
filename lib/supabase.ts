import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface InvoiceDB {
  id: string;
  type: 'income' | 'expense';
  category: string;
  number: string;
  company: string;
  amount: number;
  amount_without_vat: number;
  vat: number;
  date: string;
  file_name: string;
  method: string;
  has_invoice: boolean;
  created_at?: string;
}
// Supabase migration completed - Sat Jun  6 17:44:25 CEST 2026
