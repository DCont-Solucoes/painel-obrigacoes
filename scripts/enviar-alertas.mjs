// =============================================================================
// Alertas diários por e-mail — obrigações atrasadas ou vencendo em breve.
// =============================================================================
// Roda fora do navegador (Node, via GitHub Actions agendado — veja
// .github/workflows/alertas-diarios.yml). Usa a service_role key do
// Supabase (que NUNCA deve ficar no front-end) para ler os dados sem
// depender de login, e a API da Resend (gratuita até 3.000 e-mails/mês)
// para enviar os e-mails.
//
// Formato do envio: um e-mail por pessoa, uma vez por dia, listando tudo
// que está atrasado ou vence nos próximos 5 dias. É um "lembrete diário"
// simples — a mesma pendência aparece de novo todo dia até ser concluída
// ou até o prazo passar da janela de 5 dias. Não guardamos "já mandei
// aviso disso" em lugar nenhum, de propósito: é mais fácil de entender e
// de depurar do que um sistema de deduplicação, e o "custo" de receber o
// mesmo lembrete de novo enquanto a pendência não é resolvida é baixo.
//
// Variáveis de ambiente necessárias (configuradas como Secrets no GitHub —
// veja o passo a passo no SETUP.md):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (Project Settings → API → service_role — NUNCA no front-end)
//   RESEND_API_KEY
//   ALERT_FROM_EMAIL            (ex.: "Painel de Obrigações <alertas@seudominio.com>")
//   ALERT_DAYS_AHEAD            (opcional, padrão "5" — avisa a partir de quantos dias antes)
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import { getActiveOccurrence, statusOf, fmtBR } from '../js/dateUtils.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.ALERT_FROM_EMAIL;
const DAYS_AHEAD = parseInt(process.env.ALERT_DAYS_AHEAD || '5', 10);

function requireEnv() {
  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!RESEND_API_KEY) missing.push('RESEND_API_KEY');
  if (!FROM_EMAIL) missing.push('ALERT_FROM_EMAIL');
  if (missing.length) {
    throw new Error(`Variáveis de ambiente faltando: ${missing.join(', ')}. Configure os Secrets no GitHub (veja SETUP.md).`);
  }
}

async function sendEmail({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend respondeu ${res.status}: ${body}`);
  }
}

function itemsHtml(items) {
  return items
    .sort((a, b) => a.occurrence - b.occurrence)
    .map((it) => {
      const st = it.status;
      const color = st.tone === 'red' ? '#A63D40' : '#A9791F';
      const label = st.tone === 'red' ? 'Atrasada' : 'Vence em breve';
      return `<li style="margin-bottom:6px;"><strong style="color:${color};">[${label}]</strong> ${it.ob.name} — vencimento ${fmtBR(it.occurrence)}</li>`;
    })
    .join('');
}

// Comprovantes que a conferência automática por OCR (ver js/ocr.js) marcou
// como de competência divergente da ocorrência concluída. É heurístico —
// a pessoa já confirmou "está correto mesmo assim" na hora — mas o gestor
// também precisa saber, sem depender só de abrir a Visão Executiva.
function mismatchesHtml(items, obligationById) {
  return items.map((c) => {
    const ob = obligationById.get(c.obligation_id);
    return `<li style="margin-bottom:6px;"><strong style="color:#A9791F;">[Divergência de competência]</strong> ${ob?.name || 'Obrigação removida'} — comprovante da competência ${c.ocr_extracted_period || '—'} (ocorrência ${c.occurrence_date}), concluído por ${c.done_by_name}</li>`;
  }).join('');
}

async function main() {
  requireEnv();
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const [{ data: obligations, error: e1 }, { data: completions, error: e2 }, { data: holidays, error: e3 }, { data: profiles, error: e4 }] = await Promise.all([
    supabase.from('obligations').select('*'),
    supabase.from('completions').select('*'),
    supabase.from('holidays').select('*'),
    supabase.from('profiles').select('*'),
  ]);
  if (e1 || e2 || e3 || e4) throw (e1 || e2 || e3 || e4);

  const holidaysSet = new Set(holidays.map((h) => h.holiday_date));
  const completionsByObligation = new Map();
  completions.forEach((c) => {
    if (!completionsByObligation.has(c.obligation_id)) completionsByObligation.set(c.obligation_id, new Set());
    completionsByObligation.get(c.obligation_id).add(c.occurrence_date);
  });

  // Para cada obrigação, calcula a ocorrência ativa e decide se entra no
  // alerta (atrasada ou vencendo dentro de ALERT_DAYS_AHEAD dias).
  const pendingByResponsible = new Map(); // responsible_id -> [{ob, occurrence, status}]
  for (const ob of obligations) {
    const occurrence = getActiveOccurrence(ob, completionsByObligation, holidaysSet);
    if (!occurrence) continue;
    const status = statusOf(occurrence);
    const shouldAlert = status.diffDays !== null && status.diffDays <= DAYS_AHEAD;
    if (!shouldAlert) continue;
    if (!ob.responsible_id) continue; // sem conta vinculada, não tem para quem mandar
    if (!pendingByResponsible.has(ob.responsible_id)) pendingByResponsible.set(ob.responsible_id, []);
    pendingByResponsible.get(ob.responsible_id).push({ ob, occurrence, status });
  }

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const obligationById = new Map(obligations.map((o) => [o.id, o]));
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recentMismatches = completions.filter((c) => c.ocr_status === 'mismatch' && c.done_at >= oneDayAgo);
  let sentCount = 0;

  for (const [responsibleId, items] of pendingByResponsible.entries()) {
    const person = profileById.get(responsibleId);
    if (!person?.email) continue;
    await sendEmail({
      to: person.email,
      subject: `Painel de Obrigações — ${items.length} pendência(s) para você`,
      html: `<p>Olá, ${person.display_name || ''}.</p>`
        + `<p>Você tem ${items.length} obrigação(ões) atrasada(s) ou vencendo em breve:</p>`
        + `<ul>${itemsHtml(items)}</ul>`
        + '<p style="color:#5B6B70;font-size:12px;">Este é um lembrete automático diário do Painel de Obrigações Acessórias.</p>',
    });
    sentCount++;
  }

  // E-mail de visão geral para administradores, com tudo (não só o que é
  // deles) e também os comprovantes com competência divergente das
  // últimas 24h — mesmo quando não há nenhuma pendência de prazo, para o
  // gestor não depender só de abrir a Visão Executiva para saber disso.
  const allPending = Array.from(pendingByResponsible.values()).flat();
  const admins = profiles.filter((p) => p.role === 'admin' && p.email);
  if ((allPending.length || recentMismatches.length) && admins.length) {
    const pendingBlock = allPending.length
      ? `<p>Resumo geral de todas as obrigações atrasadas ou vencendo em breve na equipe:</p><ul>${itemsHtml(allPending)}</ul>`
      : '<p>Nenhuma obrigação atrasada ou vencendo em breve na equipe hoje.</p>';
    const mismatchBlock = recentMismatches.length
      ? `<p style="margin-top:16px;">Comprovantes com possível divergência de competência (conferência automática por OCR) nas últimas 24h — a pessoa já confirmou "está correto mesmo assim" na hora, mas vale uma conferência:</p><ul>${mismatchesHtml(recentMismatches, obligationById)}</ul>`
      : '';
    for (const admin of admins) {
      await sendEmail({
        to: admin.email,
        subject: `Painel de Obrigações — resumo geral (${allPending.length} pendência(s), ${recentMismatches.length} divergência(s))`,
        html: pendingBlock
          + mismatchBlock
          + '<p style="color:#5B6B70;font-size:12px;">Este é um lembrete automático diário do Painel de Obrigações Acessórias.</p>',
      });
      sentCount++;
    }
  }

  console.log(`Concluído. ${sentCount} e-mail(is) enviado(s).`);
}

main().catch((err) => {
  console.error('Falha ao enviar alertas:', err);
  process.exit(1);
});
