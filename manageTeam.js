import { STATE } from '../state.js';
import { escapeHtml } from '../dateUtils.js';

export function renderTeamManage() {
  let html = '<div class="empty" style="text-align:left;padding:14px 16px;margin-bottom:14px;">'
    + 'Para <strong>criar</strong> uma conta nova, use o painel do Supabase '
    + '(Authentication → Users → Add user) — veja o SETUP.md. Aqui você só altera '
    + 'o <strong>papel de acesso</strong> de quem já tem conta.'
    + '</div>';

  if (!STATE.profiles.length) {
    html += '<div class="empty">Nenhum perfil encontrado.</div>';
    return html;
  }

  const list = STATE.profiles.slice().sort((a, b) => a.email.localeCompare(b.email));
  html += list.map((p) => {
    const isMe = p.id === STATE.session?.id;
    const nextRole = p.role === 'admin' ? 'membro' : 'admin';
    const nextLabel = p.role === 'admin' ? 'Tornar membro' : 'Tornar admin';
    return '<div class="mgmt-row">'
      + '<div class="mgmt-main">'
        + `<div class="mgmt-name">${escapeHtml(p.display_name || p.email)}${isMe ? ' <span class="badge" style="border-color:var(--accent);color:var(--accent);">Você</span>' : ''}</div>`
        + `<div class="mgmt-sub">${escapeHtml(p.email)} · <span class="role-badge ${p.role === 'admin' ? 'admin' : ''}">${p.role === 'admin' ? 'Admin' : 'Membro'}</span></div>`
      + '</div>'
      + '<div class="mgmt-actions">'
        + `<button class="icon-btn" data-action="team-toggle-role" data-id="${p.id}" data-next-role="${nextRole}">${nextLabel}</button>`
      + '</div>'
    + '</div>';
  }).join('');

  return html;
}
