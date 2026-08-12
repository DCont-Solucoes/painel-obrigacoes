import {
  STATE, isAdmin, companyName, lastCompletion, activeOccurrences, checklistProgress,
} from '../state.js';
import { catInfo, FREQ_LABELS, priorityInfo } from '../constants.js';
import {
  fmtBR, deltaLabel, trackPercent, escapeHtml, checklistProgressLabel,
} from '../dateUtils.js';

function renderAtAGlance(items, onlyMine) {
  const urgent = items.filter((it) => it.status.tone === 'red' || it.status.tone === 'amber').length;
  const overdue = items.filter((it) => it.status.tone === 'red').length;
  const unassigned = items.filter((it) => !it.ob.responsible && (it.status.tone === 'red' || it.status.tone === 'amber')).length;
  const inProgress = items.filter((it) => checklistProgress(it.ob.id)?.pct > 0 && checklistProgress(it.ob.id)?.pct < 100).length;
  const scopeLabel = onlyMine ? 'MINHAS OBRIGAÇÕES · AGORA' : 'GESTÃO À VISTA · AGORA';
  const headline = overdue
    ? `${overdue} ocorrência${overdue === 1 ? '' : 's'} atrasada${overdue === 1 ? '' : 's'} exige${overdue === 1 ? '' : 'm'} reação imediata.`
    : urgent
      ? `${urgent} prazo${urgent === 1 ? '' : 's'} merece${urgent === 1 ? '' : 'm'} atenção nos próximos dias.`
      : 'Nenhum prazo crítico no horizonte imediato.';
  const helper = urgent
    ? 'Use os filtros para concentrar a conversa no que precisa de decisão, responsável ou evidência.'
    : 'A operação está estável; mantenha o acompanhamento dos próximos vencimentos e dos checklists.';

  return '<section class="board-brief" aria-label="Resumo operacional">'
    + `<div class="board-brief-copy"><span class="board-eyebrow">${scopeLabel}</span><h2>${headline}</h2><p>${helper}</p></div>`
    + '<div class="board-brief-metrics">'
      + `<div class="brief-metric tone-${urgent ? 'amber' : 'green'}"><strong>${urgent}</strong><span>prazos prioritários</span></div>`
      + `<div class="brief-metric tone-${inProgress ? 'accent' : 'muted'}"><strong>${inProgress}</strong><span>checklists em andamento</span></div>`
      + `<div class="brief-metric tone-${unassigned ? 'red' : 'green'}"><strong>${unassigned}</strong><span>urgentes sem responsável</span></div>`
      + `<div class="brief-metric tone-muted"><strong>${items.length}</strong><span>ocorrências acompanhadas</span></div>`
    + '</div>'
  + '</section>';
}

export function renderStats(items) {
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
  const {
    ob, active, displayDate, override, status: st,
  } = it;
  const cat = catInfo(ob.category);
  const pct = displayDate ? trackPercent(st.diffDays) : 50;
  const dueLabel = displayDate ? fmtBR(displayDate) : '—';
  const deltaTxt = displayDate ? deltaLabel(st.diffDays) : 'sem ocorrência prevista';
  const trackHtml = '<div class="ruler">'
    + '<div class="ruler-line"></div>'
    + '<div class="ruler-today" style="left:33.33%"><span>HOJE</span></div>'
    + (displayDate ? `<div class="ruler-due tone-${st.tone}" style="left:${pct}%"><span class="dot"></span></div>` : '')
    + '</div>';
  const overrideNote = override
    ? `<div class="card-meta" style="color:var(--amber);">📌 Data ajustada manualmente (padrão seria ${fmtBR(active)})${override.reason ? ` — ${escapeHtml(override.reason)}` : ''}</div>`
    : '';

  const last = lastCompletion(ob.id);
  const checklistLabel = checklistProgressLabel(last);
  const completionLabel = last?.status === 'aguardando_validacao'
    ? '⏳ Enviada para validação'
    : (last?.status === 'rejeitada' ? '↩ Devolvida para correção' : '✓ Última conclusão');
  const lastCompletionHtml = last
    ? `<div class="card-last-completion">${completionLabel}: <strong>${escapeHtml(last.done_by_name)}</strong> em ${fmtBR(new Date(last.done_at))}${last.attachment_path ? ` · <button type="button" class="comment-delete" data-action="view-attachment" data-path="${escapeHtml(last.attachment_path)}">ver comprovante</button>` : ''}${checklistLabel ? ` · ${checklistLabel}` : ''}</div>`
    : '';

  // Checklist do ciclo ATUAL (ainda não concluído), com progresso ao vivo —
  // qualquer pessoa pode marcar um passo aqui, sem precisar abrir o
  // diálogo de "Marcar concluído". Só aparece se a obrigação tem uma
  // ocorrência ativa e algum passo cadastrado.
  const progress = active ? checklistProgress(ob.id) : null;
  const liveChecklistHtml = progress ? '<div class="card-checklist">'
    + `<div class="card-checklist-head">Checklist: ${progress.checked}/${progress.total} (${progress.pct}%)</div>`
    + `<div class="report-bar"><div class="report-bar-fill tone-${progress.pct === 100 ? 'green' : 'amber'}" style="width:${progress.pct}%"></div></div>`
    + '<div class="card-checklist-items">'
      + progress.items.map((i) => (
        `<label class="checklist-complete-item"><input type="checkbox" data-action="checklist-toggle" data-id="${i.id}" data-done="${!i.completed}" ${i.completed ? 'checked' : ''} /> ${escapeHtml(i.description)}</label>`
      )).join('')
    + '</div>'
  + '</div>' : '';

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
    + overrideNote
    + trackHtml
    + `<div class="card-due-label"><span class="due-date">${dueLabel}</span><span class="due-delta tone-${st.tone}">${deltaTxt}</span></div>`
    + liveChecklistHtml
    + lastCompletionHtml
    + actionsHtml
    + '</article>';
}

export function renderBoard({ onlyMine = false } = {}) {
  const items = activeOccurrences().filter((it) => {
    if (onlyMine && it.ob.responsible_id !== STATE.session?.id) return false;
    if (STATE.filters.empresa !== 'all' && it.ob.company_id !== STATE.filters.empresa) return false;
    if (STATE.filters.category !== 'all' && it.ob.category !== STATE.filters.category) return false;
    if (STATE.filters.responsible !== 'all' && it.ob.responsible !== STATE.filters.responsible) return false;
    if (STATE.filters.status !== 'all' && it.status.tone !== STATE.filters.status) return false;
    return true;
  });

  const overviewHtml = renderAtAGlance(items, onlyMine);
  const statsHtml = renderStats(items);

  if (!items.length) {
    const emptyMsg = onlyMine
      ? 'Nenhuma obrigação está vinculada a você no momento. Peça a um administrador para te definir como responsável em alguma obrigação (aba Gerenciar → Obrigações).'
      : `Nenhuma obrigação corresponde a este filtro. Ajuste os filtros acima${isAdmin() ? ' ou cadastre uma nova obrigação' : ''}.`;
    return `${overviewHtml}${statsHtml}<div class="empty">${emptyMsg}</div>`;
  }

  const groups = [
    { tone: 'red', title: 'Atrasadas' },
    { tone: 'amber', title: 'Vencem em breve (≤ 5 dias)' },
    { tone: 'green', title: 'No prazo' },
    { tone: 'muted', title: 'Sem pendência próxima' },
  ];

  let html = overviewHtml + statsHtml;
  groups.forEach((g) => {
    const groupItems = items
      .filter((it) => it.status.tone === g.tone)
      .sort((a, b) => {
        const da = a.displayDate ? a.displayDate.getTime() : Infinity;
        const db = b.displayDate ? b.displayDate.getTime() : Infinity;
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
