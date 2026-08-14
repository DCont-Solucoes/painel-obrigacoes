import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { STATE, isAdmin, isManager } from '../js/state.js';
import { renderToolbar } from '../js/ui/toolbar.js';

test.afterEach(() => {
  STATE.profile = null;
  STATE.obligations = [];
  STATE.companies = [];
  STATE.validation = { pending: 0, rejected: 0 };
});

test('gestor tem acesso operacional sem ser administrador de acessos', () => {
  STATE.profile = { role: 'gestor', active: true };
  assert.equal(isManager(), true);
  assert.equal(isAdmin(), false);
  assert.match(renderToolbar(), /data-tab="manage"/);
});

test('membro ativo pode iniciar o cadastro de uma obrigação', () => {
  STATE.profile = { role: 'membro', active: true };
  assert.equal(isManager(), false);
  assert.match(renderToolbar(), /data-action="new"/);
  assert.doesNotMatch(renderToolbar(), /data-tab="manage"/);
});

test('migração cria gestor, libera criação e mantém comprovantes visíveis à equipe', async () => {
  const sql = await readFile(new URL('../sql/migrations/20260814_add_manager_role_and_member_creation.sql', import.meta.url), 'utf8');
  assert.match(sql, /role in \('admin', 'gestor', 'membro'\)/);
  assert.match(sql, /obligations_insert_authenticated/);
  assert.match(sql, /with check \(auth\.uid\(\) is not null\)/);
  assert.match(sql, /comprovantes_select_authenticated[\s\S]*?to authenticated/);
});
