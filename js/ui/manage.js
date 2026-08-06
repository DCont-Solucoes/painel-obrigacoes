import { STATE, isAdmin } from '../state.js';
import { renderObligationsManage } from './manageObligations.js';
import { renderCompaniesManage } from './manageCompanies.js';
import { renderTeamManage } from './manageTeam.js';
import { renderImportManage } from './manageImport.js';
import { renderAuditManage } from './manageAudit.js';
import { renderHolidaysManage } from './manageHolidays.js';

function subTabsHtml() {
  const tabs = [
    ['obligations', 'Obrigações'],
    ['companies', 'Empresas'],
    ['team', 'Equipe'],
    ['import', 'Importar CSV'],
    ['holidays', 'Feriados'],
    ['audit', 'Histórico'],
  ];
  return '<div class="mgmt-subtabs">' + tabs.map(([key, label]) => (
    `<button class="tab-btn ${STATE.manageSection === key ? 'active' : ''}" data-action="manage-tab" data-section="${key}">${label}</button>`
  )).join('') + '</div>';
}

export function renderManage() {
  if (!isAdmin()) {
    return '<div class="empty">Esta área é restrita a administradores. Fale com um administrador do painel se precisar cadastrar ou alterar obrigações, empresas ou papéis de acesso.</div>';
  }

  let body;
  if (STATE.manageSection === 'companies') {
    body = renderCompaniesManage();
  } else if (STATE.manageSection === 'team') {
    body = renderTeamManage();
  } else if (STATE.manageSection === 'import') {
    body = renderImportManage();
  } else if (STATE.manageSection === 'holidays') {
    body = renderHolidaysManage();
  } else if (STATE.manageSection === 'audit') {
    body = renderAuditManage();
  } else {
    body = renderObligationsManage();
  }

  return subTabsHtml() + '<div class="mgmt-section">' + body + '</div>';
}
