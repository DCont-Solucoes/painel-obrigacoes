import assert from 'node:assert/strict';
import { test } from 'node:test';

import { STATE } from '../js/state.js';
import { renderToolbar } from '../js/ui/toolbar.js';

function resetState() {
  STATE.profile = { role: 'membro', active: true };
  STATE.session = { id: 'user-1' };
  STATE.obligations = [];
  STATE.companies = [];
  STATE.filters = {
    empresa: 'all', category: 'all', responsible: 'all', status: 'all', receipt: 'all',
  };
  STATE.validation = { pending: 0, rejected: 0 };
  STATE.view = 'board';
}

test('toolbar identifica navegação atual e oferece filtros acessíveis', () => {
  resetState();
  const html = renderToolbar();

  assert.match(html, /<nav class="tabs" aria-label="Áreas do painel">/);
  assert.match(html, /data-tab="board" aria-current="page"/);
  assert.match(html, /aria-haspopup="listbox" aria-expanded="false"/);
  assert.match(html, /role="option" aria-selected="true"/);
  assert.doesNotMatch(html, /data-action="clear-filters"/);
  assert.match(html, /data-dd="status" data-value="today"[^>]*>Vence hoje/);
  assert.doesNotMatch(html, /Todos os vencimentos/);
  assert.match(html, /data-value="missing"[^>]*>Sem comprovante/);
});

test('toolbar identifica Vence hoje como status selecionado', () => {
  resetState();
  STATE.filters.status = 'today';

  const html = renderToolbar();

  assert.match(html, /class="dd-label">Vence hoje<\/span>/);
  assert.match(html, /data-dd="status" data-value="today"[^>]*aria-selected="true"[^>]*>Vence hoje/);
});

test('toolbar sinaliza e permite limpar filtros ativos', () => {
  resetState();
  STATE.filters.empresa = 'empresa-1';
  STATE.filters.status = 'red';

  const html = renderToolbar();

  assert.match(html, /data-action="clear-filters"/);
  assert.match(html, /Limpar 2 filtro\(s\) ativo\(s\)/);
  assert.match(html, /Limpar filtros <span>2<\/span>/);
});

test('toolbar contabiliza o filtro de comprovante', () => {
  resetState();
  STATE.filters.receipt = 'missing';

  const html = renderToolbar();

  assert.match(html, /Sem comprovante<\/span>/);
  assert.match(html, /Limpar 1 filtro\(s\) ativo\(s\)/);
});
