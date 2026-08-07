import { signIn, updateOwnPassword } from '../api/auth.js';

export function showLogin(message) {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('resetPasswordScreen').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  const errEl = document.getElementById('loginError');
  if (message) {
    errEl.textContent = message;
    errEl.classList.remove('hidden');
  } else {
    errEl.classList.add('hidden');
  }
}

// Mostrada quando alguém chega pelo link de redefinição de senha (evento
// PASSWORD_RECOVERY, ver js/app.js) — em vez de entrar direto no painel
// com a sessão temporária do link, pede pra pessoa escolher a senha nova.
export function showResetPasswordScreen(message) {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('resetPasswordScreen').classList.remove('hidden');
  const errEl = document.getElementById('resetPasswordError');
  if (message) {
    errEl.textContent = message;
    errEl.classList.remove('hidden');
  } else {
    errEl.classList.add('hidden');
  }
}

export function wireResetPasswordScreen(onSaved) {
  const passEl = document.getElementById('newPasswordInput');
  const btn = document.getElementById('resetPasswordBtn');

  async function attemptSave() {
    const password = passEl.value;
    if (password.length < 6) { showResetPasswordScreen('A senha precisa ter pelo menos 6 caracteres.'); return; }

    btn.disabled = true;
    btn.textContent = 'Salvando…';
    try {
      await updateOwnPassword(password);
      passEl.value = '';
      onSaved();
    } catch (err) {
      console.error(err);
      showResetPasswordScreen('Não foi possível salvar a senha agora — o link pode ter expirado. Peça um novo link ao administrador.');
    }
    btn.disabled = false;
    btn.textContent = 'Salvar nova senha';
  }

  btn.addEventListener('click', attemptSave);
  passEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptSave(); });
}

export function wireLogin() {
  const emailEl = document.getElementById('loginEmail');
  const passEl = document.getElementById('loginPassword');
  const btn = document.getElementById('loginBtn');

  async function attemptLogin() {
    const email = emailEl.value.trim();
    const password = passEl.value;
    if (!email || !password) { showLogin('Informe e-mail e senha.'); return; }

    btn.disabled = true;
    btn.textContent = 'Entrando…';
    const { error } = await signIn(email, password);
    btn.disabled = false;
    btn.textContent = 'Entrar';
    if (error) { showLogin('E-mail ou senha inválidos.'); }
    // onAuthStateChange cuida de mostrar o app quando o login der certo.
  }

  btn.addEventListener('click', attemptLogin);
  passEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptLogin(); });
  emailEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') passEl.focus(); });
}
