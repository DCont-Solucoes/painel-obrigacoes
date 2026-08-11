export const CATEGORIES = [
  { key: 'federal', label: 'Federal', color: 'var(--cat-federal)' },
  { key: 'estadual', label: 'Estadual', color: 'var(--cat-estadual)' },
  { key: 'municipal', label: 'Municipal', color: 'var(--cat-municipal)' },
  { key: 'trabalhista', label: 'Trabalhista/Previdenciária', color: 'var(--cat-trab)' },
  { key: 'societaria', label: 'Societária', color: 'var(--cat-soc)' },
];

// Preenchido no boot a partir da tabela `categories`. O array é alterado
// no lugar (e não substituído) para que todos os módulos que já importaram
// CATEGORIES enxerguem a lista nova sem precisar reimportar.
export const CATEGORY_META = new Map();

export function applyCategories(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;   // mantém a reserva
  CATEGORIES.length = 0;
  CATEGORY_META.clear();
  for (const c of rows) {
    CATEGORIES.push(c.name);
    CATEGORY_META.set(c.name, c);
  }
}

/** Cor da categoria, para os selos dos cartões. */
export function categoryColor(name) {
  return CATEGORY_META.get(name)?.cor || '#64748b';
}

export const FREQ_LABELS = {
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  anual: 'Anual',
  pontual: 'Pontual',
};

export const FREQUENCIES = ['mensal', 'trimestral', 'anual', 'pontual'];

export const DAY_TYPES = [
  { key: 'fixo', label: 'Dia fixo do mês' },
  { key: 'util_do_mes', label: 'Nº-ésimo dia útil do mês' },
];

export const BUSINESS_DAY_SHIFTS = [
  { key: 'nenhum', label: 'Não ajustar (mantém a data mesmo em dia não útil)' },
  { key: 'proximo_util', label: 'Empurrar para o próximo dia útil' },
  { key: 'anterior_util', label: 'Antecipar para o dia útil anterior' },
];

export const PRIORITIES = [
  { key: 'baixa', label: 'Baixa' },
  { key: 'media', label: 'Média' },
  { key: 'alta', label: 'Alta' },
  { key: 'critica', label: 'Crítica' },
];

export function priorityInfo(key) {
  return PRIORITIES.find((p) => p.key === key) || PRIORITIES[1];
}

export const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export const MONTH_FULL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function catInfo(key) {
  return CATEGORIES.find((c) => c.key === key) || CATEGORIES[0];
}
