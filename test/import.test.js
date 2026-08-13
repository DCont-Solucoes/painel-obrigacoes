import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('bulk import uses the atomic server-side RPC', async () => {
  const api = await readFile(new URL('../js/api/obligations.js', import.meta.url), 'utf8');

  assert.match(api, /\.rpc\('import_obligations', \{ p_items: obs \}\)/);
  assert.doesNotMatch(api, /BATCH_SIZE|Falha ao desfazer importação parcial/);
});

test('import RPC enforces authentication and admin access before bypassing RLS', async () => {
  const schema = await readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8');
  const functionSql = schema.match(/create or replace function import_obligations[\s\S]*?grant execute on function import_obligations\(jsonb\) to authenticated;/)?.[0] || '';

  assert.match(functionSql, /security definer/i);
  assert.match(functionSql, /auth\.uid\(\) is null/);
  assert.match(functionSql, /not is_admin\(auth\.uid\(\)\)/);
  assert.match(functionSql, /jsonb_array_length\(p_items\) > 2000/);
  assert.match(functionSql, /revoke all on function import_obligations\(jsonb\) from public/);
  assert.match(functionSql, /grant execute on function import_obligations\(jsonb\) to authenticated/);
});
