import { STATE, companyName, lastCompletion } from '../state.js';
import { catInfo, FREQ_LABELS, priorityInfo } from '../constants.js';
import { freqSummary, escapeHtml, fmtBR } from '../dateUtils.js';

export function renderObligationsManage() {
  if (!STATE.obligations.length) {
    return '<div class="empty">Nenhuma obrigação cadastrada ainda. Use "+ Nova obrigação" para começar o calendário do seu grupo.</div>';
  }

  const list = STATE.obligations.slice().sort((a, b) => a.name.localeCompare(b.name));
  return list.map((ob) => {
    const cat = catInfo(ob.category);
    const prio = priorityInfo(ob.priority);
    const last = lastCompletion(ob.id);
    const lastLine = last
      ? `Última conclusão: <strong>${escapeHtml(last.done_by_name)}</strong> em ${fmtBR(new Date(last.done_at))}${last.attachment_path ? ` · <button type="button" class="comment-delete" data-action="view-attachment" data-path="${escapeHtml(last.attachment_path)}">ver comprovante</button>` : ' · sem comprovante (registro antigo)'}`
      : 'Nenhuma conclusão registrada ainda';
    return '<div class="mgmt-row">'
      + '<div class="mgmt-main">'
        + `<div class="mgmt-name">${escapeHtml(ob.name)} <span class="badge" style="border-color:${cat.color};color:${cat.color};">${cat.label}</span>${ob.priority && ob.priority !== 'media' ? ` <span class="badge" style="border-color:var(--ink-soft);color:var(--ink-soft);">Prioridade: ${prio.label}</span>` : ''}</div>`
        + `<div class="mgmt-sub">🏢 ${escapeHtml(companyName(ob.company_id) || '—')} · ${FREQ_LABELS[ob.frequency]} · ${escapeHtml(freqSummary(ob))} · Responsável: ${escapeHtml(ob.responsible || '—')}</div>`
        + `<div class="mgmt-sub">${lastLine}</div>`
      + '</div>'
      + '<div class="mgmt-actions">'
        + `<button class="icon-btn" data-action="edit" data-id="${ob.id}">Editar</button>`
        + `<button class="icon-btn" data-action="undo" data-id="${ob.id}">↺ Desfazer conclusão</button>`
        + `<button class="icon-btn danger" data-action="delete" data-id="${ob.id}">Excluir</button>`
      + '</div>'
      + '</div>';
  }).join('');
}
