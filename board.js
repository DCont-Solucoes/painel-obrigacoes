import { STATE, isAdmin, completionsIndex, companyName, holidaysDateSet, lastCompletion } from '../state.js';
import { catInfo, FREQ_LABELS, priorityInfo } from '../constants.js';
import {
  getActiveOccurrence, statusOf, fmtBR, deltaLabel, trackPercent, escapeHtml,
} from '../dateUtils.js';

function computeActive() {
  const idx = completionsIndex();
  const holidaysSet = holidaysDateSet();
  return STATE.obligations.map((ob) => {
    const active = getActiveOccurrence(ob, idx, holidaysSet);
    const status = statusOf(active);
    return { ob, active, status };
  });
}

function renderStats(items) {
  const counts = { red: 0, amber: 0, green: 0, muted: 0 };
  items.forEach((it) => { counts[it.status.tone]++; });
  const cfg = [
    ['red', 'Atrasadas'], ['amber', 'Vencem em breve'], ['green', 'No prazo'], ['muted', 'Sem pendência'],
  ];
  return `<section class="stats">${cfg.map(([tone, label]) => (
    `<div class="stat tone-${tone}"><div class="n">${counts[tone]}</div><div class="l">${label}</div></div>`
  )).join('')}</section>`;
}

function renderCard(it) {
  const { ob, active, status: st } = it;
  const cat = catInfo(ob.category);
  const pct = active ? trackPercent(st.diffDays) : 50;
  const dueLabel = active ? fmtBR(active) : '—';
  const deltaTxt = active ? deltaLabel(st.diffDays) : 'sem ocorrência prevista';
  const trackHtml = '<div class="ruler">'
    + '<div class="ruler-line"></div>'
    + '<div class="ruler-today" style="left:33.33%"><span>HOJE</span></div>'
    + (active ? `<div class="ruler-due tone-${st.tone}" style="left:${pct}%"><span class="dot"></span></div>` : '')
    + '</div>';

  const last = lastCompletion(ob.id);
  const lastCompletionHtml = last
    ? `<div class="card-last-completion">✓ Última conclusão: <strong>${escapeHtml(last.done_by_name)}</strong> em ${fmtBR(new Date(last.done_at))}${last.attachment_path ? ` · <button type="button" class="comment-delete" data-action="view-attachment" data-path="${escapeHtml(last.attachment_path)}">ver comprovante</button>` : ''}</div>`
    : '';

  let actionsHtml = '<div class="card-actions">';
  if (active) {
    actionsHtml += `<button class="btn-sm done" data-action="done" data-id="${ob.id}">✓ Marcar concluído</button>`;
  } else {
    actionsHtml += '<button class="btn-sm" disabled>Sem pendência ativa</button>';
  }
  if (isAdmin()) {
    actionsHtml += `<button class="btn-sm edit" data-action="edit" data-id="${ob.id}">Editar</button>`;
  }
  actionsHtml += '</div>';

  return '<article class="card">'
    + '<div class="card-top">'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;">'
        + `<span class="badge" style="border-color:${cat.color};color:${cat.color};">${cat.label}</span>`
        + (ob.priority === 'critica' || ob.priority === 'alta' ? `<span class="badge" style="border-color:var(--red);color:var(--red);" title="Prioridade ${priorityInfo(ob.priority).label}">${ob.priority === 'critica' ? '🔥 Crítica' : '⚠ Alta'}</span>` : '')
      + '</div>'
      + `<span class="status-pill tone-${st.tone}">${st.label}</span>`
    + '</div>'
    + `<h3 class="card-title">${escapeHtml(ob.name)}</h3>`
    + `<div class="card-meta"><span>🏢 ${escapeHtml(companyName(ob.company_id) || '—')}</span><span>· 👤 ${escapeHtml(ob.responsible || '—')}</span><span>· ${FREQ_LABELS[ob.frequency]}</span></div>`
    + trackHtml
    + `<div class="card-due-label"><span class="due-date">${dueLabel}</span><span class="due-delta tone-${st.tone}">${deltaTxt}</span></div>`
    + lastCompletionHtml
    + actionsHtml
    + '</article>';
}

export function renderBoard({ onlyMine = false } = {}) {
  const items = computeActive().filter((it) => {
    if (onlyMine && it.ob.responsible_id !== STATE.session?.id) return false;
    if (STATE.filters.empresa !== 'all' && it.ob.company_id !== STATE.filters.empresa) return false;
    if (STATE.filters.category !== 'all' && it.ob.category !== STATE.filters.category) return false;
    if (STATE.filters.responsible !== 'all' && it.ob.responsible !== STATE.filters.responsible) return false;
    return true;
  });

  const statsHtml = renderStats(items);

  if (!items.length) {
    const emptyMsg = onlyMine
      ? 'Nenhuma obrigação está vinculada a você no momento. Peça a um administrador para te definir como responsável em alguma obrigação (aba Gerenciar → Obrigações).'
      : `Nenhuma obrigação corresponde a este filtro. Ajuste os filtros acima${isAdmin() ? ' ou cadastre uma nova obrigação' : ''}.`;
    return `${statsHtml}<div class="empty">${emptyMsg}</div>`;
  }

  const groups = [
    { tone: 'red', title: 'Atrasadas' },
    { tone: 'amber', title: 'Vencem em breve (≤ 5 dias)' },
    { tone: 'green', title: 'No prazo' },
    { tone: 'muted', title: 'Sem pendência próxima' },
  ];

  let html = statsHtml;
  groups.forEach((g) => {
    const groupItems = items
      .filter((it) => it.status.tone === g.tone)
      .sort((a, b) => {
        const da = a.active ? a.active.getTime() : Infinity;
        const db = b.active ? b.active.getTime() : Infinity;
        return da - db;
      });
    if (!groupItems.length) return;
    html += '<div class="group">'
      + `<div class="group-head"><span class="group-dot tone-${g.tone}"></span>`
        + `<span class="group-title">${g.title}</span>`
        + `<span class="group-count">(${groupItems.length})</span></div>`
      + `<div class="cards">${groupItems.map(renderCard).join('')}</div>`
      + '</div>';
  });
  return html;
}
