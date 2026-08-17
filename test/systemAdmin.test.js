import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { STATE, isAdmin, isSuperUser } from '../js/state.js';
import { renderSystemAdmin } from '../js/ui/systemAdmin.js';

test.afterEach(() => { STATE.profile = null; STATE.workspaces = []; STATE.profiles = []; });

test('superusuário mantém poderes administrativos e acesso exclusivo', () => {
  STATE.profile = { role: 'super_admin', active: true };
  assert.equal(isSuperUser(), true);
  assert.equal(isAdmin(), true);
});

test('tela apresenta empresas, modalidade e administrador do espaço', () => {
  STATE.workspaces = [{ id: 'w1', name: 'Acme Ltda', document: '00.000.000/0001-00', access_status: 'trial', trial_ends_at: '2026-08-29' }];
  STATE.profiles = [{ workspace_id: 'w1', role: 'admin', display_name: 'Maria', email: 'maria@acme.test' }];
  const html = renderSystemAdmin();
  assert.match(html, /Acme Ltda/);
  assert.match(html, /Degustação/);
  assert.match(html, /Maria/);
  assert.match(html, /Liberar completo/);
});

test('migração concede super admin ao Marco existente e em novos cadastros', async () => {
  const sql = await readFile(new URL('../sql/migrations/20260815_grant_marco_super_admin.sql', import.meta.url), 'utf8');
  assert.match(sql, /lower\(new\.email\) = 'marcoantoniomiranda713@gmail\.com'/);
  assert.match(sql, /set role = 'super_admin', active = true/);
  assert.match(sql, /and auth\.uid\(\) is not null/);
});

test('migração de reparo cria o perfil ausente do superusuário', async () => {
  const sql = await readFile(new URL('../sql/migrations/20260815_repair_marco_super_admin_profile.sql', import.meta.url), 'utf8');
  assert.match(sql, /from auth\.users/);
  assert.match(sql, /on conflict \(id\) do update/);
  assert.match(sql, /role = 'super_admin'/);
});

test('entrada da aplicação invalida módulos anteriores à tela de super admin', async () => {
  const [index, app, render] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/render.js', import.meta.url), 'utf8'),
  ]);
  const entryVersion = 'v=20260817-optional-receipts-v1';
  const moduleVersion = 'v=20260817-optional-receipts-v2';
  assert.doesNotMatch(index, /^(?:<<<<<<<|=======|>>>>>>>)/m);
  assert.match(index, new RegExp(`js/app\\.js\\?${entryVersion}`));
  assert.match(app, new RegExp(`data\\.js\\?${moduleVersion}`));
  assert.match(app, new RegExp(`render\\.js\\?${moduleVersion}`));
  assert.match(render, new RegExp(`data\\.js\\?${moduleVersion}`));
});

test('troca de papel espera a seleção efetiva em vez de reagir ao click que abre o combo', async () => {
  const render = await readFile(new URL('../js/render.js', import.meta.url), 'utf8');
  assert.match(render, /addEventListener\('change', onAppChange\)/);
  assert.match(render, /select\[data-action="team-change-role"\]/);
  assert.match(render, /action === 'team-change-role' && btn\.matches\('select'\)/);
});
