export const CATEGORIES = [
  { key: 'federal', label: 'Federal', color: 'var(--cat-federal)' },
  { key: 'estadual', label: 'Estadual', color: 'var(--cat-estadual)' },
  { key: 'municipal', label: 'Municipal', color: 'var(--cat-municipal)' },
  { key: 'trabalhista', label: 'Trabalhista/Previdenciária', color: 'var(--cat-trab)' },
  { key: 'societaria', label: 'Societária', color: 'var(--cat-soc)' },
];

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
