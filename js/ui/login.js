import { signIn } from '../api/auth.js';

export function showLogin(message) {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  const errEl = document.getElementById('loginError');
  if (message) {
    errEl.textContent = message;
    errEl.classList.remove('hidden');
  } else {
    errEl.classList.add('hidden');
  }
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
