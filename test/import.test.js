import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('bulk import uses one atomic table insert without requiring an optional RPC', async () => {
  const api = await readFile(new URL('../js/api/obligations.js', import.meta.url), 'utf8');

  assert.match(api, /\.from\('obligations'\)\.insert\(obs\)\.select\(\)/);
  assert.doesNotMatch(api, /\.rpc\('import_obligations'/);
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

test('obligations table does not force RLS on the validated security-definer importer', async () => {
  const schema = await readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8');

  assert.match(schema, /alter table obligations no force row level security;/i);
});

test('deployed entry module is cache-busted so browsers stop using the old batched importer', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const render = await readFile(new URL('../js/render.js', import.meta.url), 'utf8');
  const data = await readFile(new URL('../js/data.js', import.meta.url), 'utf8');
  const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));

  assert.match(html, /js\/app\.js\?v=[^"']+/);
  assert.match(app, /\.\/data\.js\?v=[^"']+/);
  assert.match(app, /\.\/render\.js\?v=[^"']+/);
  assert.match(render, /\.\/data\.js\?v=[^"']+/);
  assert.match(data, /\.\/api\/obligations\.js\?v=[^"']+/);
  assert.ok(vercel.headers.some((rule) => (
    rule.source.includes('js|html|json')
      && rule.headers.some((header) => header.key === 'Cache-Control' && /no-store/.test(header.value))
  )));
});

test('RLS import errors explain required admin access and schema update', async () => {
  const data = await readFile(new URL('../js/data.js', import.meta.url), 'utf8');

  assert.match(data, /err\.code === '42501'/);
  assert.match(data, /conta é administradora/);
  assert.match(data, /sql\/schema\.sql/);
  assert.doesNotMatch(data, /err\.code === 'PGRST202'/);
});
