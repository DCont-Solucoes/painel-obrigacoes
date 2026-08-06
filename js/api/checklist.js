import { supabase } from '../supabaseClient.js';

export async function fetchChecklistItems(obligationId) {
  const { data, error } = await supabase
    .from('checklist_items')
    .select('*')
    .eq('obligation_id', obligationId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createChecklistItem({ obligationId, description, position }) {
  const { data, error } = await supabase
    .from('checklist_items')
    .insert({ obligation_id: obligationId, description, position })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteChecklistItem(id) {
  const { error } = await supabase.from('checklist_items').delete().eq('id', id);
  if (error) throw error;
}
