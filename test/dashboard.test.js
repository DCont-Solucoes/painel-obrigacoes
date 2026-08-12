import test from 'node:test';
import assert from 'node:assert/strict';

import { STATE } from '../js/state.js';
import { renderDashboard } from '../js/ui/dashboard.js';

test('dashboard executivo organiza a narrativa da saúde até a ação', () => {
  STATE.profile = { role: 'admin', active: true };
  STATE.obligations = [];
  STATE.companies = [];
  STATE.completions = [];
  STATE.occurrenceOverrides = [];
  STATE.holidays = [];

  const html = renderDashboard();

  assert.match(html, /Índice de saúde/);
  assert.match(html, /Leitura executiva/);
  assert.match(html, /O que fazer agora/);
  assert.match(html, /Riscos e predições/);
  assert.match(html, /Explorar diagnóstico completo/);
  assert.match(html, /aria-label="Índice de saúde 100 de 100"/);
});

test('dashboard permanece restrito a administradores', () => {
  STATE.profile = { role: 'member', active: true };
  assert.match(renderDashboard(), /restrita a administradores/);
});
