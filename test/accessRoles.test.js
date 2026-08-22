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

test('migração de permissões também funciona antes da criação de workspace_id', async () => {
  const sql = await readFile(new URL('../sql/migrations/20260818_allow_all_roles_create_obligations_and_receipts.sql', import.meta.url), 'utf8');

  assert.match(sql, /information_schema\.columns[\s\S]*?table_name = 'obligations'[\s\S]*?column_name = 'workspace_id'/);
  assert.match(sql, /information_schema\.columns[\s\S]*?table_name = 'companies'[\s\S]*?column_name = 'workspace_id'/);
  assert.match(sql, /to_regprocedure\('public\.can_access_workspace\(uuid\)'\)/);
  assert.match(sql, /to_regprocedure\('public\.current_workspace_id\(\)'\)/);
  assert.match(sql, /with check \(auth\.uid\(\) is not null\)/);
});

test('erro de cadastro explica o vínculo ao workspace sem restringir membros à administração', async () => {
  const data = await readFile(new URL('../js/data.js', import.meta.url), 'utf8');

  assert.match(data, /perfil precisa estar ativo e vinculado ao espaço da empresa/);
  assert.doesNotMatch(data, /Somente um perfil administrador ativo pode cadastrar obrigações/);
});

test('gravações operacionais enviam explicitamente o workspace do perfil', async () => {
  const [context, obligations, companies, completions] = await Promise.all([
    readFile(new URL('../js/api/workspaceContext.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/api/obligations.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/api/companies.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/api/completions.js', import.meta.url), 'utf8'),
  ]);

  assert.match(context, /STATE\.profile\?\.workspace_id/);
  assert.match(context, /workspace_id/);
  assert.match(context, /não está vinculada a um espaço de empresa/);
  for (const source of [obligations, companies, completions]) {
    assert.match(source, /withCurrentWorkspace/);
  }
});

test('migração endurecida mantém criação e conclusão restritas ao workspace ativo', async () => {
  const sql = await readFile(new URL('../sql/migrations/20260818_harden_workspace_writes.sql', import.meta.url), 'utf8');
  assert.match(sql, /obligations_tenant_insert[\s\S]*can_access_workspace\(workspace_id\)/);
  assert.match(sql, /companies_tenant_insert[\s\S]*can_access_workspace\(workspace_id\)/);
  assert.match(sql, /completions_tenant_insert[\s\S]*done_by = auth\.uid\(\)/);
  assert.match(sql, /comprovantes_tenant_insert[\s\S]*storage\.foldername\(name\)/);
});
