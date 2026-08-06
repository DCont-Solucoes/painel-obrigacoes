import { supabase } from '../supabaseClient.js';

export async function fetchCompletions() {
  const { data, error } = await supabase.from('completions').select('*');
  if (error) throw error;
  return data;
}

// Grava a conclusão de UMA ocorrência específica. Como a tabela tem
// "unique (obligation_id, occurrence_date)", se duas pessoas clicarem
// "concluído" ao mesmo tempo para a mesma ocorrência, a segunda gravação
// falha com erro de duplicidade em vez de sobrescrever a primeira — isso
// nunca arrisca perder ou corromper a edição de outra pessoa.
export async function markCompletion({ obligationId, occurrenceDate, userId, userLabel }) {
  const { data, error } = await supabase
    .from('completions')
    .insert({
      obligation_id: obligationId,
      occurrence_date: occurrenceDate,
      done_by: userId,
      done_by_name: userLabel,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCompletion(completionId) {
  const { error } = await supabase.from('completions').delete().eq('id', completionId);
  if (error) throw error;
}
