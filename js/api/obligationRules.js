import { supabase } from '../supabaseClient.js';
import { withCurrentWorkspace } from './workspaceContext.js';

export async function fetchObligationRules() {
  const { data, error } = await supabase.from('obligation_rules').select('*').order('name');
  if (error) throw error;
  return data;
}

export async function createObligationRule(rule) {
  const { data, error } = await supabase.from('obligation_rules').insert(withCurrentWorkspace(rule)).select().single();
  if (error) throw error;
  return data;
}

export async function updateObligationRule(id, patch) {
  const { data, error } = await supabase.from('obligation_rules').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteObligationRule(id) {
  const { error } = await supabase.from('obligation_rules').delete().eq('id', id);
  if (error) throw error;
}
