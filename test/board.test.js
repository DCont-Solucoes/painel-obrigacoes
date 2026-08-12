import assert from 'node:assert/strict';
import { test } from 'node:test';

import { STATE } from '../js/state.js';
import { renderBoard } from '../js/ui/board.js';

function isoFromToday(offset) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function resetState() {
  STATE.profile = { role: 'membro', active: true };
  STATE.session = { id: 'user-1', email: 'user@example.com' };
  STATE.obligations = [];
  STATE.companies = [];
  STATE.completions = [];
  STATE.occurrenceOverrides = [];
  STATE.holidays = [];
  STATE.checklistItems = [];
  STATE.filters = { empresa: 'all', category: 'all', responsible: 'all', status: 'all' };
}

test('painel apresenta o resumo operacional mesmo sem ocorrências', () => {
  resetState();

  const html = renderBoard();

  assert.match(html, /GESTÃO À VISTA · AGORA/);
  assert.match(html, /prazos prioritários/);
  assert.match(html, /ocorrências acompanhadas/);
  assert.match(html, /Nenhuma obrigação corresponde a este filtro/);
});

test('filtro de status concentra o painel na situação selecionada', () => {
  resetState();
  STATE.obligations = [
    {
      id: 'overdue', name: 'Obrigação atrasada', category: 'federal', frequency: 'pontual',
      due_date: isoFromToday(-2), priority: 'media', responsible: 'Ana', responsible_id: 'user-1',
      company_id: null, business_day_shift: 'nenhum',
    },
    {
      id: 'soon', name: 'Obrigação próxima', category: 'federal', frequency: 'pontual',
      due_date: isoFromToday(2), priority: 'media', responsible: 'Ana', responsible_id: 'user-1',
      company_id: null, business_day_shift: 'nenhum',
    },
  ];
  STATE.filters.status = 'red';

  const html = renderBoard();

  assert.match(html, /Obrigação atrasada/);
  assert.doesNotMatch(html, /Obrigação próxima/);
  assert.match(html, /ocorrências acompanhadas/);
});
