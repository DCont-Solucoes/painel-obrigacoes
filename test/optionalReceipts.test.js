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

  assert.match(data, /requiresAttachment: requiresCompletionAttachment\(ob\)/);
  assert.match(data, /if \(result\.file\) \{[\s\S]*?uploadAttachment/);
  assert.match(dialog, /hasFile \|\| !requiresAttachment/);
  assert.match(dialog, /requiresAttachment \u0026\u0026 !file/);
  assert.match(dialog, /Comprovante \(\$\{requiresAttachment \? 'obrigatório' : 'opcional'\}\)/);
});

test('chart-of-accounts repair tolerates imported whitespace and category variations', async () => {
  const sql = await readFile(new URL('../sql/migrations/20260817_repair_chart_of_accounts_optional_receipt.sql', import.meta.url), 'utf8');

  assert.match(sql, /set requires_attachment = false/);
  assert.match(sql, /regexp_replace/);
  assert.match(sql, /like 'parametrizacao do novo plano de contas nas regras de contabilizacao%'/);
  assert.doesNotMatch(sql, /category\s*=/);
  assert.match(sql, /notify pgrst, 'reload schema'/);
  assert.match(sql, /create or replace function public\.enforce_completion_attachment/);
});

test('chart-of-accounts obligation is optional in the UI even with a stale database flag', async () => {
  const { requiresCompletionAttachment } = await import('../js/attachmentRequirements.js');

  assert.equal(requiresCompletionAttachment({
    name: 'Parametrização do novo plano de contas nas regras de contabilização',
    requires_attachment: true,
  }), false);
  assert.equal(requiresCompletionAttachment({
    name: 'Outra obrigação',
    requires_attachment: true,
  }), true);
});
