import { STATE, companyName } from '../state.js';
import { CATEGORIES, MONTH_NAMES, MONTH_FULL } from '../constants.js';
import { escapeHtml } from '../dateUtils.js';
import { doSaveObligation, doDeleteObligation } from '../data.js';

let onSavedCallback = null;

export function closeModal() {
  document.getElementById('modalBackdrop').setAttribute('hidden', '');
  STATE.editingId = null;
}

function clearFieldError() {
  document.getElementById('modalFieldError')?.remove();
}

function showFieldError(message) {
  clearFieldError();
  const actions = document.querySelector('#modal .modal-actions');
  const el = document.createElement('p');
  el.id = 'modalFieldError';
  el.className = 'field-error';
  el.textContent = message;
  actions.before(el);
}

export function openModal(editId, { onSaved } = {}) {
  onSavedCallback = onSaved || null;
  STATE.editingId = editId || null;
  const existing = editId ? STATE.obligations.find((o) => o.id === editId) : null;
  const isEdit = !!existing;

  const ob = existing || {
    id: null,
    name: '',
    category: 'federal',
    frequency: 'mensal',
    responsible: '',
    company_id: STATE.companies[0]?.id || null,
    day_of_month: 10,
    month: 1,
    months: [3, 6, 9, 12],
    due_date: '',
    notes: '',
  };
  const empresaNomeAtual = existing ? companyName(existing.company_id) : (STATE.companies[0]?.name || '');

  const monthsChips = MONTH_NAMES.map((m, i) => {
    const n = i + 1;
    const sel = (ob.months || []).includes(n);
    return `<div class="month-chip ${sel ? 'sel' : ''}" data-month="${n}">${m}</div>`;
  }).join('');

  const catOptions = CATEGORIES.map((c) => `<option value="${c.key}" ${ob.category === c.key ? 'selected' : ''}>${c.label}</option>`).join('');
  const monthFullOptions = MONTH_FULL.map((m, i) => `<option value="${i + 1}" ${ob.month === i + 1 ? 'selected' : ''}>${m}</option>`).join('');

  let html = `<h2>${isEdit ? 'Editar obrigação' : 'Nova obrigação'}</h2>`;
  html += `<div class="field"><label>Nome da obrigação</label><input id="fName" type="text" value="${escapeHtml(ob.name)}" placeholder="Ex.: DCTFWeb" /></div>`;
  html += `<div class="field"><label>Categoria</label><select id="fCategory">${catOptions}</select></div>`;
  html += `<div class="field"><label>Empresa</label><input id="fEmpresa" type="text" list="empresaList" value="${escapeHtml(empresaNomeAtual)}" placeholder="Ex.: GRA" />`;
  html += `<datalist id="empresaList">${STATE.companies.map((c) => `<option value="${escapeHtml(c.name)}">`).join('')}</datalist></div>`;
  html += `<div class="field"><label>Responsável</label><input id="fResponsible" type="text" list="teamList" value="${escapeHtml(ob.responsible || '')}" placeholder="Nome da pessoa" />`;
  const team = Array.from(new Set(STATE.obligations.map((o) => o.responsible).filter(Boolean))).sort();
  html += `<datalist id="teamList">${team.map((t) => `<option value="${escapeHtml(t)}">`).join('')}</datalist></div>`;
  html += '<div class="field"><label>Frequência</label><select id="fFrequency">'
    + `<option value="mensal" ${ob.frequency === 'mensal' ? 'selected' : ''}>Mensal</option>`
    + `<option value="trimestral" ${ob.frequency === 'trimestral' ? 'selected' : ''}>Trimestral</option>`
    + `<option value="anual" ${ob.frequency === 'anual' ? 'selected' : ''}>Anual</option>`
    + `<option value="pontual" ${ob.frequency === 'pontual' ? 'selected' : ''}>Pontual (data única)</option>`
    + '</select></div>';

  html += `<div class="field freq-mensal"><label>Dia do vencimento (mensal)</label><input id="fDayMensal" type="number" min="1" max="31" value="${ob.day_of_month || 10}" /></div>`;
  html += `<div class="field freq-trimestral"><label>Dia do vencimento</label><input id="fDayTri" type="number" min="1" max="31" value="${ob.day_of_month || 10}" /></div>`;
  html += `<div class="field freq-trimestral"><label>Meses de vencimento</label><div class="months-grid" id="monthsGrid">${monthsChips}</div></div>`;
  html += `<div class="field freq-anual"><label>Mês</label><select id="fMonth">${monthFullOptions}</select></div>`;
  html += `<div class="field freq-anual"><label>Dia</label><input id="fDayAnual" type="number" min="1" max="31" value="${ob.day_of_month || 10}" /></div>`;
  html += `<div class="field freq-pontual"><label>Data</label><input id="fDate" type="date" value="${ob.due_date || ''}" /></div>`;

  html += `<div class="field"><label>Observações (opcional)</label><textarea id="fNotes" placeholder="Ex.: confirmar prazo no calendário RFB antes do envio">${escapeHtml(ob.notes || '')}</textarea></div>`;

  html += '<div class="modal-actions">';
  html += `<div>${isEdit ? `<button class="btn-danger-text" data-action="delete-in-modal" data-id="${ob.id}">Excluir</button>` : ''}</div>`;
  html += `<div class="right"><button class="btn-ghost" data-action="close">Cancelar</button><button class="btn-primary" id="modalSaveBtn" data-action="save" data-id="${ob.id || ''}">Salvar</button></div>`;
  html += '</div>';

  const modalEl = document.getElementById('modal');
  modalEl.innerHTML = html;
  document.getElementById('modalBackdrop').removeAttribute('hidden');
  toggleFreqFields(ob.frequency);

  const freqSel = document.getElementById('fFrequency');
  freqSel.addEventListener('change', () => toggleFreqFields(freqSel.value));

  const grid = document.getElementById('monthsGrid');
  grid.addEventListener('click', (e) => {
    const chip = e.target.closest('.month-chip');
    if (!chip) return;
    chip.classList.toggle('sel');
  });

  modalEl.querySelector('[data-action="close"]').addEventListener('click', closeModal);
  if (isEdit) {
    modalEl.querySelector('[data-action="delete-in-modal"]').addEventListener('click', () => {
      const id = existing.id;
      closeModal();
      doDeleteObligation(id, () => onSavedCallback?.());
    });
  }
  modalEl.querySelector('[data-action="save"]').addEventListener('click', () => handleSave(existing?.id || null));
}

function toggleFreqFields(freq) {
  ['mensal', 'trimestral', 'anual', 'pontual'].forEach((f) => {
    document.querySelectorAll(`.freq-${f}`).forEach((el) => el.classList.toggle('hidden', f !== freq));
  });
}

function readModalForm() {
  const name = document.getElementById('fName').value.trim();
  if (!name) return { error: 'Informe o nome da obrigação.' };

  const category = document.getElementById('fCategory').value;
  const empresaNome = document.getElementById('fEmpresa').value.trim();
  const responsible = document.getElementById('fResponsible').value.trim();
  const frequency = document.getElementById('fFrequency').value;
  const notes = document.getElementById('fNotes').value.trim();

  const form = {
    name, category, empresaNome, responsible, frequency, notes,
    day_of_month: null, month: null, months: null, due_date: null,
  };

  if (frequency === 'mensal') {
    form.day_of_month = Math.max(1, Math.min(31, parseInt(document.getElementById('fDayMensal').value, 10) || 1));
  } else if (frequency === 'trimestral') {
    form.day_of_month = Math.max(1, Math.min(31, parseInt(document.getElementById('fDayTri').value, 10) || 1));
    const sel = Array.from(document.querySelectorAll('#monthsGrid .month-chip.sel')).map((c) => parseInt(c.getAttribute('data-month'), 10));
    if (!sel.length) return { error: 'Selecione ao menos um mês de vencimento.' };
    form.months = sel;
  } else if (frequency === 'anual') {
    form.month = parseInt(document.getElementById('fMonth').value, 10);
    form.day_of_month = Math.max(1, Math.min(31, parseInt(document.getElementById('fDayAnual').value, 10) || 1));
  } else if (frequency === 'pontual') {
    const dateVal = document.getElementById('fDate').value;
    if (!dateVal) return { error: 'Informe a data.' };
    form.due_date = dateVal;
  }

  return { form };
}

async function handleSave(id) {
  const { form, error } = readModalForm();
  if (error) { showFieldError(error); return; }
  clearFieldError();

  const btn = document.getElementById('modalSaveBtn');
  btn.disabled = true;
  btn.textContent = 'Salvando…';

  await doSaveObligation(id, form, (saved) => {
    closeModal();
    onSavedCallback?.(saved);
  });

  if (document.getElementById('modalSaveBtn')) {
    btn.disabled = false;
    btn.textContent = 'Salvar';
  }
}
