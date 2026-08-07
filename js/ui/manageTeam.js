import { STATE } from '../state.js';
import { escapeHtml } from '../dateUtils.js';

function renderCredentialsBox() {
  const cred = STATE.pendingNewUserCredentials;
  if (!cred) return '';
  return '<div class="credentials-box">'
    + '<p><strong>Conta criada.</strong> Anote a senha temporária agora — ela não será mostrada de novo. '
    + 'Combine com a pessoa uma forma segura de repassar (não fica salva em lugar nenhum do painel).</p>'
    + `<div class="field"><label>E-mail</label><input type="text" readonly value="${escapeHtml(cred.email)}" /></div>`
    + `<div class="field"><label>Senha temporária</label><input type="text" readonly value="${escapeHtml(cred.password)}" /></div>`
    + '<div class="modal-actions" style="margin-top:10px;">'
      + '<div><button type="button" class="icon-btn" data-action="copy-new-user-password">Copiar senha</button></div>'
      + '<div class="right"><button type="button" class="btn-primary" data-action="dismiss-new-user-credentials">Ok, anotei</button></div>'
    + '</div>'
  + '</div>';
}

function renderCreateUserForm() {
  return '<div class="mgmt-create-user">'
    + '<div class="field"><label>Nome</label><input type="text" id="newUserName" placeholder="Nome da pessoa" /></div>'
    + '<div class="field"><label>E-mail</label><input type="email" id="newUserEmail" placeholder="pessoa@empresa.com" /></div>'
    + '<div class="field"><label>Senha temporária <span class="mgmt-sub" style="display:inline;">(só para conta nova — ignorada se o e-mail já existir)</span></label>'
      + '<div style="display:flex;gap:8px;">'
        + '<input type="text" id="newUserPassword" placeholder="Mín. 6 caracteres" style="flex:1;" />'
        + '<button type="button" class="icon-btn" data-action="user-generate-password">Gerar</button>'
      + '</div>'
    + '</div>'
    + '<div class="field"><label>Papel de acesso</label><select id="newUserRole">'
      + '<option value="membro">Membro</option>'
      + '<option value="admin">Admin</option>'
    + '</select></div>'
    + '<button class="btn-primary" type="button" data-action="user-create">Salvar</button>'
    + '<p class="mgmt-sub" style="margin-top:8px;">'
      + 'Se o e-mail já tiver uma conta cadastrada na lista abaixo, este formulário <strong>atualiza</strong> o nome e o papel '
      + 'dessa conta em vez de criar outra (e-mail duplicado sempre falharia). Só cria conta nova quando o e-mail ainda não existe.'
    + '</p>'
    + '<p class="mgmt-sub">'
      + 'Dependendo da configuração de e-mail do projeto Supabase, a pessoa pode precisar confirmar o e-mail antes '
      + 'de conseguir entrar (link enviado automaticamente). Se o primeiro acesso não funcionar, confirme manualmente '
      + 'em Authentication → Users no painel do Supabase.'
    + '</p>'
  + '</div>';
}

export function renderTeamManage() {
  let html = renderCredentialsBox();
  html += '<div class="empty" style="text-align:left;padding:14px 16px;margin-bottom:14px;">'
    + 'Crie contas novas abaixo, ou digite o e-mail de quem já tem conta para <strong>editar</strong> nome/papel. '
    + 'Para tirar o acesso de alguém sem apagar a conta, use <strong>Revogar acesso</strong> na lista — dá para reativar depois.'
    + '</div>';
  html += renderCreateUserForm();

  if (!STATE.profiles.length) {
    html += '<div class="empty">Nenhum perfil encontrado.</div>';
    return html;
  }

  const list = STATE.profiles.slice().sort((a, b) => a.email.localeCompare(b.email));
  html += list.map((p) => {
    const isMe = p.id === STATE.session?.id;
    const isActive = p.active !== false;
    const nextRole = p.role === 'admin' ? 'membro' : 'admin';
    const nextLabel = p.role === 'admin' ? 'Tornar membro' : 'Tornar admin';
    return '<div class="mgmt-row">'
      + '<div class="mgmt-main">'
        + `<div class="mgmt-name">${escapeHtml(p.display_name || p.email)}${isMe ? ' <span class="badge" style="border-color:var(--accent);color:var(--accent);">Você</span>' : ''}</div>`
        + `<div class="mgmt-sub">${escapeHtml(p.email)} · <span class="role-badge ${p.role === 'admin' ? 'admin' : ''}">${p.role === 'admin' ? 'Admin' : 'Membro'}</span>`
          + (isActive ? '' : ' · <span class="badge" style="border-color:var(--red);color:var(--red);">Revogado</span>')
        + '</div>'
      + '</div>'
      + '<div class="mgmt-actions">'
        + `<button class="icon-btn" data-action="team-toggle-role" data-id="${p.id}" data-next-role="${nextRole}">${nextLabel}</button>`
        + `<button class="icon-btn ${isActive ? 'danger' : ''}" data-action="team-toggle-active" data-id="${p.id}" data-next-active="${!isActive}">${isActive ? 'Revogar acesso' : 'Reativar acesso'}</button>`
      + '</div>'
    + '</div>';
  }).join('');

  return html;
}
