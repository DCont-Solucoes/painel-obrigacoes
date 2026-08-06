import { escapeHtml } from '../dateUtils.js';

// Retorna Promise<{file: File} | null> — null se a pessoa cancelar.
// `checklistItems` pode ser uma lista vazia (obrigação sem checklist
// cadastrado) — nesse caso só o comprovante é exigido.
export function completeDialog(obligationName, checklistItems) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const checklistHtml = checklistItems.length
      ? '<div class="field"><label>Checklist — marque tudo antes de concluir</label>'
        + '<div class="checklist-complete-list">'
        + checklistItems.map((it, i) => (
          `<label class="checklist-complete-item"><input type="checkbox" class="completeChecklistItem" data-idx="${i}" /> ${escapeHtml(it.description)}</label>`
        )).join('')
        + '</div></div>'
      : '';

    backdrop.innerHTML = `
      <div class="modal confirm-card" role="dialog" aria-modal="true" aria-labelledby="completeTitle">
        <h2 id="completeTitle">Concluir "${escapeHtml(obligationName)}"</h2>
        ${checklistHtml}
        <div class="field">
          <label>Comprovante (obrigatório)</label>
          <input type="file" id="completeFileInput" />
          <p class="field-error hidden" id="completeFieldError">Anexe o comprovante para concluir.</p>
        </div>
        <div class="modal-actions">
          <div class="right">
            <button type="button" class="btn-ghost" data-act="cancel">Cancelar</button>
            <button type="button" class="btn-primary" data-act="confirm" id="completeConfirmBtn" disabled>Concluir</button>
          </div>
        </div>
      </div>`;

    function close(result) {
      backdrop.remove();
      resolve(result);
    }

    const confirmBtn = backdrop.querySelector('#completeConfirmBtn');
    const fileInput = backdrop.querySelector('#completeFileInput');
    const checkboxes = Array.from(backdrop.querySelectorAll('.completeChecklistItem'));

    function updateEnabled() {
      const allChecked = checkboxes.every((c) => c.checked);
      const hasFile = fileInput.files && fileInput.files.length > 0;
      confirmBtn.disabled = !(allChecked && hasFile);
    }
    checkboxes.forEach((c) => c.addEventListener('change', updateEnabled));
    fileInput.addEventListener('change', updateEnabled);

    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null); });
    backdrop.querySelector('[data-act="cancel"]').addEventListener('click', () => close(null));
    confirmBtn.addEventListener('click', () => {
      const file = fileInput.files?.[0] || null;
      const allChecked = checkboxes.every((c) => c.checked);
      if (!file || !allChecked) {
        backdrop.querySelector('#completeFieldError').classList.remove('hidden');
        return;
      }
      close({ file });
    });

    document.body.appendChild(backdrop);
  });
}
