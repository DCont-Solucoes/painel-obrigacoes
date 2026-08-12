import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('CSP permits the resources required by fonts and OCR without unsafe-eval', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const csp = config.headers[0].headers.find((header) => (
    header.key === 'Content-Security-Policy'
  )).value;

  assert.match(csp, /script-src[^;]*'wasm-unsafe-eval'/);
  assert.doesNotMatch(csp, /(?:^|\s)'unsafe-eval'(?:\s|;|$)/);
  assert.match(csp, /style-src[^;]*https:\/\/fonts\.googleapis\.com/);
  assert.match(csp, /font-src[^;]*https:\/\/fonts\.gstatic\.com/);
});

test('login form labels are explicitly associated with their fields', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  for (const id of ['loginEmail', 'loginPassword', 'newPasswordInput']) {
    assert.match(html, new RegExp(`<label\\s+for=["']${id}["']>`));
    assert.match(html, new RegExp(`<input\\s+id=["']${id}["']`));
  }
});

test('deployment remains connected to the existing Supabase project', async () => {
  const config = await readFile(new URL('../js/config.js', import.meta.url), 'utf8');

  assert.match(config, /SUPABASE_URL = 'https:\/\/fsyginnpvonruifetjjs\.supabase\.co'/);
  assert.doesNotMatch(config, /SEU_PROJETO|sb_publishable_\.\.\./);
});
