// Defesa para bases que ainda conservam `requires_attachment=true` por terem
// importado o título com outra categoria ou formatação. A regra pelo título é
// intencional: todas as cópias desta rotina foram dispensadas pelo cliente.
const OPTIONAL_ATTACHMENT_TITLES = new Set([
  'parametrizacao do novo plano de contas nas regras de contabilizacao',
]);

function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function requiresCompletionAttachment(obligation) {
  if (obligation?.requires_attachment === false) return false;
  return !OPTIONAL_ATTACHMENT_TITLES.has(normalizeTitle(obligation?.name));
}
