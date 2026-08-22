import { supabase } from '../supabaseClient.js';
import { withCurrentWorkspace } from './workspaceContext.js';

export async function fetchHolidays() {
  const { data, error } = await supabase.from('holidays').select('*').order('holiday_date');
  if (error) throw error;
  return data;
}

export async function createHoliday({ date, name, scope = 'nacional' }) {
  const { data, error } = await supabase
    .from('holidays')
    .insert(withCurrentWorkspace({ holiday_date: date, name, scope }))
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteHoliday(id) {
  const { error } = await supabase.from('holidays').delete().eq('id', id);
  if (error) throw error;
}

// BrasilAPI é um serviço público gratuito e sem autenticação, mantido pela
// comunidade (não é do Supabase nem da Anthropic). Se ficar fora do ar, a
// importação automática falha mas o cadastro manual de feriados continua
// funcionando normalmente.
export async function fetchNationalHolidays(year) {
  const res = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
  if (!res.ok) throw new Error(`BrasilAPI respondeu ${res.status}`);
  const data = await res.json();
  return data.map((h) => ({ date: h.date, name: h.name, scope: 'nacional' }));
}
