import { supabase } from '../supabaseClient.js';
import { withCurrentWorkspace } from './workspaceContext.js';

export async function fetchOccurrenceOverrides() {
  const { data, error } = await supabase.from('obligation_date_overrides').select('*');
  if (error) throw error;
  return data;
}

// Upsert por (obligation_id, original_date): se já existir um ajuste para
// essa ocorrência, atualiza; senão, cria. Evita a UI ter que saber de
// antemão se já existe um ajuste para decidir entre insert/update.
export async function setOccurrenceOverride({
  obligationId, originalDate, overrideDate, reason,
}) {
  const { data, error } = await supabase
    .from('obligation_date_overrides')
    .upsert(
      withCurrentWorkspace({
        obligation_id: obligationId, original_date: originalDate, override_date: overrideDate, reason,
      }),
      { onConflict: 'obligation_id,original_date' },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteOccurrenceOverride(id) {
  const { error } = await supabase.from('obligation_date_overrides').delete().eq('id', id);
  if (error) throw error;
}
