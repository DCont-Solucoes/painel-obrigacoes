import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('selected obligations are migrated to optional receipts with database enforcement', async () => {
  const sql = await readFile(new URL('../sql/migrations/20260817_make_receipts_optional_for_selected_obligations.sql', import.meta.url), 'utf8');

  assert.match(sql, /add column if not exists requires_attachment boolean not null default true/);
  assert.match(sql, /set requires_attachment = false/);
  assert.match(sql, /Conciliacao bancaria/);
  assert.match(sql, /Destaque de IBS\/CBS - Simples Nacional/);
  assert.match(sql, /create trigger trg_enforce_completion_attachment/);
  assert.match(sql, /if new\.attachment_path is null[\s\S]*?o\.requires_attachment/);
});

test('completion flow only uploads and requires a file when configured', async () => {
  const data = await readFile(new URL('../js/data.js', import.meta.url), 'utf8');
  const dialog = await readFile(new URL('../js/ui/completeDialog.js', import.meta.url), 'utf8');

  assert.match(data, /requiresAttachment: ob\.requires_attachment !== false/);
  assert.match(data, /if \(result\.file\) \{[\s\S]*?uploadAttachment/);
  assert.match(dialog, /hasFile \|\| !requiresAttachment/);
  assert.match(dialog, /requiresAttachment && !file/);
  assert.match(dialog, /Comprovante \(\$\{requiresAttachment \? 'obrigatório' : 'opcional'\}\)/);
  assert.match(dialog, /ocrConfirmCheckbox\.addEventListener\('change', updateEnabled\);\s*\/\/[\s\S]*?updateEnabled\(\);\s*fileInput\.addEventListener/);
});
