import { supabase } from '../supabaseClient.js';

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
}

export async function signOut() {
  await supabase.auth.signOut();
}

export function getSession() {
  return supabase.auth.getSession();
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback);
}

// Busca o perfil (papel de acesso) do usuário logado. É criado
// automaticamente por um gatilho no banco quando a conta é criada — veja
// sql/schema.sql. Se por algum motivo ainda não existir, cai para "membro"
// só para a interface não quebrar (o servidor é sempre quem manda: as
// políticas de RLS não dependem desse valor local).
export async function fetchMyProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}
