import { STATE, isAdmin, companyName, activeOccurrences } from '../state.js';
import { catInfo, priorityInfo } from '../constants.js';
import {
  escapeHtml, fmtBR, deltaLabel, fmtKey,
} from '../dateUtils.js';
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
  const counts = toneCounts(items);
  const health = items.length ? Math.round(((counts.green + counts.muted) / items.length) * 100) : 100;
  const healthTone = health >= 85 ? 'green' : health >= 65 ? 'amber' : 'red';
  const urgent = counts.red + counts.amber;
  const narrative = urgent
    ? `<strong>${urgent} obrigação(ões) exigem atenção</strong>, sendo ${counts.red} já atrasada(s). Priorize a recuperação antes de absorver novos riscos.`
    : '<strong>Operação sob controle.</strong> Não há vencimentos críticos no horizonte atual; preserve o ritmo e monitore os próximos picos.';

  return '<section class="dashboard-opening">'
    + '<div class="dashboard-eyebrow">SAÚDE DA OPERAÇÃO · AGORA</div>'
    + '<div class="dashboard-hero">'
      + '<div class="health-score">'
        + `<div class="health-ring tone-${healthTone}" style="--score:${health}" role="img" aria-label="Índice de saúde ${health} de 100"><div><strong>${health}</strong><span>/100</span></div></div>`
        + '<div><span class="health-label">Índice de saúde</span><p>Percentual da carteira sem atraso ou alerta imediato.</p></div>'
      + '</div>'
      + `<div class="dashboard-narrative"><span>Leitura executiva</span><p>${narrative}</p><small>Atualizado a partir de ${items.length} ocorrência(s) ativa(s).</small></div>`
    + '</div>'
    + renderStats(items)
    + `<div class="benchmark-line"><span>Desempenho em 6 meses</span><strong>${overall.pct === null ? 'Sem base histórica' : `${overall.pct}% no prazo`}</strong><span>${overall.total} conclusão(ões) analisada(s)</span></div>`
    + '</section>';
}

function actionSection(items) {
  const overdue = items.filter((it) => it.status.tone === 'red');
  const dueSoon = items.filter((it) => it.status.tone === 'amber');
  const critical = overdue.filter((it) => it.ob.priority === 'critica' || it.ob.priority === 'alta');
  const unassigned = items.filter((it) => !it.ob.responsible && (it.status.tone === 'red' || it.status.tone === 'amber'));
  const actions = [];

  if (critical.length) actions.push({ tone: 'red', tag: 'AÇÃO IMEDIATA', title: `Recuperar ${critical.length} item(ns) crítico(s)`, text: 'Alinhe responsável e novo compromisso ainda hoje.', cta: 'Ver lista de risco', target: 'risk-register' });
  if (unassigned.length) actions.push({ tone: 'amber', tag: 'DEFINIR DONO', title: `Atribuir ${unassigned.length} pendência(s)`, text: 'Itens urgentes sem responsável aumentam o risco operacional.', cta: 'Ver responsáveis', target: 'tactical-owner' });
  if (dueSoon.length) actions.push({ tone: 'amber', tag: 'PRÓXIMOS 7 DIAS', title: `Proteger ${dueSoon.length} vencimento(s)`, text: 'Confirme documentos e capacidade antes do prazo apertar.', cta: 'Ver riscos', target: 'risk-register' });
  if (!actions.length) actions.push({ tone: 'green', tag: 'MANTER RITMO', title: 'Nenhuma ação corretiva agora', text: 'Revise os sinais preditivos e prepare os próximos vencimentos.', cta: 'Ver predições', target: 'predictive-risk' });

  return '<section class="dashboard-section"><div class="section-title-row"><div><span class="dashboard-eyebrow">DA LEITURA À DECISÃO</span><h2>O que fazer agora</h2></div><p>Recomendações priorizadas por urgência e impacto.</p></div>'
    + `<div class="action-grid">${actions.slice(0, 3).map((a, index) => `<article class="action-card tone-${a.tone}"><div class="action-order">0${index + 1}</div><div><span class="action-tag">${a.tag}</span><h3>${a.title}</h3><p>${a.text}</p><a href="#${a.target}">${a.cta} →</a></div></article>`).join('')}</div></section>`;
}

function riskSection(items) {
  const risky = items
    .filter((it) => (it.ob.priority === 'alta' || it.ob.priority === 'critica') && (it.status.tone === 'red' || it.status.tone === 'amber'))
    .sort((a, b) => {
      const da = a.displayDate ? a.displayDate.getTime() : Infinity;
      const db = b.displayDate ? b.displayDate.getTime() : Infinity;
      return da - db;
    });

  if (!risky.length) {
    return '<div class="report-section" id="risk-register"><h3 class="report-heading">Lista de risco (prioridade alta/crítica)</h3>'
      + '<div class="empty">Nenhuma obrigação de prioridade alta ou crítica está atrasada ou vencendo em breve.</div></div>';
  }

  const rows = risky.map(({
    ob, displayDate, override, status,
  }) => {
    const prio = priorityInfo(ob.priority);
    return '<div class="mgmt-row">'
      + '<div class="mgmt-main">'
        + `<div class="mgmt-name">${escapeHtml(ob.name)} <span class="badge" style="border-color:var(--red);color:var(--red);">${escapeHtml(prio.label)}</span> <span class="status-pill tone-${status.tone}">${escapeHtml(status.label)}</span></div>`
        + `<div class="mgmt-sub">🏢 ${escapeHtml(companyName(ob.company_id) || '—')} · 👤 ${escapeHtml(ob.responsible || '—')} · vencimento ${displayDate ? fmtBR(displayDate) : '—'} (${deltaLabel(status.diffDays)})${override ? ' · 📌 data ajustada' : ''}</div>`
      + '</div>'
    + '</div>';
  }).join('');

  return `<div class="report-section" id="risk-register"><h3 class="report-heading">Lista de risco (prioridade alta/crítica) — ${risky.length}</h3>${rows}</div>`;
}

// Abaixo desse número de conclusões históricas, não confiamos na taxa de
// atraso calculada (amostra pequena demais para significar algo) — melhor
// não mostrar nada do que sugerir um risco baseado em 1 ou 2 eventos.
const MIN_HISTORICAL_SAMPLE = 3;
// A partir de que taxa histórica de atraso vale a pena chamar atenção do
// gestor para algo que ainda está no prazo hoje.
const RISK_THRESHOLD_PCT = 30;

// % de conclusões atrasadas nesse histórico, ou null se a amostra for
// pequena demais para significar algo (ver MIN_HISTORICAL_SAMPLE).
function historicalLateRatePct(completions) {
  const stats = computeStats(completions);
  if (stats.total < MIN_HISTORICAL_SAMPLE || stats.pct === null) return null;
  return 100 - stats.pct;
}

// Sinaliza obrigações que ainda estão no prazo hoje (verde/sem pendência —
// as já atrasadas/vencendo em breve já aparecem na Lista de risco), mas
// cujo histórico mostra uma taxa de atraso alta. Isso é estatística
// simples sobre o que o painel já coleta (não é um modelo treinado) — a
// ideia é sinalizar ANTES do prazo apertar, não só depois.
function predictiveRiskSection(items) {
  const obligationById = new Map(STATE.obligations.map((o) => [o.id, o]));

  const completionsByObligation = new Map();
  const completionsByGroup = new Map(); // "empresa|categoria" -> completions[]
  STATE.completions.forEach((c) => {
    if (!completionsByObligation.has(c.obligation_id)) completionsByObligation.set(c.obligation_id, []);
    completionsByObligation.get(c.obligation_id).push(c);

    const ob = obligationById.get(c.obligation_id);
    if (!ob) return;
    const groupKey = `${ob.company_id || 'sem-empresa'}|${ob.category}`;
    if (!completionsByGroup.has(groupKey)) completionsByGroup.set(groupKey, []);
    completionsByGroup.get(groupKey).push(c);
  });

  const candidates = items
    .filter((it) => it.status.tone === 'green' || it.status.tone === 'muted')
    .map((it) => {
      const ownRate = historicalLateRatePct(completionsByObligation.get(it.ob.id) || []);
      if (ownRate !== null) return { it, rate: ownRate, source: 'histórico desta obrigação' };
      const groupKey = `${it.ob.company_id || 'sem-empresa'}|${it.ob.category}`;
      const groupRate = historicalLateRatePct(completionsByGroup.get(groupKey) || []);
      return { it, rate: groupRate, source: 'histórico de empresa + categoria' };
    })
    .filter((c) => c.rate !== null && c.rate >= RISK_THRESHOLD_PCT)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 10);

  if (!candidates.length) {
    return `<div class="report-section" id="predictive-risk"><h3 class="report-heading">Risco preditivo de atraso (histórico ≥ ${RISK_THRESHOLD_PCT}%)</h3>`
      + '<div class="empty">Nenhuma obrigação ainda no prazo tem histórico de atraso relevante (ou não há dados suficientes ainda).</div></div>';
  }

  const rows = candidates.map(({ it, rate, source }) => {
    const {
      ob, displayDate, override, status,
    } = it;
    return '<div class="mgmt-row">'
      + '<div class="mgmt-main">'
        + `<div class="mgmt-name">${escapeHtml(ob.name)} <span class="status-pill tone-amber">${rate}% de atraso histórico</span></div>`
        + `<div class="mgmt-sub">🏢 ${escapeHtml(companyName(ob.company_id) || '—')} · 👤 ${escapeHtml(ob.responsible || '—')} · vencimento ${displayDate ? fmtBR(displayDate) : '—'} (${deltaLabel(status.diffDays)})${override ? ' · 📌 data ajustada' : ''} · baseado em ${source}</div>`
      + '</div>'
    + '</div>';
  }).join('');

  return `<div class="report-section" id="predictive-risk"><h3 class="report-heading">Risco preditivo de atraso (histórico ≥ ${RISK_THRESHOLD_PCT}%) — ${candidates.length}</h3>${rows}</div>`;
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
    + `<div id="tactical-owner">${tacticalTable('Visão tática — por responsável', items, completions, (ob) => ob.responsible || 'Sem responsável')}</div>`;
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

// Quantos dias olhar à frente para medir concentração de vencimentos.
const CONCENTRATION_WINDOW_DAYS = 30;
// Um dia só é destacado se tiver uma concentração bem acima da média dos
// dias que têm pelo menos um vencimento (não da média geral, que incluiria
// os dias vazios e sub-estimaria o que é "normal").
const CONCENTRATION_SPIKE_FACTOR = 1.5;

// Mostra em quais dias, dos próximos 30, os vencimentos estão concentrados
// bem acima do normal — puramente informativo (nada é reagendado
// sozinho); a ideia é o gestor enxergar picos de carga com antecedência e
// decidir se vale antecipar alguma obrigação flexível.
function concentrationSection(items) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const counts = new Map();
  for (let i = 0; i < CONCENTRATION_WINDOW_DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    counts.set(fmtKey(d), 0);
  }
  items.forEach((it) => {
    if (!it.displayDate) return;
    const key = fmtKey(it.displayDate);
    if (counts.has(key)) counts.set(key, counts.get(key) + 1);
  });

  const daysWithVencimento = Array.from(counts.values()).filter((v) => v > 0);
  if (!daysWithVencimento.length) {
    return `<div class="report-section"><h3 class="report-heading">Concentração de vencimentos (próximos ${CONCENTRATION_WINDOW_DAYS} dias)</h3>`
      + '<div class="empty">Nenhum vencimento previsto nos próximos dias.</div></div>';
  }

  const avg = daysWithVencimento.reduce((a, b) => a + b, 0) / daysWithVencimento.length;
  const peakDays = Array.from(counts.entries())
    .filter(([, count]) => count > 0 && count > avg * CONCENTRATION_SPIKE_FACTOR)
    .sort((a, b) => b[1] - a[1]);

  if (!peakDays.length) {
    return `<div class="report-section"><h3 class="report-heading">Concentração de vencimentos (próximos ${CONCENTRATION_WINDOW_DAYS} dias)</h3>`
      + `<div class="empty">Vencimentos bem distribuídos — nenhum dia se destaca acima da média de ${avg.toFixed(1)} por dia.</div></div>`;
  }

  const rows = peakDays.map(([dateKey, count]) => {
    const d = new Date(`${dateKey}T00:00:00`);
    return '<div class="mgmt-row">'
      + '<div class="mgmt-main">'
        + `<div class="mgmt-name">${fmtBR(d)} <span class="status-pill tone-amber">${count} vencimento(s)</span></div>`
        + `<div class="mgmt-sub">Bem acima da média de ${avg.toFixed(1)} vencimento(s)/dia nos próximos ${CONCENTRATION_WINDOW_DAYS} dias — considere antecipar alguma obrigação flexível para aliviar esse dia.</div>`
      + '</div>'
    + '</div>';
  }).join('');

  return `<div class="report-section"><h3 class="report-heading">Concentração de vencimentos (próximos ${CONCENTRATION_WINDOW_DAYS} dias) — ${peakDays.length} dia(s) de pico</h3>${rows}</div>`;
}

export function renderDashboard() {
  if (!isAdmin()) {
    return '<div class="empty">Esta área é restrita a administradores.</div>';
  }

  const items = activeOccurrences();
  const completions = recentCompletions();

  return '<div class="executive-dashboard">'
    + kpiSection(items)
    + actionSection(items)
    + '<section class="dashboard-section"><div class="section-title-row"><div><span class="dashboard-eyebrow">OLHAR À FRENTE</span><h2>Riscos e predições</h2></div><p>Sinais antecipados pelo histórico e pela carga futura.</p></div><div class="dashboard-two-columns">'
      + predictiveRiskSection(items)
      + concentrationSection(items)
    + '</div></section>'
    + '<section class="dashboard-section"><div class="section-title-row"><div><span class="dashboard-eyebrow">FOCO OPERACIONAL</span><h2>Exceções que pedem atenção</h2></div><p>Do mais urgente para o que requer conferência.</p></div>'
      + riskSection(items)
      + ocrMismatchSection()
    + '</section>'
    + '<details class="dashboard-details"><summary><span>Explorar diagnóstico completo</span><small>Empresas, categorias, responsáveis e tendência histórica</small></summary><div class="dashboard-details-body">'
      + trendSection()
      + tacticalSection(items, completions)
    + '</div></details>'
  + '</div>';
}
