// Leitura de comprovantes por OCR direto no navegador (Tesseract.js, via
// CDN em index.html — sem serviço externo pago nem backend próprio), para
// conferir se o arquivo anexado parece ser da competência (mês/ano) da
// ocorrência sendo concluída.
//
// É uma checagem HEURÍSTICA e best-effort: leitura de texto de documento
// escaneado nunca é 100% confiável, e cada órgão emite guia num layout
// diferente. Por isso ela nunca bloqueia sozinha a conclusão — só avisa e
// pede confirmação extra da pessoa (ver ui/completeDialog.js). Também só
// funciona em imagens (foto/print); PDFs não são renderizados nesta
// versão, por isso não são analisados.

const MONTH_NAMES_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

// Candidatos "perto de uma palavra-chave de competência" (prioridade 2) e
// candidatos genéricos "mês/ano em qualquer lugar do texto" (prioridade 1)
// — priorizamos os primeiros porque são bem mais confiáveis num documento
// fiscal real, que costuma ter várias outras datas (emissão, vencimento).
function findPeriodCandidates(text) {
  const candidates = [];
  const normalized = text.toLowerCase();

  const keywordWindow = /(compet[eê]ncia|per[ií]odo de apura[cç][aã]o|m[eê]s de refer[eê]ncia)[^0-9]{0,25}(\d{1,2})[/-](\d{4})/g;
  for (const m of normalized.matchAll(keywordWindow)) {
    candidates.push({ month: parseInt(m[2], 10), year: parseInt(m[3], 10), priority: 2 });
  }

  const monthYearNumeric = /\b(0?[1-9]|1[0-2])[/-](\d{4})\b/g;
  for (const m of normalized.matchAll(monthYearNumeric)) {
    candidates.push({ month: parseInt(m[1], 10), year: parseInt(m[2], 10), priority: 1 });
  }

  const monthNamePattern = new RegExp(`\\b(${MONTH_NAMES_PT.join('|')})[a-z]*\\s+de\\s+(\\d{4})\\b`, 'g');
  for (const m of normalized.matchAll(monthNamePattern)) {
    candidates.push({ month: MONTH_NAMES_PT.indexOf(m[1]) + 1, year: parseInt(m[2], 10), priority: 2 });
  }

  return candidates.filter((c) => c.month >= 1 && c.month <= 12 && c.year >= 2000 && c.year <= 2100);
}

// Entre os candidatos achados, prioriza os de palavra-chave; em empate,
// o mês/ano que mais se repetiu no texto.
function pickBestCandidate(candidates) {
  if (!candidates.length) return null;
  const maxPriority = Math.max(...candidates.map((c) => c.priority));
  const top = candidates.filter((c) => c.priority === maxPriority);
  const counts = new Map();
  top.forEach((c) => {
    const key = `${c.month}/${c.year}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const [bestKey] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
  const [month, year] = bestKey.split('/').map(Number);
  return { month, year };
}

function fmtPeriod({ month, year }) {
  return `${String(month).padStart(2, '0')}/${year}`;
}

// Aceita também o mês anterior ao da ocorrência: é comum uma obrigação com
// vencimento num mês apurar a competência do mês passado (ex.: DCTFWeb de
// fevereiro referente a janeiro) — sem essa folga, o aviso dispararia como
// falso positivo na maioria das obrigações mensais reais.
function periodsMatch(occMonth, occYear, extracted) {
  const prevMonth = occMonth === 1 ? 12 : occMonth - 1;
  const prevYear = occMonth === 1 ? occYear - 1 : occYear;
  return (extracted.month === occMonth && extracted.year === occYear)
    || (extracted.month === prevMonth && extracted.year === prevYear);
}

// occurrenceDate: "YYYY-MM-DD" da ocorrência sendo concluída.
// Retorna { status: 'ok' | 'mismatch' | 'not_checked', extractedPeriod: string|null, message: string }.
export async function analyzeAttachment(file, occurrenceDate) {
  const [occYear, occMonth] = occurrenceDate.split('-').map(Number);
  const occPeriodLabel = fmtPeriod({ month: occMonth, year: occYear });

  if (!file?.type?.startsWith('image/')) {
    return {
      status: 'not_checked',
      extractedPeriod: null,
      message: 'Conferência automática de competência só funciona em imagens (foto/print) — PDFs não são analisados nesta versão. Revise manualmente se necessário.',
    };
  }

  if (!window.Tesseract) {
    return {
      status: 'not_checked',
      extractedPeriod: null,
      message: 'Não foi possível carregar o leitor de comprovantes agora. Revise manualmente se necessário.',
    };
  }

  try {
    const { data } = await window.Tesseract.recognize(file, 'por');
    const best = pickBestCandidate(findPeriodCandidates(data.text || ''));

    if (!best) {
      return {
        status: 'not_checked',
        extractedPeriod: null,
        message: 'Não foi possível identificar a competência no comprovante automaticamente. Revise manualmente se necessário.',
      };
    }

    const extractedPeriod = fmtPeriod(best);
    if (periodsMatch(occMonth, occYear, best)) {
      return { status: 'ok', extractedPeriod, message: `Competência do comprovante (${extractedPeriod}) confere com esta ocorrência.` };
    }
    return {
      status: 'mismatch',
      extractedPeriod,
      message: `O comprovante parece ser da competência ${extractedPeriod}, mas esta ocorrência é de ${occPeriodLabel}. Confira se anexou o arquivo certo antes de concluir.`,
    };
  } catch (err) {
    console.error('Falha ao rodar OCR no comprovante', err);
    return {
      status: 'not_checked',
      extractedPeriod: null,
      message: 'Não foi possível analisar o comprovante automaticamente agora. Revise manualmente se necessário.',
    };
  }
}
