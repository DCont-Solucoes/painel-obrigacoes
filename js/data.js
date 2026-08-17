import {
  STATE, isAdmin, isSuperUser, holidaysDateSet, completionsIndex, overrideForOccurrence, rulesForRegime, taxRegimeName,
} from './state.js';
import { fetchObligations, createObligation, updateObligation, deleteObligation as apiDeleteObligation, createObligationsBulk } from './api/obligations.js?v=20260813-create-rls-fix-v7';
import { fetchCompletions, markCompletion, deleteCompletion } from './api/completions.js';
import {
  fetchCompanies, ensureCompany, createCompany, updateCompany, updateCompanyRegime, deleteCompany as apiDeleteCompany,
} from './api/companies.js';
import { fetchProfiles, updateProfile } from './api/profiles.js';
import { fetchComments, createComment, deleteComment as apiDeleteComment } from './api/comments.js';
import { fetchAuditLog } from './api/auditLog.js';
import {
  fetchChecklistItems, fetchAllChecklistItems, createChecklistItem, createChecklistItemsBulk, deleteChecklistItem as apiDeleteChecklistItem,
  toggleChecklistItem, resetChecklistItems,
} from './api/checklist.js?v=20260814-sankhya-checklists-v1';
import { fetchHolidays, createHoliday, deleteHoliday as apiDeleteHoliday, fetchNationalHolidays } from './api/holidays.js';
import {
  fetchObligationRules, createObligationRule, updateObligationRule, deleteObligationRule as apiDeleteObligationRule,
} from './api/obligationRules.js';
import {
  fetchOccurrenceOverrides, setOccurrenceOverride, deleteOccurrenceOverride as apiDeleteOccurrenceOverride,
} from './api/occurrenceOverrides.js';
import {
  fetchTaxRegimes, createTaxRegime, updateTaxRegime, deleteTaxRegime as apiDeleteTaxRegime,
  fetchTaxRegimeRules, linkRuleToRegime, unlinkRuleFromRegime,
} from './api/taxRegimes.js';
import { createUserAccount } from './api/adminUsers.js';
import { signOut, sendPasswordResetEmail } from './api/auth.js';
import { uploadAttachment } from './api/storage.js';
import { completeDialog } from './ui/completeDialog.js?v=20260817-optional-receipts-v1';
import { overrideDialog } from './ui/overrideDialog.js';
import { applyRuleDialog } from './ui/applyRuleDialog.js';
import { regimeDialog } from './ui/regimeDialog.js';
import { regimeRulesDialog } from './ui/regimeRulesDialog.js';
import { regimeCompaniesDialog } from './ui/regimeCompaniesDialog.js';
import { getActiveOccurrence, fmtKey } from './dateUtils.js';
import { showToast } from './ui/toast.js';
import { confirmDialog } from './ui/confirmDialog.js';
import { findClosestProfile } from './csv.js';
import { fetchCategories } from './api/categories.js';
import { countPendingValidations, countRejected } from './api/validation.js';
import { applyCategories } from './constants.js';
import { fetchWorkspaces, createWorkspace, updateWorkspace } from './api/workspaces.js';
import { getSankhyaChecklistTemplate } from './obligationChecklistTemplates.js?v=20260814-sankhya-checklists-v1';
import { requiresCompletionAttachment } from './attachmentRequirements.js?v=20260817-optional-receipts-v1';

// Carrega as dez tabelas em paralelo. Cada uma é independente — se uma
// falhar (ex.: sem conexão), as outras ainda tentam, e sinalizamos o erro
// via STATE.connectionError para a interface mostrar o banner de aviso.
export async function loadAll() {
  STATE.connectionError = null;
  try {
    const [
      obligations, completions, companies, profiles, holidays, obligationRules, occurrenceOverrides,
      taxRegimes, taxRegimeRules, checklistItems, categories, pendingValidation, rejectedValidation,
    ] = await Promise.all([
      fetchObligations(),
      fetchCompletions(),
      fetchCompanies(),
      fetchProfiles(),
      fetchHolidays(),
      fetchObligationRules(),
      fetchOccurrenceOverrides(),
      fetchTaxRegimes(),
      fetchTaxRegimeRules(),
      fetchAllChecklistItems(),
      fetchCategories(),
      countPendingValidations(),
      countRejected(),
    ]);
    STATE.obligations = obligations;
    STATE.completions = completions;
    STATE.companies = companies;
    STATE.profiles = profiles;
    STATE.holidays = holidays;
    STATE.obligationRules = obligationRules;
    STATE.occurrenceOverrides = occurrenceOverrides;
    STATE.taxRegimes = taxRegimes;
    STATE.taxRegimeRules = taxRegimeRules;
    STATE.checklistItems = checklistItems;
    applyCategories(categories);
    STATE.validation = { pending: pendingValidation, rejected: rejectedValidation };
    STATE.workspaces = isSuperUser() ? await fetchWorkspaces() : [];
  } catch (err) {
    console.error('Falha ao carregar dados do painel', err);
    STATE.connectionError = 'Não foi possível carregar os dados agora. Verifique sua conexão com a internet.';
    throw err;
  }
}

export async function doCreateWorkspace({ name, document, accessStatus }, onDone) {
  if (!isSuperUser()) return;
  if (!name.trim()) { showToast('Informe a razão social da empresa.', 'error'); return; }
  if ((document || '').replace(/\D/g, '').length !== 14) { showToast('Informe um CNPJ com 14 dígitos.', 'error'); return; }
  try {
    const trialEndsAt = accessStatus === 'trial'
      ? new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10) : null;
    const created = await createWorkspace({ name: name.trim(), document: document.trim() || null, access_status: accessStatus, trial_ends_at: trialEndsAt });
    STATE.workspaces.push(created);
    showToast('Espaço da empresa criado com sucesso.', 'success');
  } catch (err) { console.error(err); showToast('Não foi possível criar o espaço.', 'error'); }
  onDone?.();
}

export async function doUpdateWorkspaceAccess(id, accessStatus, onDone) {
  if (!isSuperUser()) return;
  try {
    const trialEndsAt = accessStatus === 'trial' ? new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10) : null;
    const updated = await updateWorkspace(id, { access_status: accessStatus, trial_ends_at: trialEndsAt });
    STATE.workspaces = STATE.workspaces.map((w) => (w.id === id ? updated : w));
    showToast('Acesso da empresa atualizado.', 'success');
  } catch (err) { console.error(err); showToast('Não foi possível atualizar o acesso.', 'error'); }
  onDone?.();
}

export async function refreshObligationsAndCompletions() {
  const [obligations, completions] = await Promise.all([fetchObligations(), fetchCompletions()]);
  STATE.obligations = obligations;
  STATE.completions = completions;
}

// ---------- ações ----------

export async function doMarkDone(obligationId, onDone) {
  const ob = STATE.obligations.find((o) => o.id === obligationId);
  if (!ob) return;
  // Administradores podem concluir o próprio envio diretamente. A mesma
  // exceção é aplicada pelo trigger no banco, que é a fonte de verdade.
  if (ob.requires_validation && !ob.validator_id && !isAdmin()) {
    showToast('A Gestão precisa definir quem validará esta tarefa antes do envio.', 'error');
    return;
  }
  if (ob.requires_validation && ob.validator_id === STATE.session?.id && !isAdmin()) {
    showToast('Quem executa a tarefa não pode validar o próprio trabalho.', 'error');
    return;
  }
  const completionsByObligation = new Map(
    STATE.completions
      .filter((c) => c.obligation_id === obligationId)
      .reduce((acc, c) => {
        if (!acc.has(c.obligation_id)) acc.set(c.obligation_id, new Set());
        acc.get(c.obligation_id).add(c.occurrence_date);
        return acc;
      }, new Map())
  );
  const active = getActiveOccurrence(ob, completionsByObligation, holidaysDateSet());
  if (!active) return;

  // Checklist (se houver) e, quando configurado, comprovante são exigidos
  // ANTES da conclusão ser gravada — ao cancelar, nada é salvo.
  let checklistItems = [];
  try {
    checklistItems = await fetchChecklistItems(obligationId);
  } catch (err) {
    console.error('Falha ao carregar checklist, seguindo sem ele', err);
  }

  const occurrenceDate = fmtKey(active);
  // Cada item já mostra o estado marcado/desmarcado persistido (quem foi
  // riscando o checklist ao longo do período, direto no cartão do Painel,
  // já chega aqui com tudo pronto). Marcar/desmarcar dentro do próprio
  // diálogo também é permitido e persiste na hora — os dois jeitos de
  // trabalhar (aos poucos, ou tudo de uma vez ao concluir) continuam
  // válidos e ficam em sincronia.
  const result = await completeDialog(ob.name, checklistItems, occurrenceDate, {
    requiresAttachment: requiresCompletionAttachment(ob),
    onToggleItem: (itemId, checkedVal) => {
      toggleChecklistItem(itemId, checkedVal)
        .then((updated) => {
          STATE.checklistItems = STATE.checklistItems.map((it) => (it.id === itemId ? updated : it));
        })
        .catch((err) => console.error('Falha ao salvar o item do checklist', err));
    },
  });
  if (!result) return; // cancelado — nada foi salvo

  let attachmentPath = null;
  if (result.file) {
    try {
      attachmentPath = await uploadAttachment(result.file, obligationId, occurrenceDate);
    } catch (err) {
      console.error(err);
      showToast('Não foi possível enviar o comprovante. A conclusão não foi salva — tente novamente.', 'error');
      return;
    }
  }

  try {
    const created = await markCompletion({
      obligationId,
      occurrenceDate,
      userId: STATE.session.id,
      userLabel: STATE.profile?.display_name || STATE.session.email,
      attachmentPath,
      checklistTotal: result.checklistTotal,
      checklistChecked: result.checklistChecked,
      ocrStatus: result.ocrStatus,
      ocrExtractedPeriod: result.ocrExtractedPeriod,
    });
    STATE.completions.push(created);

    // Reinicia o checklist para o próximo ciclo (mês/trimestre/ano
    // seguinte) começar do zero — o total/marcados desta conclusão já
    // ficou registrado em completions acima, então isso não perde histórico.
    if (checklistItems.length) {
      try {
        await resetChecklistItems(obligationId);
        STATE.checklistItems = STATE.checklistItems.map((it) => (
          it.obligation_id === obligationId ? { ...it, completed: false, completed_by: null, completed_at: null } : it
        ));
      } catch (err) {
        console.error('Falha ao reiniciar o checklist para o próximo ciclo', err);
      }
    }

    if (result.ocrStatus === 'mismatch') {
      showToast('Obrigação concluída, mas a competência do comprovante ficou sinalizada para revisão do gestor.', 'info');
    } else {
      showToast(ob.requires_validation && !isAdmin()
        ? 'Tarefa enviada. Ela será concluída após a validação da Gestão.'
        : attachmentPath
          ? 'Obrigação marcada como concluída, com comprovante anexado.'
          : 'Obrigação marcada como concluída.', 'success');
    }
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      showToast('Alguém já registrou essa conclusão agora há pouco. Atualizando o painel…', 'info');
      await refreshObligationsAndCompletions();
    } else {
      showToast('Não foi possível salvar a conclusão. Tente novamente.', 'error');
    }
  } finally {
    onDone?.();
  }
}
