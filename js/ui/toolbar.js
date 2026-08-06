import { STATE, isAdmin } from '../state.js';
import { CATEGORIES } from '../constants.js';
import { escapeHtml } from '../dateUtils.js';

function distinctResponsibles() {
  const set = new Set();
  STATE.obligations.forEach((o) => { if (o.responsible) set.add(o.responsible); });
  return Array.from(set).sort();
}

function ddHtml(key, allLabel, options, selected) {
  let selLabel = allLabel;
  if (selected !== 'all') {
    const found = options.find((o) => o.value === selected);
    if (found) selLabel = found.label;
  }
  const items = `<div class="dd-item ${selected === 'all' ? 'active' : ''}" data-action="dd-select" data-dd="${key}" data-value="all">${escapeHtml(allLabel)}</div>`
    + options.map((o) => `<div class="dd-item ${selected === o.value ? 'active' : ''}" data-action="dd-select" data-dd="${key}" data-value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</div>`).join('');
  return `<div class="dd" data-dd-root="${key}">`
    + `<button type="button" class="dd-btn" data-action="dd-toggle" data-dd="${key}"><span class="dd-label">${escapeHtml(selLabel)}</span><span class="dd-caret">▾</span></button>`
    + `<div class="dd-panel hidden" data-dd-panel="${key}">${items}</div>`
    + '</div>';
}

export function renderToolbar() {
  const resp = distinctResponsibles();
  const empresaOptions = STATE.companies.map((c) => ({ value: c.id, label: c.name }));

  let html = '<section class="toolbar">';
  html += '<div class="tabs">';
  html += `<button class="tab-btn ${STATE.view === 'board' ? 'active' : ''}" data-action="tab" data-tab="board">Painel</button>`;
  html += `<button class="tab-btn ${STATE.view === 'manage' ? 'active' : ''}" data-action="tab" data-tab="manage">Gerenciar</button>`;
  html += '</div>';
  html += '<div class="filters">';
  html += ddHtml('empresa', 'Todas as empresas', empresaOptions, STATE.filters.empresa);
  html += ddHtml('category', 'Todas as categorias', CATEGORIES.map((c) => ({ value: c.key, label: c.label })), STATE.filters.category);
  html += ddHtml('responsible', 'Todos os responsáveis', resp.map((r) => ({ value: r, label: r })), STATE.filters.responsible);
  if (isAdmin()) {
    html += '<button class="btn-primary" data-action="new">+ Nova obrigação</button>';
  }
  html += '</div></section>';
  return html;
}
