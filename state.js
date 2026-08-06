// Estado em memória da aplicação. Não usamos localStorage/sessionStorage —
// a fonte de verdade é sempre o Supabase; este objeto só guarda o que já
// foi carregado nesta sessão do navegador, para renderizar rápido.
export const STATE = {
  view: 'board', // 'board' | 'mine' | 'manage'
  manageSection: 'obligations', // 'obligations' | 'companies' | 'team' | 'import' (dentro da aba Gerenciar)
  filters: { empresa: 'all', category: 'all', responsible: 'all' },
  editingId: null,
  editingCompanyId: null,

  session: null, // { id, email }
  profile: null, // { id, email, display_name, role }

  obligations: [],
  companies: [],
  completions: [], // linhas cruas da tabela completions
  profiles: [], // equipe (todas as contas), visível a partir da aba Gerenciar → Equipe

  auditLog: null, // carregado sob demanda ao abrir Gerenciar → Histórico
  holidays: [], // feriados cadastrados, usados no ajuste "próximo dia útil"

  importPreview: null, // { fileName, rows: [...] } — resultado da validação do CSV, antes de confirmar

  loading: false,
  connectionError: null,
};

export function isAdmin() {
  return STATE.profile?.role === 'admin';
}

// Mapa obligation_id -> Set(occurrence_date "YYYY-MM-DD") para consultas
// rápidas de "essa ocorrência já foi concluída?".
export function completionsIndex() {
  const map = new Map();
  for (const c of STATE.completions) {
    if (!map.has(c.obligation_id)) map.set(c.obligation_id, new Set());
    map.get(c.obligation_id).add(c.occurrence_date);
  }
  return map;
}

export function companyName(companyId) {
  return STATE.companies.find((c) => c.id === companyId)?.name || '';
}

export function holidaysDateSet() {
  return new Set(STATE.holidays.map((h) => h.holiday_date));
}

export function lastCompletion(obligationId) {
  const mine = STATE.completions
    .filter((c) => c.obligation_id === obligationId)
    .sort((a, b) => b.occurrence_date.localeCompare(a.occurrence_date) || b.done_at.localeCompare(a.done_at));
  return mine[0] || null;
}
