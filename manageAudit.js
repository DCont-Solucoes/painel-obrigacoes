import { STATE } from '../state.js';
import { escapeHtml } from '../dateUtils.js';

const ACTION_LABELS = { insert: 'criou', update: 'alterou', delete: 'excluiu' };
const ACTION_TONE = { insert: 'green', update: 'amber', delete: 'red' };

function summarizeDiff(entry) {
  if (entry.action === 'update' && entry.diff?.antes && entry.diff?.depois) {
    const antes = entry.diff.antes;
    const depois = entry.diff.depois;
    const changed = Object.keys(depois).filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(depois[k]) && k !== 'updated_at');
    if (!changed.length) return '';
    return `Campos alterados: ${changed.join(', ')}`;
  }
  const name = entry.diff?.name;
  return name ? `"${name}"` : '';
}

export function renderAuditManage() {
  if (STATE.auditLog === null) {
    return '<div class="empty">Carregando histórico…</div>';
  }
  if (!STATE.auditLog.length) {
    return '<div class="empty">Nenhum registro de alteração ainda.</div>';
  }

  let html = '<div class="empty" style="text-align:left;padding:14px 16px;margin-bottom:14px;">'
    + 'Mostra as últimas 200 criações, edições e exclusões de obrigações, com quem fez e quando. '
    + 'Visível só para administradores.'
    + '</div>';

  html += STATE.auditLog.map((e) => {
    const when = new Date(e.changed_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const summary = summarizeDiff(e);
    return '<div class="mgmt-row">'
      + '<div class="mgmt-main">'
        + `<div class="mgmt-name"><span class="status-pill tone-${ACTION_TONE[e.action]}">${ACTION_LABELS[e.action] || e.action}</span> ${escapeHtml(e.changed_by_name || 'sistema')}</div>`
        + `<div class="mgmt-sub">${when}${summary ? ` · ${escapeHtml(summary)}` : ''}</div>`
      + '</div>'
    + '</div>';
  }).join('');

  return html;
}
