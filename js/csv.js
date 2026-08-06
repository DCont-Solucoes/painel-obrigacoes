import { CATEGORIES, FREQUENCIES, DAY_TYPES } from './constants.js';

// Colunas esperadas no CSV (nomes em português, minúsculas, sem acento nos
// cabeçalhos técnicos para evitar problemas de codificação em planilhas
// exportadas de configurações regionais diferentes).
export const CSV_COLUMNS = ['nome', 'categoria', 'empresa', 'responsavel', 'frequencia', 'tipo_dia', 'dia', 'mes', 'meses', 'data', 'observacoes'];

export function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    if (!window.Papa) {
      reject(new Error('Biblioteca de leitura de CSV não carregou. Recarregue a página e tente de novo.'));
      return;
    }
    window.Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (results) => resolve(results.data),
      error: (err) => reject(err),
    });
  });
}

function validateRow(raw, idx) {
  const rowNumber = idx + 2; // +1 pelo cabeçalho, +1 para contar a partir de 1
  const errors = [];

  const name = (raw.nome || '').trim();
  if (!name) errors.push('"nome" é obrigatório');

  const category = (raw.categoria || '').trim().toLowerCase();
  if (!CATEGORIES.some((c) => c.key === category)) {
    errors.push(`"categoria" inválida ("${raw.categoria || ''}") — use: ${CATEGORIES.map((c) => c.key).join(', ')}`);
  }

  const frequency = (raw.frequencia || '').trim().toLowerCase();
  if (!FREQUENCIES.includes(frequency)) {
    errors.push(`"frequencia" inválida ("${raw.frequencia || ''}") — use: ${FREQUENCIES.join(', ')}`);
  }

  const dayTypeRaw = (raw.tipo_dia || '').trim().toLowerCase();
  const dayType = dayTypeRaw || 'fixo';
  if (!DAY_TYPES.some((d) => d.key === dayType)) {
    errors.push(`"tipo_dia" inválido ("${raw.tipo_dia}") — use: ${DAY_TYPES.map((d) => d.key).join(', ')} (ou deixe em branco para "fixo")`);
  }

  let day_of_month = null;
  let month = null;
  let months = null;
  let due_date = null;

  if (['mensal', 'trimestral', 'anual'].includes(frequency)) {
    day_of_month = parseInt(raw.dia, 10);
    if (!Number.isInteger(day_of_month) || day_of_month < 1 || day_of_month > 31) {
      errors.push('"dia" inválido (precisa ser um número de 1 a 31)');
      day_of_month = null;
    }
  }
  if (frequency === 'anual') {
    month = parseInt(raw.mes, 10);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      errors.push('"mes" inválido (precisa ser um número de 1 a 12)');
      month = null;
    }
  }
  if (frequency === 'trimestral') {
    months = (raw.meses || '')
      .split(/[;,]/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12);
    if (!months.length) {
      errors.push('"meses" inválido (ex.: 3;6;9;12)');
      months = null;
    }
  }
  if (frequency === 'pontual') {
    due_date = (raw.data || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
      errors.push('"data" inválida (use o formato AAAA-MM-DD)');
      due_date = null;
    }
  }

  const empresaNome = (raw.empresa || '').trim();
  const responsibleText = (raw.responsavel || '').trim();
  const notes = (raw.observacoes || '').trim();

  const valid = errors.length === 0;
  return {
    rowNumber,
    raw,
    valid,
    errors,
    mapped: valid ? {
      name, category, frequency, day_type: dayType, day_of_month, month, months, due_date, notes, empresaNome, responsibleText,
    } : null,
  };
}

export function validateImportRows(rawRows) {
  return rawRows.map((raw, idx) => validateRow(raw, idx));
}

export function buildCsvTemplate() {
  const rows = [
    { nome: 'DCTFWeb', categoria: 'federal', empresa: 'GRA', responsavel: '', frequencia: 'mensal', tipo_dia: 'fixo', dia: 30, mes: '', meses: '', data: '', observacoes: 'Consolida eSocial e EFD-Reinf' },
    { nome: 'ECD', categoria: 'federal', empresa: 'GRA', responsavel: '', frequencia: 'anual', tipo_dia: 'fixo', dia: 30, mes: 6, meses: '', data: '', observacoes: 'Prazo prorrogado pela IN RFB 2.142/2023' },
    { nome: 'ICMS-ST (substituição tributária)', categoria: 'estadual', empresa: 'GRA', responsavel: '', frequencia: 'trimestral', tipo_dia: 'fixo', dia: 20, mes: '', meses: '3;6;9;12', data: '', observacoes: 'Regra geral — confira exceções' },
    { nome: 'EFD Contribuições (10º dia útil)', categoria: 'federal', empresa: 'GRA', responsavel: '', frequencia: 'mensal', tipo_dia: 'util_do_mes', dia: 10, mes: '', meses: '', data: '', observacoes: 'Exemplo de dia útil fiscal: 10º dia útil do mês' },
    { nome: 'Evento pontual de exemplo', categoria: 'municipal', empresa: 'GRA', responsavel: '', frequencia: 'pontual', tipo_dia: 'fixo', dia: '', mes: '', meses: '', data: '2026-12-15', observacoes: 'Data única de exemplo' },
  ];
  return window.Papa.unparse(rows, { columns: CSV_COLUMNS });
}

// ---------- normalização/fuzzy match (responsável e aviso de empresa) ----------

function normalizeName(s) {
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos (marcas de combinação após NFD)
    .toLowerCase()
    .replace(/[.,;:!?'"()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Acha o perfil da equipe cujo nome mais se parece com `text` — usado na
// importação em massa para vincular o responsável mesmo com grafia
// diferente (acentuação, abreviação, erro de digitação). Só aceita o match
// aproximado quando há um candidato claramente melhor que os demais — em
// caso de empate ou distância grande demais, prefere não vincular (fica
// como texto livre) a arriscar vincular à pessoa errada.
export function findClosestProfile(profiles, text) {
  const target = normalizeName(text);
  if (!target || !profiles.length) return null;

  const exact = profiles.find((p) => normalizeName(p.display_name || p.email) === target);
  if (exact) return exact;

  const scored = profiles
    .map((p) => ({ p, dist: levenshtein(target, normalizeName(p.display_name || p.email)) }))
    .sort((a, b) => a.dist - b.dist);

  const [best, runnerUp] = scored;
  const threshold = Math.max(1, Math.round(target.length * 0.25));
  const isAmbiguous = runnerUp && runnerUp.dist === best.dist;
  return (best.dist <= threshold && !isAmbiguous) ? best.p : null;
}

// Só AVISA sobre uma empresa parecida já cadastrada — nunca mescla ou
// escolhe sozinho, porque duas empresas com nomes parecidos podem ser
// entidades legais totalmente diferentes (ao contrário de responsável, em
// que errar o vínculo é bem menos grave). Quem confirma a importação
// decide se é duplicata ou não.
export function findSimilarCompanyWarning(name, existingCompanies) {
  const target = normalizeName(name);
  if (!target || !existingCompanies.length) return null;
  const threshold = Math.max(1, Math.round(target.length * 0.2));
  const match = existingCompanies.find((c) => {
    const norm = normalizeName(c.name);
    return norm !== target && levenshtein(target, norm) <= threshold;
  });
  return match ? match.name : null;
}

export function downloadCsvTemplate() {
  const csv = buildCsvTemplate();
  // BOM no início: sem isso, o Excel em configuração pt-BR costuma exibir
  // acentos errados ao abrir um CSV UTF-8.
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'modelo-obrigacoes.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
