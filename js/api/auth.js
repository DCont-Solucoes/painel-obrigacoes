import { supabase } from '../supabaseClient.js';

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
}

// O Supabase distingue, por código, credenciais incorretas de problemas como
// e-mail ainda não confirmado e excesso de tentativas. Preservar essa
// distinção evita mandar a pessoa trocar uma senha que está correta.
export function getSignInErrorMessage(error) {
  const code = error?.code;

  if (code === 'email_not_confirmed') {
    return 'Seu e-mail ainda não foi confirmado. Abra o link enviado pelo Supabase ou peça a um administrador para confirmar a conta.';
  }
  if (code === 'user_banned') {
    return 'Esta conta está temporariamente bloqueada. Fale com um administrador.';
  }
  if (code === 'over_request_rate_limit' || error?.status === 429) {
    return 'Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.';
  }
  if (code === 'request_timeout') {
    return 'O Supabase demorou para responder. Verifique sua conexão e tente novamente.';
  }
  if (code === 'invalid_credentials') {
    return 'E-mail ou senha inválidos. Confirme também se a conta pertence ao mesmo projeto Supabase configurado neste painel.';
  }

  return 'Não foi possível entrar agora. Verifique sua conexão e tente novamente.';
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
  // Não derive o destino de window.location: se um administrador estiver
  // testando o painel localmente, isso gravaria http://localhost:... no e-mail
  // do usuário. Sem redirectTo, o Supabase usa a Site URL canônica configurada
  // em Authentication → URL Configuration (veja SETUP.md).
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

// O evento PASSWORD_RECOVERY pode ser emitido pelo cliente Supabase durante a
// criação dele, antes de app.js registrar o listener. Preserve também a
// indicação presente na URL para que esse caso não abra o painel diretamente.
export function isPasswordRecoveryUrl(location = window.location) {
  const hashParams = new URLSearchParams((location.hash || '').replace(/^#/, ''));
  const queryParams = new URLSearchParams(location.search || '');
  return hashParams.get('type') === 'recovery' || queryParams.get('type') === 'recovery';
}

// Só funciona com uma sessão de recuperação ativa (ver acima) — troca a
// própria senha da conta logada no momento.
export async function updateOwnPassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}
