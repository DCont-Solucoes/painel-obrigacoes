import { supabase } from '../supabaseClient.js';

export async function fetchAuditLog({ limit = 100 } = {}) {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}
