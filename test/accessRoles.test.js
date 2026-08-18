import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  STATE, isAdmin, isManager, canViewAllObligations,
} from '../js/state.js';
import { renderBoard } from '../js/ui/board.js';
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
  assert.equal(canViewAllObligations(), true);
  assert.match(renderToolbar(), /data-tab="manage"/);
  assert.doesNotMatch(renderToolbar(), /data-tab="mine"/);
});

test('gestor visualiza toda a carteira mesmo ao chegar pelo antigo recorte pessoal', () => {
  STATE.profile = { role: 'gestor', active: true };
  STATE.session = { id: 'gestor-1' };
  STATE.obligations = [
    {
      id: 'de-outro-responsavel', name: 'Obrigação de toda a equipe', category: 'federal',
      frequency: 'pontual', due_date: '2099-12-31', responsible: 'Maria',
      responsible_id: 'membro-2', company_id: null, business_day_shift: 'nenhum',
    },
  ];

  const html = renderBoard({ onlyMine: true });

  assert.match(html, /Obrigação de toda a equipe/);
  assert.match(html, /GESTÃO À VISTA · AGORA/);
});

test('membro ativo pode iniciar o cadastro de uma obrigação', () => {
  STATE.profile = { role: 'membro', active: true };
  assert.equal(isManager(), false);
  assert.equal(canViewAllObligations(), false);
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

test('isolamento permite a todos os papéis cadastrar obrigações e comprovantes no próprio workspace', async () => {
  const sql = await readFile(new URL('../sql/migrations/20260818_allow_all_roles_create_obligations_and_receipts.sql', import.meta.url), 'utf8');

  assert.match(sql, /obligations_tenant_insert[\s\S]*?to authenticated[\s\S]*?can_access_workspace\(workspace_id\)/);
  assert.match(sql, /companies_tenant_insert[\s\S]*?to authenticated[\s\S]*?can_access_workspace\(workspace_id\)/);
  assert.match(sql, /comprovantes_tenant_insert[\s\S]*?to authenticated/);
  assert.match(sql, /storage\.foldername\(name\)[\s\S]*?current_workspace_id\(\)/);
  assert.doesNotMatch(sql, /is_(?:admin|manager)\(auth\.uid\(\)\)/);
});
