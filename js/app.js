import { isSupabaseConfigured } from './supabaseClient.js';
import { STATE } from './state.js';
import {
  onAuthStateChange, getSession, fetchMyProfile, signOut, isPasswordRecoveryUrl,
} from './api/auth.js';
// O sufixo também precisa existir nos módulos internos: alterar somente a URL
// deste arquivo não invalida cópias antigas de render.js/data.js já guardadas
// pelo navegador, que ainda faziam INSERT direto e eram recusadas pela RLS.
import { loadAll } from './data.js?v=20260818-member-access-v1';
import { render } from './render.js?v=20260818-member-access-v1';
import {
  showLogin, wireLogin, showResetPasswordScreen, wireResetPasswordScreen,
} from './ui/login.js';
import { showToast } from './ui/toast.js';

function wireModalBackdrop() {
  document.body.insertAdjacentHTML('beforeend', '<div class="modal-backdrop" id="modalBackdrop" hidden><div class="modal" id="modal"></div></div>');
  document.getElementById('modalBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modalBackdrop') {
      // O backdrop é compartilhado entre o modal de obrigação e o de regra
      // (ui/ruleModal.js) — fechar os dois é seguro mesmo quando só um
      // estava aberto, já que cada closeXModal só esconde o backdrop e
      // limpa o próprio STATE.editingXId.
      import('./ui/modal.js').then(({ closeModal }) => closeModal());
      import('./ui/ruleModal.js').then(({ closeRuleModal }) => closeRuleModal());
    }
  });
}

async function enterApp(session) {
  STATE.session = { id: session.user.id, email: session.user.email };
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('resetPasswordScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('app').innerHTML = '<div class="loading">Carregando painel…</div>';

  try {
    STATE.profile = await fetchMyProfile(session.user.id);
  } catch (err) {
    console.error('Falha ao carregar perfil', err);
    STATE.profile = { role: 'membro', display_name: session.user.email, active: true };
  }

  // Conta revogada por um admin (Gerenciar → Equipe): não deixa entrar,
  // mesmo com uma sessão ainda válida. Roda a cada login e a cada refresh
  // automático de token, então uma revogação feita enquanto a pessoa está
  // logada em outra aba tende a surtir efeito na próxima renovação, sem
  // precisar que ela saia e entre de novo.
  if (STATE.profile?.active === false) {
    await signOut();
    showLogin('Sua conta foi revogada. Fale com um administrador do painel.');
    return;
  }

  try {
    await loadAll();
    render();
  } catch (err) {
    console.error(err);
    document.getElementById('app').innerHTML = '<div class="empty">Não foi possível carregar o painel agora. <br/><br/>'
      + '<button class="btn-primary" id="retryBoot">Tentar de novo</button></div>';
    document.getElementById('retryBoot')?.addEventListener('click', () => enterApp(session));
    showToast('Falha ao conectar com o Supabase. Verifique sua internet.', 'error');
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Registra em caminho relativo — funciona tanto na raiz quanto se o
  // painel for publicado numa subpasta do domínio.
  navigator.serviceWorker.register('sw.js').catch((err) => {
    console.error('Falha ao registrar service worker (não impede o uso do painel)', err);
  });
}

function boot() {
  // Leia antes de qualquer operação assíncrona: o SDK pode consumir/limpar o
  // fragmento da URL enquanto restaura a sessão do link de recuperação.
  let passwordRecoveryPending = isPasswordRecoveryUrl();

  wireModalBackdrop();
  registerServiceWorker();

  if (!isSupabaseConfigured()) {
    document.getElementById('loginScreen').innerHTML = '<div class="login-card"><img class="reset-brand-logo" src="icons/e3l-solucoes.svg" alt="E3L Soluções"><h1>Configuração pendente</h1>'
      + '<p>Este projeto ainda não tem as credenciais do Supabase preenchidas. Abra o arquivo js/config.js em um editor de texto, '
      + 'preencha SUPABASE_URL e SUPABASE_ANON_KEY com os dados do seu projeto '
      + '(Project Settings → API no painel do Supabase). Veja o SETUP.md para o passo a passo completo.</p></div>';
    return;
  }

  wireLogin();
  // Ao clicar no link de redefinição de senha (enviado pelo admin em
  // Gerenciar → Equipe), a pessoa volta pra essa mesma URL com uma sessão
  // de recuperação temporária — mostra a tela de nova senha em vez de
  // entrar direto, e só entra no painel depois de salvar.
  wireResetPasswordScreen(() => {
    getSession().then((res) => {
      if (res.data.session) enterApp(res.data.session);
    });
  });
  onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') passwordRecoveryPending = true;
    if (passwordRecoveryPending) { showResetPasswordScreen(); return; }
    if (session) { enterApp(session); } else { showLogin(); }
  });
  getSession().then((res) => {
    if (passwordRecoveryPending) showResetPasswordScreen();
    else if (!res.data.session) showLogin();
  });
}

boot();
