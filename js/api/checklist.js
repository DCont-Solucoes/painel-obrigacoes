import { supabase } from '../supabaseClient.js';
import { withCurrentWorkspace, withCurrentWorkspaceMany } from './workspaceContext.js';

export async function fetchChecklistItems(obligationId) {
  const { data, error } = await supabase
    .from('checklist_items')
    .select('*')
    .eq('obligation_id', obligationId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data;
}

// Todos os itens de checklist de todas as obrigações — usado para calcular
// e mostrar o percentual de conclusão ao vivo em cada cartão do Painel,
// sem precisar abrir cada obrigação uma a uma (ver STATE.checklistItems).
export async function fetchAllChecklistItems() {
  const { data, error } = await supabase
    .from('checklist_items')
    .select('*')
    .order('position', { ascending: true });
  if (error) throw error;
  return data;
}

// Marca/desmarca um passo do checklist. Passa por uma função do banco
// (security definer) em vez de um update direto — assim qualquer pessoa
// autenticada pode concluir um passo (igual já acontece para "Marcar
// concluído" na obrigação inteira), sem precisar de permissão de admin
// para editar a tabela inteira (isso protegeria só descrição/posição).
export async function toggleChecklistItem(itemId, done) {
  const { data, error } = await supabase.rpc('set_checklist_item_done', { p_item_id: itemId, p_done: done });
  if (error) throw error;
  return data;
}

// Reinicia o checklist de uma obrigação (todos os itens voltam a
// "não marcado") — chamado depois que uma conclusão é registrada, para o
// próximo ciclo (mês/trimestre/ano seguinte) começar do zero. Passa por
// uma função do banco pelo mesmo motivo de toggleChecklistItem acima:
// qualquer pessoa autenticada pode concluir uma obrigação, não só admin.
export async function resetChecklistItems(obligationId) {
  const { data, error } = await supabase.rpc('reset_checklist_items', { p_obligation_id: obligationId });
  if (error) throw error;
  return data;
}

export async function createChecklistItem({ obligationId, description, position }) {
  const { data, error } = await supabase
    .from('checklist_items')
    .insert(withCurrentWorkspace({ obligation_id: obligationId, description, position }))
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createChecklistItemsBulk(items) {
  if (!items.length) return [];
  const payload = items.map(({ obligationId, description, position }) => ({
    obligation_id: obligationId,
    description,
    position,
  }));
  const { data, error } = await supabase.from('checklist_items').insert(withCurrentWorkspaceMany(payload)).select();
  if (error) throw error;
  return data || [];
}

export async function deleteChecklistItem(id) {
  const { error } = await supabase.from('checklist_items').delete().eq('id', id);
  if (error) throw error;
}
