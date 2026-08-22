import assert from 'node:assert/strict';
import test from 'node:test';
import { createChecklistSuggestions } from '../api/checklist-suggestions.js';

const env = { SUPABASE_URL: 'https://tenant.supabase.co', SUPABASE_ANON_KEY: 'public-anon-key' };

function request({ token, body = { obligation: { name: 'Obrigacao interna', category: 'outros' } }, contentLength } = {}) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (contentLength) headers.set('content-length', String(contentLength));
  return { method: 'POST', headers, json: async () => body };
}

test('API de sugestoes rejeita chamadas sem sessao antes de consumir servicos externos', async () => {
  let fetchCalls = 0;
  const handler = createChecklistSuggestions({ fetchImpl: async () => { fetchCalls += 1; }, env });
  const response = await handler(request());
  assert.equal(response.status, 401);
  assert.equal(fetchCalls, 0);
});

test('API valida o bearer token no Supabase e retorna fallback sem expor a chave da IA', async () => {
  const calls = [];
  const handler = createChecklistSuggestions({
    env,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ id: 'user-1' }) };
    },
  });
  const response = await handler(request({ token: 'valid-token' }));
  assert.equal(response.status, 200);
  assert.equal(response.jsonBody.suggestions.length, 6);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${env.SUPABASE_URL}/auth/v1/user`);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer valid-token');
});

test('API rejeita payload declarado acima do limite antes de ler o JSON', async () => {
  const handler = createChecklistSuggestions({
    env,
    fetchImpl: async () => ({ ok: true, json: async () => ({ id: 'user-1' }) }),
  });
  const response = await handler(request({ token: 'valid-token', contentLength: 16 * 1024 + 1 }));
  assert.equal(response.status, 413);
});
