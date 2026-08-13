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

// Usado pela importação em massa (CSV): insere várias obrigações numa única
// chamada. É uma operação tudo-ou-nada — se uma linha violar uma regra do
// banco, nenhuma é gravada, então o front-end já valida tudo antes de
// chegar aqui (ver js/csv.js).
export async function createObligationsBulk(obs) {
  if (!obs.length) return [];

  // Importações grandes faziam uma única requisição ao PostgREST. Além de
  // estourar limites de tamanho/tempo em alguns projetos, o gatilho de
  // auditoria do banco é executado uma vez para cada item. Enviamos lotes
  // menores e, caso qualquer lote falhe, removemos tudo o que já foi criado
  // nesta operação para manter o comportamento de "tudo ou nada" da tela.
  const BATCH_SIZE = 40;
  const created = [];

  try {
    for (let start = 0; start < obs.length; start += BATCH_SIZE) {
      const batch = obs.slice(start, start + BATCH_SIZE);
      const { data, error } = await supabase.from('obligations').insert(batch).select();
      if (error) {
        error.importRows = { from: start + 1, to: start + batch.length };
        throw error;
      }
      created.push(...(data || []));
    }
    return created;
  } catch (error) {
    if (created.length) {
      const { error: rollbackError } = await supabase
        .from('obligations')
        .delete()
        .in('id', created.map((obligation) => obligation.id));
      if (rollbackError) console.error('Falha ao desfazer importação parcial:', rollbackError);
    }
    throw error;
  }
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
