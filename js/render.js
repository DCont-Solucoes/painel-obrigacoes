import { STATE, isAdmin } from './state.js';
import { escapeHtml } from './dateUtils.js';
import { renderToolbar } from './ui/toolbar.js';
import { renderBoard } from './ui/board.js';
import { renderManage } from './ui/manage.js';
import { openModal, closeModal } from './ui/modal.js';
import {
  doMarkDone, doUndoLast, doDeleteObligation, loadAll,
  doCreateCompany, doRenameCompany, doDeleteCompany, doChangeRole,
} from './data.js';
import { signOut } from './api/auth.js';

function renderConnBanner() {
  if (!STATE.connectionError) return '';
  return `<div class="conn-banner"><span>${escapeHtml(STATE.connectionError)}</span><button type="button" data-action="retry-load">Tentar de novo</button></div>`;
}

export function render() {
  const app = document.getElementById('app');
  const body = STATE.view === 'board' ? renderBoard() : renderManage();
  const roleLabel = isAdmin() ? 'Admin' : 'Membro';

  app.innerHTML = '<header class="topbar">'
    + '<div class="brand"><span class="brand-mark">§</span><div><h1>Painel de Obrigações Acessórias</h1><p class="sub">Controladoria · acompanhamento compartilhado da equipe</p></div></div>'
    + `<div class="who-am-i"><span class="role-badge ${isAdmin() ? 'admin' : ''}">${roleLabel}</span><span class="email">Logado como <strong>${escapeHtml(STATE.profile?.display_name || STATE.session?.email || '')}</strong></span><button class="logout-btn" id="logoutBtn" type="button">Sair</button></div>`
    + '</header>'
    + renderConnBanner()
    + renderToolbar()
    + `<section class="board">${body}</section>`
    + '<footer class="foot"><p>Painel compartilhado — visível à equipe autenticada. Dados salvos automaticamente.</p></footer>';

  document.getElementById('logoutBtn').addEventListener('click', () => signOut());

  app.addEventListener('click', onAppClick);
}

function onAppClick(e) {
  const app = document.getElementById('app');
  if (!e.target.closest('.dd')) {
    app.querySelectorAll('.dd-panel').forEach((p) => p.classList.add('hidden'));
  }

  const banner = e.target.closest('[data-action="retry-load"]');
  if (banner) {
    loadAll().then(render).catch(() => render());
    return;
  }

  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.getAttribute('data-action');
  const id = btn.getAttribute('data-id');

  if (action === 'dd-toggle') {
    const key = btn.getAttribute('data-dd');
    const panel = app.querySelector(`[data-dd-panel="${key}"]`);
    const wasHidden = panel && panel.classList.contains('hidden');
    app.querySelectorAll('.dd-panel').forEach((p) => p.classList.add('hidden'));
    if (panel && wasHidden) panel.classList.remove('hidden');
    return;
  }
  if (action === 'dd-select') {
    const dkey = btn.getAttribute('data-dd');
    const val = btn.getAttribute('data-value');
    if (dkey === 'empresa') STATE.filters.empresa = val;
    if (dkey === 'category') STATE.filters.category = val;
    if (dkey === 'responsible') STATE.filters.responsible = val;
    render();
    return;
  }

  if (action === 'tab') { STATE.view = btn.getAttribute('data-tab'); render(); return; }
  if (action === 'new') { if (isAdmin()) openModal(null, { onSaved: render }); return; }
  if (action === 'edit') { if (isAdmin()) openModal(id, { onSaved: render }); return; }
  if (action === 'done') { doMarkDone(id, render); return; }
  if (action === 'undo') { doUndoLast(id, render); return; }
  if (action === 'delete') { if (isAdmin()) doDeleteObligation(id, render); return; }
  if (action === 'close') { closeModal(); return; }

  if (action === 'manage-tab') {
    if (!isAdmin()) return;
    STATE.manageSection = btn.getAttribute('data-section');
    STATE.editingCompanyId = null;
    render();
    return;
  }

  if (action === 'company-add') {
    if (!isAdmin()) return;
    const input = document.getElementById('newCompanyName');
    doCreateCompany(input?.value || '', render);
    return;
  }
  if (action === 'company-edit') {
    if (!isAdmin()) return;
    STATE.editingCompanyId = id;
    render();
    return;
  }
  if (action === 'company-cancel-edit') {
    STATE.editingCompanyId = null;
    render();
    return;
  }
  if (action === 'company-save-edit') {
    if (!isAdmin()) return;
    const input = document.getElementById(`editCompanyName-${id}`);
    STATE.editingCompanyId = null;
    doRenameCompany(id, input?.value || '', render);
    return;
  }
  if (action === 'company-delete') {
    if (!isAdmin()) return;
    doDeleteCompany(id, render);
    return;
  }

  if (action === 'team-toggle-role') {
    if (!isAdmin()) return;
    const nextRole = btn.getAttribute('data-next-role');
    doChangeRole(id, nextRole, render);
    return;
  }
}
