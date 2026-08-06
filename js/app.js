import { isSupabaseConfigured } from './supabaseClient.js';
import { STATE } from './state.js';
import { onAuthStateChange, getSession, fetchMyProfile } from './api/auth.js';
import { loadAll } from './data.js';
import { render } from './render.js';
import { showLogin, wireLogin } from './ui/login.js';
import { showToast } from './ui/toast.js';

function wireModalBackdrop() {
  document.body.insertAdjacentHTML('beforeend', '<div class="modal-backdrop" id="modalBackdrop" hidden><div class="modal" id="modal"></div></div>');
  document.getElementById('modalBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modalBackdrop') {
      import('./ui/modal.js').then(({ closeModal }) => closeModal());
    }
  });
}

async function enterApp(session) {
  STATE.session = { id: session.user.id, email: session.user.email };
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('app').innerHTML = '<div class="loading">Carregando painel…</div>';

  try {
    STATE.profile = await fetchMyProfile(session.user.id);
  } catch (err) {
    console.error('Falha ao carregar perfil', err);
    STATE.profile = { role: 'membro', display_name: session.user.email };
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

function boot() {
  wireModalBackdrop();

  if (!isSupabaseConfigured()) {
    document.getElementById('loginScreen').innerHTML = '<div class="login-card"><span class="brand-mark">§</span><h1>Configuração pendente</h1>'
      + '<p>Este projeto ainda não tem as credenciais do Supabase preenchidas. Abra o arquivo js/config.js em um editor de texto, '
      + 'preencha SUPABASE_URL e SUPABASE_ANON_KEY com os dados do seu projeto '
      + '(Project Settings → API no painel do Supabase). Veja o SETUP.md para o passo a passo completo.</p></div>';
    return;
  }

  wireLogin();
  onAuthStateChange((_event, session) => {
    if (session) { enterApp(session); } else { showLogin(); }
  });
  getSession().then((res) => {
    if (!res.data.session) showLogin();
  });
}

boot();
