import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const isConfigured = !SUPABASE_URL.includes('COLE_AQUI');

export const supabase = isConfigured
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export function isSupabaseConfigured() {
  return isConfigured;
}
