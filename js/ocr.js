// Leitura de comprovantes por OCR direto no navegador (Tesseract.js) e por
// extração de texto de PDF (pdf.js) — ambos via CDN em index.html, sem
// serviço externo pago nem backend próprio — para conferir se o arquivo
// anexado parece ser da competência (mês/ano) da ocorrência sendo
// concluída.
//
// É uma checagem HEURÍSTICA e best-effort: leitura de texto de documento
// escaneado nunca é 100% confiável, e cada órgão emite guia num layout
// diferente. Por isso ela nunca bloqueia sozinha a conclusão — só avisa e
// pede confirmação extra da pessoa (ver ui/completeDialog.js).
//
// PDF é tratado em duas etapas: primeiro tenta ler o texto já embutido no
// arquivo (rápido e exato, funciona para guias geradas digitalmente, que
// são a maioria); se o PDF não tiver texto (documento escaneado/foto
// salva como PDF), a primeira página é renderizada num canvas e passa
// pelo mesmo OCR usado em imagens.

if (typeof window !== 'undefined' && window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

// Abaixo desse número de caracteres não-espaço, tratamos o texto extraído
// do PDF como "não tem camada de texto real" (ruído/lixo de metadados) e
// caímos para o caminho de renderizar + OCR.
const PDF_MIN_TEXT_LENGTH = 25;

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

// Lê o texto já embutido no PDF (sem OCR) — funciona para guias geradas
// digitalmente. Só olha as duas primeiras páginas: comprovante fiscal
// raramente passa disso, e evita processar arquivos grandes à toa.
async function extractPdfText(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const pagesToRead = Math.min(pdf.numPages, 2);
  let text = '';
  for (let i = 1; i <= pagesToRead; i++) {
    // eslint-disable-next-line no-await-in-loop
    const page = await pdf.getPage(i);
    // eslint-disable-next-line no-await-in-loop
    const content = await page.getTextContent();
    text += `${content.items.map((it) => it.str).join(' ')}\n`;
  }
  return { pdf, text };
}

async function renderPdfPageToCanvas(pdf, pageNumber = 1, scale = 2) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas;
}

// Extrai o texto do arquivo (imagem via OCR, PDF via texto embutido com
// fallback para renderizar + OCR). Lança erro para o chamador tratar como
// "não verificado" — mantém analyzeAttachment com um único try/catch.
async function extractText(file) {
  if (file.type === 'application/pdf') {
    if (!window.pdfjsLib) throw new Error('pdf.js não carregou');
    const { pdf, text: pdfText } = await extractPdfText(file);
    if (pdfText.replace(/\s+/g, '').length >= PDF_MIN_TEXT_LENGTH) {
      return pdfText; // PDF nativo, já tem camada de texto — não precisa de OCR
    }
    if (!window.Tesseract) throw new Error('Tesseract não carregou (PDF parece ser escaneado)');
    const canvas = await renderPdfPageToCanvas(pdf, 1);
    const { data } = await window.Tesseract.recognize(canvas, 'por');
    return data.text || '';
  }

  if (!window.Tesseract) throw new Error('Tesseract não carregou');
  const { data } = await window.Tesseract.recognize(file, 'por');
  return data.text || '';
}

// occurrenceDate: "YYYY-MM-DD" da ocorrência sendo concluída.
// Retorna { status: 'ok' | 'mismatch' | 'not_checked', extractedPeriod: string|null, message: string }.
export async function analyzeAttachment(file, occurrenceDate) {
  const [occYear, occMonth] = occurrenceDate.split('-').map(Number);
  const occPeriodLabel = fmtPeriod({ month: occMonth, year: occYear });

  const isImage = file?.type?.startsWith('image/');
  const isPdf = file?.type === 'application/pdf';
  if (!isImage && !isPdf) {
    return {
      status: 'not_checked',
      extractedPeriod: null,
      message: 'Conferência automática de competência só funciona em imagens (foto/print) ou PDF. Revise manualmente se necessário.',
    };
  }

  try {
    const text = await extractText(file);
    const best = pickBestCandidate(findPeriodCandidates(text));

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
    console.error('Falha ao analisar o comprovante', err);
    return {
      status: 'not_checked',
      extractedPeriod: null,
      message: 'Não foi possível analisar o comprovante automaticamente agora. Revise manualmente se necessário.',
    };
  }
}
