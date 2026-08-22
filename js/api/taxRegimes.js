import { supabase } from '../supabaseClient.js';
import { withCurrentWorkspace } from './workspaceContext.js';

export async function fetchTaxRegimes() {
  const { data, error } = await supabase.from('tax_regimes').select('*').order('name');
  if (error) throw error;
  return data;
}

export async function createTaxRegime(regime) {
  const { data, error } = await supabase.from('tax_regimes').insert(withCurrentWorkspace(regime)).select().single();
  if (error) throw error;
  return data;
}

export async function updateTaxRegime(id, patch) {
  const { data, error } = await supabase.from('tax_regimes').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteTaxRegime(id) {
  const { error } = await supabase.from('tax_regimes').delete().eq('id', id);
  if (error) throw error;
}

// Vínculos regime <-> regra do catálogo (tabela M:N tax_regime_rules).
export async function fetchTaxRegimeRules() {
  const { data, error } = await supabase.from('tax_regime_rules').select('*');
  if (error) throw error;
  return data;
}

export async function linkRuleToRegime(taxRegimeId, obligationRuleId) {
  const { error } = await supabase
    .from('tax_regime_rules')
    .insert(withCurrentWorkspace({ tax_regime_id: taxRegimeId, obligation_rule_id: obligationRuleId }));
  if (error) throw error;
}

export async function unlinkRuleFromRegime(taxRegimeId, obligationRuleId) {
  const { error } = await supabase
    .from('tax_regime_rules')
    .delete()
    .eq('tax_regime_id', taxRegimeId)
    .eq('obligation_rule_id', obligationRuleId);
  if (error) throw error;
}
