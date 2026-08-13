import { supabase } from '../supabaseClient.js';

export async function fetchObligations() {
  const { data, error } = await supabase.from('obligations').select('*').order('name');
  if (error) throw error;
  return data;
}

// `ob` já vem no formato de coluna do banco (day_of_month, due_date, etc.)
// — ver js/ui/modal.js, função formToObligationPayload.
export async function createObligation(ob) {
  const { data, error } = await supabase.from('obligations').insert(ob).select().single();
  if (error) throw error;
  return data;
}

// A RPC valida o administrador no servidor e só então executa toda a planilha
// como uma única transação SECURITY DEFINER. Um INSERT direto não serve como
// alternativa: ele volta a depender da policy RLS de `obligations` e foi
// justamente a origem do 403/42501 observado em produção.
export async function createObligationsBulk(obs) {
  if (!obs.length) return [];
  const { data, error } = await supabase.rpc('import_obligations', { p_items: obs });
  if (error) throw error;
  return data || [];
}

export async function updateObligation(id, patch) {
  const { data, error } = await supabase.from('obligations').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// Apaga só a linha desta obrigação; as conclusões associadas somem junto
// por causa do "on delete cascade" definido no schema (não é preciso
// limpar nada manualmente no front-end).
export async function deleteObligation(id) {
  const { error } = await supabase.from('obligations').delete().eq('id', id);
  if (error) throw error;
}
