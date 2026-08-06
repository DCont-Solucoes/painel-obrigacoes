import { STATE, isAdmin, companyName, activeOccurrences } from '../state.js';
import { catInfo, priorityInfo } from '../constants.js';
import { escapeHtml, fmtBR, deltaLabel } from '../dateUtils.js';
import { renderStats } from './board.js';
import { computeStats, groupRow } from './reports.js';

function recentCompletions() {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const cutoff = sixMonthsAgo.toISOString().slice(0, 10);
  return STATE.completions.filter((c) => c.occurrence_date >= cutoff);
}

function kpiSection(items) {
  const overall = computeStats(recentCompletions());
  const overallHtml = overall.total
    ? groupRow('Taxa de cumprimento no prazo (últimos 6 meses)', overall)
    : '<div class="empty">Sem conclusões registradas nos últimos 6 meses ainda.</div>';

  return '<div class="report-section"><h3 class="report-heading">Visão executiva</h3>'
    + renderStats(items)
    + overallHtml
    + '</div>';
}

function riskSection(items) {
  const risky = items
    .filter((it) => (it.ob.priority === 'alta' || it.ob.priority === 'critica') && (it.status.tone === 'red' || it.status.tone === 'amber'))
    .sort((a, b) => {
      const da = a.active ? a.active.getTime() : Infinity;
      const db = b.active ? b.active.getTime() : Infinity;
      return da - db;
    });

  if (!risky.length) {
    return '<div class="report-section"><h3 class="report-heading">Lista de risco (prioridade alta/crítica)</h3>'
      + '<div class="empty">Nenhuma obrigação de prioridade alta ou crítica está atrasada ou vencendo em breve.</div></div>';
  }

  const rows = risky.map(({ ob, active, status }) => {
    const prio = priorityInfo(ob.priority);
    return '<div class="mgmt-row">'
      + '<div class="mgmt-main">'
        + `<div class="mgmt-name">${escapeHtml(ob.name)} <span class="badge" style="border-color:var(--red);color:var(--red);">${escapeHtml(prio.label)}</span> <span class="status-pill tone-${status.tone}">${escapeHtml(status.label)}</span></div>`
        + `<div class="mgmt-sub">🏢 ${escapeHtml(companyName(ob.company_id) || '—')} · 👤 ${escapeHtml(ob.responsible || '—')} · vencimento ${active ? fmtBR(active) : '—'} (${deltaLabel(status.diffDays)})</div>`
      + '</div>'
    + '</div>';
  }).join('');

  return `<div class="report-section"><h3 class="report-heading">Lista de risco (prioridade alta/crítica) — ${risky.length}</h3>${rows}</div>`;
}

// Conclusões cujo comprovante foi lido por OCR e pareceu ser de uma
// competência diferente da ocorrência concluída (ver js/ocr.js) — a pessoa
// já viu o aviso na hora e confirmou mesmo assim, mas o gestor também
// precisa saber, sem depender só do e-mail diário.
function ocrMismatchSection() {
  const obligationById = new Map(STATE.obligations.map((o) => [o.id, o]));
  const mismatches = STATE.completions
    .filter((c) => c.ocr_status === 'mismatch')
    .sort((a, b) => b.done_at.localeCompare(a.done_at))
    .slice(0, 20);

  if (!mismatches.length) {
    return '<div class="report-section"><h3 class="report-heading">Divergências de comprovante (competência)</h3>'
      + '<div class="empty">Nenhuma divergência de competência sinalizada pela conferência automática de comprovantes.</div></div>';
  }

  const rows = mismatches.map((c) => {
    const ob = obligationById.get(c.obligation_id);
    return '<div class="mgmt-row">'
      + '<div class="mgmt-main">'
        + `<div class="mgmt-name">${escapeHtml(ob?.name || 'Obrigação removida')} <span class="status-pill tone-amber">Divergência</span></div>`
        + `<div class="mgmt-sub">Comprovante da competência ${escapeHtml(c.ocr_extracted_period || '—')} · ocorrência ${escapeHtml(c.occurrence_date)} · concluído por <strong>${escapeHtml(c.done_by_name)}</strong> em ${fmtBR(new Date(c.done_at))}${c.attachment_path ? ` · <button type="button" class="comment-delete" data-action="view-attachment" data-path="${escapeHtml(c.attachment_path)}">ver comprovante</button>` : ''}</div>`
      + '</div>'
    + '</div>';
  }).join('');

  return `<div class="report-section"><h3 class="report-heading">Divergências de comprovante (competência) — ${mismatches.length}</h3>${rows}</div>`;
}

function toneCounts(list) {
  const counts = { red: 0, amber: 0, green: 0, muted: 0 };
  list.forEach((it) => { counts[it.status.tone]++; });
  return counts;
}

function tacticalRow(label, groupItems, completionsForGroup) {
  const counts = toneCounts(groupItems);
  const stats = computeStats(completionsForGroup);
  const pctLabel = stats.pct === null ? '—' : `${stats.pct}%`;
  return '<div class="mgmt-row">'
    + '<div class="mgmt-main">'
      + `<div class="mgmt-name">${escapeHtml(label)}</div>`
      + `<div class="mgmt-sub">🔴 ${counts.red} atrasada(s) · 🟠 ${counts.amber} vence(m) em breve · 🟢 ${counts.green} no prazo · ⚪ ${counts.muted} sem pendência · cumprimento (6m): ${pctLabel}</div>`
    + '</div>'
  + '</div>';
}

// Agrupa `items` (situação atual) e `completions` (histórico de 6 meses) pela
// mesma chave, para renderizar uma tabela tática por dimensão (empresa,
// categoria ou responsável) sem repetir esse acoplamento três vezes.
function tacticalTable(heading, items, completions, keyFn) {
  const obligationById = new Map(STATE.obligations.map((o) => [o.id, o]));

  const itemsByKey = new Map();
  items.forEach((it) => {
    const key = keyFn(it.ob);
    if (!itemsByKey.has(key)) itemsByKey.set(key, []);
    itemsByKey.get(key).push(it);
  });

  const completionsByKey = new Map();
  completions.forEach((c) => {
    const ob = obligationById.get(c.obligation_id);
    if (!ob) return;
    const key = keyFn(ob);
    if (!completionsByKey.has(key)) completionsByKey.set(key, []);
    completionsByKey.get(key).push(c);
  });

  const rows = Array.from(itemsByKey.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, groupItems]) => tacticalRow(key, groupItems, completionsByKey.get(key) || []))
    .join('');

  return `<div class="report-section"><h3 class="report-heading">${escapeHtml(heading)}</h3>${rows || '<div class="empty">Nenhuma obrigação cadastrada.</div>'}</div>`;
}

function tacticalSection(items, completions) {
  return tacticalTable('Visão tática — por empresa', items, completions, (ob) => companyName(ob.company_id) || 'Sem empresa')
    + tacticalTable('Visão tática — por categoria', items, completions, (ob) => catInfo(ob.category).label)
    + tacticalTable('Visão tática — por responsável', items, completions, (ob) => ob.responsible || 'Sem responsável');
}

function trendSection() {
  const now = new Date();
  const rows = Array.from({ length: 6 }, (_, i) => 5 - i).map((monthsAgo) => {
    const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const monthCompletions = STATE.completions.filter((c) => c.occurrence_date >= from && c.occurrence_date <= to);
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return groupRow(label.charAt(0).toUpperCase() + label.slice(1), computeStats(monthCompletions));
  }).join('');

  return `<div class="report-section"><h3 class="report-heading">Tendência de cumprimento (últimos 6 meses)</h3>${rows}</div>`;
}

export function renderDashboard() {
  if (!isAdmin()) {
    return '<div class="empty">Esta área é restrita a administradores.</div>';
  }

  const items = activeOccurrences();
  const completions = recentCompletions();

  return kpiSection(items)
    + riskSection(items)
    + ocrMismatchSection()
    + tacticalSection(items, completions)
    + trendSection();
}
