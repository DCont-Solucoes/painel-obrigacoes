import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../sql/migrations/20260815_isolate_workspaces_by_cnpj.sql', import.meta.url);

test('legacy records are assigned to the requested CNPJ workspace', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /00\.999\.175\/0001-54/);
  assert.match(sql, /update public\.companies set workspace_id=/);
  assert.match(sql, /update public\.obligations set workspace_id=/);
  assert.match(sql, /alter table public\.completions alter column workspace_id set not null/);
  assert.match(sql, /workspaces_document_cnpj_check/);
});

test('tenant RLS never grants the superuser implicit operational access', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /create or replace function public\.can_access_workspace/);
  const accessFunction = sql.match(/create or replace function public\.can_access_workspace[\s\S]*?\$\$;/)?.[0] || '';
  assert.doesNotMatch(accessFunction, /is_super_admin/);
  assert.match(sql, /public\.can_access_workspace\(workspace_id\)/);
  assert.match(sql, /Vínculo entre empresas diferentes/);
});

test('attachments are namespaced and protected by workspace', async () => {
  const [sql, storage] = await Promise.all([
    readFile(migrationUrl, 'utf8'),
    readFile(new URL('../js/api/storage.js', import.meta.url), 'utf8'),
  ]);
  assert.match(storage, /`\$\{workspaceId\}\/\$\{obligationId\}\//);
  assert.match(sql, /comprovantes_tenant_select/);
  assert.match(sql, /storage\.foldername\(name\)/);
});
