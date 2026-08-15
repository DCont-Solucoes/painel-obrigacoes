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

test('entrada da aplicação invalida módulos anteriores à tela de super admin', async () => {
  const [index, app, render] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/render.js', import.meta.url), 'utf8'),
  ]);
  const version = 'v=20260815-super-admin-v1';
  assert.match(index, new RegExp(`js/app\\.js\\?${version}`));
  assert.match(app, new RegExp(`data\\.js\\?${version}`));
  assert.match(app, new RegExp(`render\\.js\\?${version}`));
  assert.match(render, new RegExp(`data\\.js\\?${version}`));
});
