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

// Manda o e-mail de redefinição de senha do Supabase Auth para alguém —
// é o único jeito seguro de um admin "trocar a senha de outra pessoa" sem
// a service_role key (ver js/api/adminUsers.js para a mesma restrição na
// criação de conta): a pessoa escolhe a senha nova ela mesma, ao abrir o
// link recebido. O link volta pra própria URL do painel; o app detecta a
// sessão de recuperação (evento PASSWORD_RECOVERY, ver js/app.js) e mostra
// a tela de "definir nova senha" em vez de entrar direto.
export async function sendPasswordResetEmail(email) {
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

// Só funciona com uma sessão de recuperação ativa (ver acima) — troca a
// própria senha da conta logada no momento.
export async function updateOwnPassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}
