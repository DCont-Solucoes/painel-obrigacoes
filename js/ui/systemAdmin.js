import { STATE } from '../state.js';
import { escapeHtml } from '../dateUtils.js';

function accessLabel(workspace) {
  if (workspace.access_status === 'trial') return ['Degustação', 'trial'];
  if (workspace.access_status === 'full') return ['Acesso completo', 'full'];
  return ['Suspenso', 'suspended'];
}

export function renderSystemAdmin() {
  const active = STATE.workspaces.filter((w) => w.access_status !== 'suspended').length;
  const trials = STATE.workspaces.filter((w) => w.access_status === 'trial').length;
  const admins = STATE.profiles.filter((p) => p.role === 'admin').length;
  const cards = STATE.workspaces.map((workspace) => {
    const [label, tone] = accessLabel(workspace);
    const companyAdmins = STATE.profiles.filter((p) => p.workspace_id === workspace.id && p.role === 'admin');
    return `<article class="system-company-card">
      <div class="system-company-head"><div class="company-avatar">${escapeHtml(workspace.name.slice(0, 2).toUpperCase())}</div><div><h3>${escapeHtml(workspace.name)}</h3><p>${escapeHtml(workspace.document || 'CNPJ não informado')}</p></div><span class="access-chip ${tone}">${label}</span></div>
      <dl class="system-company-meta"><div><dt>Administrador</dt><dd>${companyAdmins.length ? escapeHtml(companyAdmins.map((p) => p.display_name || p.email).join(', ')) : 'Aguardando cadastro'}</dd></div><div><dt>Vigência</dt><dd>${workspace.access_status === 'trial' ? `Até ${escapeHtml(workspace.trial_ends_at || 'não definida')}` : (workspace.access_status === 'full' ? 'Contrato ativo' : 'Acesso bloqueado')}</dd></div></dl>
      <div class="system-company-actions"><button class="icon-btn" data-action="workspace-access" data-id="${workspace.id}" data-status="trial">Degustação</button><button class="icon-btn" data-action="workspace-access" data-id="${workspace.id}" data-status="full">Liberar completo</button><button class="icon-btn danger" data-action="workspace-access" data-id="${workspace.id}" data-status="suspended">Suspender</button></div>
    </article>`;
  }).join('');

  return `<div class="system-admin">
    <div class="system-admin-hero"><div><span class="login-kicker">ADMINISTRAÇÃO DO SISTEMA</span><h2>Contas e acessos</h2><p>Crie espaços isolados para clientes, defina o administrador responsável e controle a jornada de degustação à contratação.</p></div><span class="super-badge">SUPERUSUÁRIO</span></div>
    <div class="system-stats"><div><strong>${STATE.workspaces.length}</strong><span>Empresas cadastradas</span></div><div><strong>${active}</strong><span>Acessos ativos</span></div><div><strong>${trials}</strong><span>Em degustação</span></div><div><strong>${admins}</strong><span>Admins de empresas</span></div></div>
    <section class="system-create"><div><h3>Nova empresa</h3><p>Um espaço exclusivo será criado para os dados e usuários deste cliente.</p></div><div class="system-create-fields"><div class="field"><label for="workspaceName">Razão social</label><input id="workspaceName" placeholder="Nome da empresa" /></div><div class="field"><label for="workspaceDocument">CNPJ</label><input id="workspaceDocument" placeholder="00.000.000/0000-00" /></div><div class="field"><label for="workspaceAccess">Acesso inicial</label><select id="workspaceAccess"><option value="trial">Degustação (14 dias)</option><option value="full">Completo</option><option value="suspended">Sem acesso</option></select></div><button class="btn-primary" data-action="workspace-create">Criar espaço</button></div></section>
    <div class="system-section-title"><div><h3>Empresas e contratos</h3><p>Gerencie a modalidade de acesso de cada espaço.</p></div></div>
    <div class="system-company-grid">${cards || '<div class="empty">Nenhuma empresa cadastrada.</div>'}</div>
  </div>`;
}
