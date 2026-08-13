import assert from 'node:assert/strict';
import test from 'node:test';
import { localChecklistSuggestions, suggestChecklist } from '../js/checklistSuggestions.js';

const obligation = { id: 'target', name: 'DCTFWeb mensal', category: 'federal', frequency: 'mensal' };
const obligations = [obligation, { id: 'similar', name: 'DCTFWeb matriz', category: 'federal' }, { id: 'other', name: 'ISS municipal', category: 'municipal' }];
const items = [{ obligation_id: 'similar', description: 'Conferir fechamento da folha' }, { obligation_id: 'other', description: 'Conferir notas de serviço' }];

test('recommender ranks checklist knowledge from similar obligations first', () => {
  const result = localChecklistSuggestions(obligation, obligations, items);
  assert.equal(result[0].description, 'Conferir fechamento da folha');
  assert.equal(result[0].origin, 'Histórico da equipe');
  assert.ok(result.some((item) => item.description.includes('prazo oficial')));
});

test('recommender falls back locally when the AI endpoint is unavailable', async () => {
  const result = await suggestChecklist(obligation, obligations, items, { fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(result.mode, 'Modelo local');
  assert.ok(result.suggestions.length >= 5);
});

test('recommender accepts structured suggestions from the server', async () => {
  const fetchImpl = async (_url, options) => {
    assert.equal(JSON.parse(options.body).obligation.name, obligation.name);
    return { ok: true, json: async () => ({ suggestions: [{ description: 'Validar recibo', origin: 'IA' }], mode: 'LLM', sources: [] }) };
  };
  const result = await suggestChecklist(obligation, obligations, items, { fetchImpl });
  assert.equal(result.mode, 'LLM');
  assert.equal(result.suggestions[0].description, 'Validar recibo');
});
