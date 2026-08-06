import { STATE, isAdmin, holidaysDateSet } from './state.js';
import { fetchObligations, createObligation, updateObligation, deleteObligation as apiDeleteObligation, createObligationsBulk } from './api/obligations.js';
import { fetchCompletions, markCompletion, deleteCompletion } from './api/completions.js';
import { fetchCompanies, ensureCompany, createCompany, updateCompany, deleteCompany as apiDeleteCompany } from './api/companies.js';
import { fetchProfiles, updateProfile } from './api/profiles.js';
import { fetchComments, createComment, deleteComment as apiDeleteComment } from './api/comments.js';
import { fetchAuditLog } from './api/auditLog.js';
import { fetchChecklistItems, createChecklistItem, deleteChecklistItem as apiDeleteChecklistItem } from './api/checklist.js';
import { fetchHolidays, createHoliday, deleteHoliday as apiDeleteHoliday, fetchNationalHolidays } from './api/holidays.js';
import { uploadAttachment } from './api/storage.js';
import { completeDialog } from './ui/completeDialog.js';
import { getActiveOccurrence, fmtKey } from './dateUtils.js';
import { showToast } from './ui/toast.js';
import { confirmDialog } from './ui/confirmDialog.js';

// Carrega as cinco tabelas em paralelo. Cada uma é independente — se uma
// falhar (ex.: sem conexão), as outras ainda tentam, e sinalizamos o erro
// via STATE.connectionError para a interface mostrar o banner de aviso.
export async function loadAll() {
  STATE.connectionError = null;
  try {
    const [obligations, completions, companies, profiles, holidays] = await Promise.all([
      fetchObligations(),
      fetchCompletions(),
      fetchCompanies(),
      fetchProfiles(),
      fetchHolidays(),
    ]);
    STATE.obligations = obligations;
    STATE.completions = completions;
    STATE.companies = companies;
    STATE.profiles = profiles;
    STATE.holidays = holidays;
  } catch (err) {
    console.error('Falha ao carregar dados do painel', err);
    STATE.connectionError = 'Não foi possível carregar os dados agora. Verifique sua conexão com a internet.';
    throw err;
  }
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

  // Checklist (se houver) e comprovante são exigidos ANTES da conclusão
  // ser gravada — se a pessoa cancelar o diálogo, nada é salvo.
  let checklistItems = [];
  try {
    checklistItems = await fetchChecklistItems(obligationId);
  } catch (err) {
    console.error('Falha ao carregar checklist, seguindo sem ele', err);
  }

  const occurrenceDate = fmtKey(active);
  const result = await completeDialog(ob.name, checklistItems, occurrenceDate);
  if (!result) return; // cancelado — nada foi salvo

  let attachmentPath;
  try {
    attachmentPath = await uploadAttachment(result.file, obligationId, occurrenceDate);
  } catch (err) {
    console.error(err);
    showToast('Não foi possível enviar o comprovante. A conclusão não foi salva — tente novamente.', 'error');
    return;
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
    if (result.ocrStatus === 'mismatch') {
      showToast('Obrigação concluída, mas a competência do comprovante ficou sinalizada para revisão do gestor.', 'info');
    } else {
      showToast('Obrigação marcada como concluída, com comprovante anexado.', 'success');
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

export async function doUndoLast(obligationId, onDone) {
  const mine = STATE.completions.filter((c) => c.obligation_id === obligationId);
  if (!mine.length) return;
  const last = mine.slice().sort((a, b) => a.occurrence_date.localeCompare(b.occurrence_date)).pop();

  const canUndo = isAdmin() || last.done_by === STATE.session?.id;
  if (!canUndo) {
    showToast('Só quem concluiu (ou um administrador) pode desfazer esta conclusão.', 'error');
    return;
  }

  const ok = await confirmDialog({
    title: 'Desfazer conclusão',
    message: 'Desfazer a última conclusão registrada para esta obrigação?',
    confirmLabel: 'Desfazer',
  });
  if (!ok) return;

  try {
    await deleteCompletion(last.id);
    STATE.completions = STATE.completions.filter((c) => c.id !== last.id);
    showToast('Conclusão desfeita.', 'success');
  } catch (err) {
    console.error(err);
    showToast('Não foi possível desfazer agora. Tente novamente.', 'error');
  } finally {
    onDone?.();
  }
}

export async function doDeleteObligation(obligationId, onDone) {
  const ok = await confirmDialog({
    title: 'Excluir obrigação',
    message: 'Excluir esta obrigação do painel? Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir',
  });
  if (!ok) return;

  try {
    await apiDeleteObligation(obligationId);
    STATE.obligations = STATE.obligations.filter((o) => o.id !== obligationId);
    STATE.completions = STATE.completions.filter((c) => c.obligation_id !== obligationId);
    showToast('Obrigação excluída.', 'success');
  } catch (err) {
    console.error(err);
    showToast('Não foi possível excluir agora. Tente novamente.', 'error');
  } finally {
    onDone?.();
  }
}

// `formData` vem do modal já validado; `id` é null para criação.
export async function doSaveObligation(id, formData, onDone) {
  try {
    let companyId = null;
    if (formData.empresaNome) {
      const company = await ensureCompany(formData.empresaNome);
      companyId = company?.id || null;
      if (!STATE.companies.some((c) => c.id === companyId) && company) {
        STATE.companies.push(company);
      }
    }

    const payload = {
      name: formData.name,
      category: formData.category,
      company_id: companyId,
      responsible: formData.responsible,
      responsible_id: formData.responsible_id ?? null,
      frequency: formData.frequency,
      day_of_month: formData.day_of_month ?? null,
      month: formData.month ?? null,
      months: formData.months ?? null,
      due_date: formData.due_date ?? null,
      notes: formData.notes,
      priority: formData.priority || 'media',
      adjust_business_day: !!formData.adjust_business_day,
      day_type: formData.day_type || 'fixo',
    };

    let saved;
    if (id) {
      saved = await updateObligation(id, payload);
      STATE.obligations = STATE.obligations.map((o) => (o.id === id ? saved : o));
    } else {
      saved = await createObligation(payload);
      STATE.obligations.push(saved);
    }
    showToast(id ? 'Obrigação atualizada.' : 'Obrigação cadastrada.', 'success');
    onDone?.(saved);
  } catch (err) {
    console.error(err);
    showToast('Não foi possível salvar. Verifique os campos e tente novamente.', 'error');
  }
}

// ---------- empresas (CRUD) ----------

export async function doCreateCompany(name, onDone) {
  const trimmed = (name || '').trim();
  if (!trimmed) { showToast('Informe o nome da empresa.', 'error'); return; }
  if (STATE.companies.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
    showToast('Já existe uma empresa com esse nome.', 'error');
    return;
  }
  try {
    const created = await createCompany(trimmed);
    STATE.companies.push(created);
    STATE.companies.sort((a, b) => a.name.localeCompare(b.name));
    showToast('Empresa cadastrada.', 'success');
    onDone?.(created);
  } catch (err) {
    console.error(err);
    showToast('Não foi possível cadastrar a empresa agora.', 'error');
  }
}

export async function doRenameCompany(id, name, onDone) {
  const trimmed = (name || '').trim();
  if (!trimmed) { showToast('Informe o nome da empresa.', 'error'); return; }
  try {
    const updated = await updateCompany(id, trimmed);
    STATE.companies = STATE.companies.map((c) => (c.id === id ? updated : c));
    STATE.companies.sort((a, b) => a.name.localeCompare(b.name));
    showToast('Empresa atualizada.', 'success');
    onDone?.(updated);
  } catch (err) {
    console.error(err);
    showToast('Não foi possível salvar o novo nome agora.', 'error');
  }
}

export async function doDeleteCompany(id, onDone) {
  const inUse = STATE.obligations.filter((o) => o.company_id === id).length;
  const ok = await confirmDialog({
    title: 'Excluir empresa',
    message: inUse
      ? `Excluir esta empresa? ${inUse} obrigação(ões) associada(s) a ela ficarão sem empresa vinculada — elas não serão excluídas.`
      : 'Excluir esta empresa do painel?',
    confirmLabel: 'Excluir',
  });
  if (!ok) return;

  try {
    await apiDeleteCompany(id);
    STATE.companies = STATE.companies.filter((c) => c.id !== id);
    STATE.obligations = STATE.obligations.map((o) => (o.company_id === id ? { ...o, company_id: null } : o));
    showToast('Empresa excluída.', 'success');
  } catch (err) {
    console.error(err);
    showToast('Não foi possível excluir agora. Tente novamente.', 'error');
  } finally {
    onDone?.();
  }
}

// ---------- equipe (papéis de acesso) ----------

export async function doChangeRole(profileId, newRole, onDone) {
  if (!isAdmin()) return;
  const person = STATE.profiles.find((p) => p.id === profileId);
  if (!person) return;

  if (profileId === STATE.session?.id && newRole === 'membro') {
    const ok = await confirmDialog({
      title: 'Remover seu próprio acesso de administrador',
      message: 'Você está prestes a se rebaixar para membro. Você perderá acesso a esta área imediatamente. Deseja continuar?',
      confirmLabel: 'Continuar',
    });
    if (!ok) return;
  }

  try {
    const updated = await updateProfile(profileId, { role: newRole });
    STATE.profiles = STATE.profiles.map((p) => (p.id === profileId ? updated : p));
    if (profileId === STATE.session?.id) STATE.profile = updated;
    showToast(`${person.display_name || person.email} agora é ${newRole === 'admin' ? 'administrador(a)' : 'membro'}.`, 'success');
  } catch (err) {
    console.error(err);
    showToast('Não foi possível alterar o papel agora.', 'error');
  } finally {
    onDone?.();
  }
}

// ---------- comentários ----------

export async function doLoadComments(obligationId) {
  try {
    return await fetchComments(obligationId);
  } catch (err) {
    console.error(err);
    showToast('Não foi possível carregar os comentários agora.', 'error');
    return [];
  }
}

export async function doAddComment(obligationId, body, onDone) {
  const trimmed = (body || '').trim();
  if (!trimmed) return;
  try {
    const created = await createComment({
      obligationId,
      authorId: STATE.session.id,
      authorName: STATE.profile?.display_name || STATE.session.email,
      body: trimmed,
    });
    onDone?.(created);
  } catch (err) {
    console.error(err);
    showToast('Não foi possível salvar o comentário agora.', 'error');
  }
}

export async function doDeleteComment(commentId, onDone) {
  const ok = await confirmDialog({
    title: 'Excluir comentário',
    message: 'Excluir este comentário? Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir',
  });
  if (!ok) return;
  try {
    await apiDeleteComment(commentId);
    onDone?.();
  } catch (err) {
    console.error(err);
    showToast('Não foi possível excluir o comentário agora.', 'error');
  }
}

// ---------- checklist ----------

export async function doLoadChecklist(obligationId) {
  try {
    return await fetchChecklistItems(obligationId);
  } catch (err) {
    console.error(err);
    showToast('Não foi possível carregar o checklist agora.', 'error');
    return [];
  }
}

export async function doAddChecklistItem(obligationId, description, position, onDone) {
  const trimmed = (description || '').trim();
  if (!trimmed) return;
  try {
    const created = await createChecklistItem({ obligationId, description: trimmed, position });
    onDone?.(created);
  } catch (err) {
    console.error(err);
    showToast('Não foi possível adicionar o item agora.', 'error');
  }
}

export async function doDeleteChecklistItem(id, onDone) {
  try {
    await apiDeleteChecklistItem(id);
    onDone?.();
  } catch (err) {
    console.error(err);
    showToast('Não foi possível remover o item agora.', 'error');
  }
}

// ---------- histórico / auditoria ----------

export async function doLoadAuditLog(onDone) {
  try {
    const rows = await fetchAuditLog({ limit: 200 });
    STATE.auditLog = rows;
  } catch (err) {
    console.error(err);
    showToast('Não foi possível carregar o histórico agora.', 'error');
    STATE.auditLog = [];
  } finally {
    onDone?.();
  }
}

// ---------- feriados ----------

export async function doAddHoliday(date, name, onDone) {
  if (!date || !name.trim()) { showToast('Informe a data e o nome do feriado.', 'error'); return; }
  try {
    const created = await createHoliday({ date, name: name.trim() });
    STATE.holidays.push(created);
    STATE.holidays.sort((a, b) => a.holiday_date.localeCompare(b.holiday_date));
    showToast('Feriado cadastrado.', 'success');
  } catch (err) {
    console.error(err);
    const msg = err.code === '23505' ? 'Já existe um feriado cadastrado nessa data.' : 'Não foi possível cadastrar o feriado agora.';
    showToast(msg, 'error');
  } finally {
    onDone?.();
  }
}

export async function doDeleteHoliday(id, onDone) {
  try {
    await apiDeleteHoliday(id);
    STATE.holidays = STATE.holidays.filter((h) => h.id !== id);
    showToast('Feriado removido.', 'success');
  } catch (err) {
    console.error(err);
    showToast('Não foi possível remover o feriado agora.', 'error');
  } finally {
    onDone?.();
  }
}

export async function doImportNationalHolidays(year, onDone) {
  try {
    const list = await fetchNationalHolidays(year);
    let added = 0;
    for (const h of list) {
      if (STATE.holidays.some((existing) => existing.holiday_date === h.date)) continue;
      try {
        const created = await createHoliday(h);
        STATE.holidays.push(created);
        added++;
      } catch (err) {
        if (err.code !== '23505') throw err; // ignora duplicidade, propaga outros erros
      }
    }
    STATE.holidays.sort((a, b) => a.holiday_date.localeCompare(b.holiday_date));
    showToast(`${added} feriado(s) de ${year} importado(s).`, 'success');
  } catch (err) {
    console.error(err);
    showToast('Não foi possível buscar os feriados agora (serviço externo pode estar indisponível). Você ainda pode cadastrar manualmente.', 'error');
  } finally {
    onDone?.();
  }
}

// `validRows` já vem filtrado e validado por js/csv.js (validateImportRows).
// Cada item tem `.mapped` com os campos prontos, faltando só resolver
// empresa (criar se não existir) e responsável (vincular a um perfil, se
// o nome bater com alguém já cadastrado).
export async function doImportObligations(validRows, onDone) {
  if (!validRows.length) return;
  try {
    const companyCache = new Map();
    for (const row of validRows) {
      const key = row.mapped.empresaNome.toLowerCase();
      if (row.mapped.empresaNome && !companyCache.has(key)) {
        const company = await ensureCompany(row.mapped.empresaNome);
        companyCache.set(key, company);
        if (company && !STATE.companies.some((c) => c.id === company.id)) {
          STATE.companies.push(company);
        }
      }
    }

    const payloads = validRows.map((row) => {
      const { mapped } = row;
      const company = mapped.empresaNome ? companyCache.get(mapped.empresaNome.toLowerCase()) : null;
      const profile = mapped.responsibleText
        ? STATE.profiles.find((p) => (p.display_name || '').toLowerCase() === mapped.responsibleText.toLowerCase())
        : null;
      return {
        name: mapped.name,
        category: mapped.category,
        company_id: company ? company.id : null,
        responsible: profile ? profile.display_name : mapped.responsibleText,
        responsible_id: profile ? profile.id : null,
        frequency: mapped.frequency,
        day_type: mapped.day_type || 'fixo',
        day_of_month: mapped.day_of_month,
        month: mapped.month,
        months: mapped.months,
        due_date: mapped.due_date,
        notes: mapped.notes,
      };
    });

    const created = await createObligationsBulk(payloads);
    STATE.obligations.push(...created);
    showToast(`${created.length} obrigação(ões) importada(s) com sucesso.`, 'success');
    STATE.importPreview = null;
    onDone?.({ success: created.length });
  } catch (err) {
    console.error(err);
    showToast('Falha ao importar. Nenhuma obrigação foi salva — corrija e tente de novo.', 'error');
    onDone?.({ success: 0 });
  }
}
