/* ============================================================
   FOUNDER OS — Prospection : pilote du jour + base marché
   ============================================================ */

import {
  COMPANY_FIELDS, getMeta, updateMeta, normalizeText, uid, todayStr,
  getCompaniesList, getCompanyById, saveCompany, deleteCompany, mergeCompanies,
  findCompanyByName, getContactsForCompany, getContacts, saveContact,
  getGroupMembers, computeGroupCoverage, countRequestsOn, suggestQuota, getLastInteraction,
  openModal, closeModal, confirmModal, toast, fmtDate, starsHTML,
} from './core.js';
import {
  parseMarketBase, analyzeMarketImport, applyMarketImport,
  downloadTemplate, exportCompanies, COLUMN_ALIASES,
} from './prospection-io.js';

const PAGE_SIZE = 25;

let _tab       = 'pilote';   // 'pilote' | 'base'
let _pickedId  = null;       // entreprise en cours dans le pilote
let _detailId  = null;       // fiche ouverte
let _search    = '';
let _fPriority = 'Toutes';
let _fStatus   = 'Tous';
let _fSector   = 'Tous';
let _fGroup    = 'Tous';
let _page      = 1;

export function renderProspection(container) {
  if (_detailId && !getCompanyById(_detailId)) _detailId = null;
  if (_detailId) return _renderDetail(container);

  const companies = getCompaniesList();
  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Prospection</div>
        <div class="page-subtitle">${companies.length} entreprise${companies.length > 1 ? 's' : ''} en base</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" id="pr-format">Format d'import</button>
        <button class="btn btn-primary" id="pr-import">Importer une base</button>
      </div>
    </div>

    <div class="task-tabs">
      <button class="task-tab ${_tab === 'pilote' ? 'active' : ''}" data-ptab="pilote">Prospection du jour</button>
      <button class="task-tab ${_tab === 'base' ? 'active' : ''}" data-ptab="base">Base marché <span class="task-tab-count">${companies.length}</span></button>
    </div>

    <div id="pr-body"></div>
  `;

  if (_tab === 'base') _renderBase(container);
  else _renderPilote(container);

  container.querySelectorAll('[data-ptab]').forEach(b =>
    b.addEventListener('click', () => { _tab = b.dataset.ptab; renderProspection(container); }));
  container.querySelector('#pr-import').addEventListener('click', () => _openImportModal(container));
  container.querySelector('#pr-format').addEventListener('click', () => _openFormatModal());
}

// ── Pilote du jour ───────────────────────────────────────────
function _renderPilote(container) {
  renderDailyPilot(container.querySelector('#pr-body'), {
    onChange: () => renderProspection(container),
  });
}

// Le pilote du jour, montrable ailleurs que dans la vue Prospection (il est
// épinglé au dashboard). `onOpenDetail` permet à l'hôte de décider ce que
// « Voir la fiche » veut dire chez lui.
export function renderDailyPilot(slot, { onChange, onOpenDetail } = {}) {
  if (!slot) return;
  const meta = getMeta();
  const goal = Number(meta.daily_request_goal) || 10;
  const done = countRequestsOn(getContacts(), todayStr());
  const pct  = goal > 0 ? Math.min(Math.round((done / goal) * 100), 100) : 0;
  const picked = _pickedId ? getCompanyById(_pickedId) : null;

  slot.innerHTML = `
    <div class="card prosp-day">
      <div class="prosp-day-head">
        <div>
          <div class="prosp-day-count">${done} <span>/ ${goal}</span></div>
          <div class="prosp-day-label">demandes de connexion aujourd'hui</div>
        </div>
        ${done >= goal ? '<span class="prosp-day-badge">🎯 Objectif atteint</span>' : ''}
      </div>
      <div class="rm-track-wrap"><div class="rm-track-fill" style="width:${pct}%"></div></div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="prosp-pick-head">
        <div class="card-title" style="margin:0">Entreprise en cours</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm" id="pr-next">🎲 Entreprise suivante</button>
          ${picked ? '<button class="btn btn-ghost btn-sm" id="pr-clear">Changer</button>' : ''}
        </div>
      </div>
      ${picked ? _pickedHTML(picked) : `
        <div class="qw-empty">
          ${getCompaniesList().length
            ? 'Pioche une entreprise à travailler, ou choisis-la dans la base marché.'
            : 'Aucune entreprise en base. Importe ta base marché pour démarrer.'}
        </div>`}
    </div>
  `;
  _bindPilote(slot, onChange || (() => renderDailyPilot(slot, { onChange, onOpenDetail })), onOpenDetail);
}

function _pickedHTML(co) {
  const meta = getMeta();
  const quota = suggestQuota(co, {
    defaultQuota: Number(meta.default_quota) || 3,
    largeQuota:   Number(meta.large_quota) || 5,
    byPriority:   meta.quota_by_priority || {},
  });
  const linked = getContactsForCompany(co.id);
  const todayCount = linked.reduce((n, c) =>
    n + (c.interactions || []).filter(i => i.type === 'li_demande' && i.date === todayStr()).length, 0);

  return `
    <div class="prosp-picked">
      <div class="prosp-picked-top">
        <div>
          <div class="prosp-picked-name">${_esc(co.name)}</div>
          <div class="prosp-picked-meta">
            ${co.group ? `<span class="badge badge-part">${_esc(co.group)}</span>` : ''}
            ${co.city ? _esc(co.city) + ' · ' : ''}${_esc(co.sector)}
            ${co.priority ? ` · priorité ${_esc(co.priority)}` : ''}
          </div>
        </div>
        <div class="prosp-quota">
          <span class="prosp-quota-val">${todayCount} / ${quota}</span>
          <span class="prosp-quota-lbl">demandes suggérées</span>
        </div>
      </div>

      ${co.target_role ? `<div class="prosp-target">🎯 Viser : <strong>${_esc(co.target_role)}</strong></div>` : ''}
      ${co.website ? `<div class="prosp-target">🔗 <a href="${_esc(co.website)}" target="_blank" rel="noopener">${_esc(co.website)}</a></div>` : ''}

      <div class="divider"></div>
      <div class="section-title">Personnes déjà ajoutées (${linked.length})</div>
      ${linked.length ? linked.map(c => {
        const last = getLastInteraction(c);
        return `<div class="task-item" style="cursor:default">
          <span class="task-title">${_esc(c.name)}</span>
          <div class="task-meta" style="font-size:.76rem;color:var(--text-3)">
            ${last ? `${_esc(last.type.replace(/_/g, ' '))} · ${fmtDate(last.date)}` : 'aucune interaction'}
          </div>
        </div>`;
      }).join('') : '<div class="form-hint">Personne pour l\'instant.</div>'}

      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" id="pr-add-contact">+ Contact + demande LinkedIn</button>
        <button class="btn btn-ghost btn-sm" id="pr-open-detail">Voir la fiche →</button>
      </div>
    </div>`;
}

function _bindPilote(slot, go, onOpenDetail) {
  slot.querySelector('#pr-next')?.addEventListener('click', () => {
    const next = _pickNextCompany();
    if (!next) { toast('Aucune entreprise à proposer', 'error'); return; }
    _pickedId = next.id;
    go();
  });
  slot.querySelector('#pr-clear')?.addEventListener('click', () => { _pickedId = null; go(); });
  slot.querySelector('#pr-open-detail')?.addEventListener('click', () => {
    if (onOpenDetail) { onOpenDetail(_pickedId); return; }
    _detailId = _pickedId;
    go();
  });
  slot.querySelector('#pr-add-contact')?.addEventListener('click', () =>
    _openQuickContactModal(_pickedId, go));
}

// Priorité aux entreprises « à contacter » non travaillées aujourd'hui,
// puis au score décroissant.
function _pickNextCompany() {
  const today = todayStr();
  const touchedToday = new Set(getContacts()
    .filter(c => (c.interactions || []).some(i => i.type === 'li_demande' && i.date === today))
    .map(c => c.company_id));

  const pool = getCompaniesList().filter(c => c.id !== _pickedId && !touchedToday.has(c.id));
  if (!pool.length) return null;
  const toContact = pool.filter(c => /contacter|todo|à faire|nouveau/i.test(c.status || '') || !c.status);
  const from = toContact.length ? toContact : pool;
  return [...from].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))[0];
}

// Ajouter la personne EST le log : le compteur et l'entonnoir montent seuls.
function _openQuickContactModal(companyId, onDone) {
  const co = getCompanyById(companyId);
  if (!co) return;

  openModal({
    title: 'Nouveau contact + demande',
    saveLabel: 'Ajouter et loguer la demande',
    bodyHTML: `
      <div class="form-hint" style="margin-bottom:14px">
        Chez <strong>${_esc(co.name)}</strong>${co.target_role ? ` · cible : ${_esc(co.target_role)}` : ''}
      </div>
      <div class="form-group">
        <label class="form-label">Nom de la personne *</label>
        <input class="form-input" id="qc-name" placeholder="Prénom Nom" autofocus>
      </div>
      <div class="form-group">
        <label class="form-label">Profil LinkedIn</label>
        <input class="form-input" id="qc-linkedin" placeholder="https://linkedin.com/in/…">
      </div>
      <div class="form-group">
        <label class="form-label">Rôle</label>
        <input class="form-input" id="qc-role" value="${_esc(co.target_role)}" placeholder="Fonction dans l'entreprise">
      </div>
      <div class="form-hint">
        La demande de connexion est enregistrée à la date du jour : le compteur et
        l'entonnoir du dashboard se mettent à jour seuls.
      </div>`,
    onSave: () => {
      const name = document.getElementById('qc-name').value.trim();
      if (!name) { toast('Le nom est requis', 'error'); return; }
      const role = document.getElementById('qc-role').value.trim();
      saveContact({
        id: uid('c'), name, company: co.name, company_id: co.id,
        poste: role, pertinence: 3, notes: '',
        interactions: [{ id: uid('ia'), type: 'li_demande', date: todayStr(), note: '', next_followup: null }],
        email: '', phone: '', linkedin: document.getElementById('qc-linkedin').value.trim(),
      });
      if (!co.status || /contacter/i.test(co.status)) saveCompany({ ...co, status: 'En cours' });
      closeModal();
      toast('Contact ajouté et demande loguée', 'success');
      onDone?.();
    },
  });
}

// ── Base marché ──────────────────────────────────────────────
function _renderBase(container) {
  const all = getCompaniesList();
  const contacts = getContacts();
  const filtered = _applyFilters(all).sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (_page > pageCount) _page = pageCount;
  const start = (_page - 1) * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);

  const uniq = key => [...new Set(all.map(c => (c[key] || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));

  container.querySelector('#pr-body').innerHTML = `
    <div class="crm-search">
      <svg class="crm-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input class="form-input crm-search-input" id="pr-search" value="${_esc(_search)}" placeholder="Rechercher un nom, une ville, une activité, une note…" autocomplete="off">
      ${_search ? '<button class="crm-search-clear" id="pr-search-clear" title="Vider">×</button>' : ''}
    </div>

    <div class="filter-bar">
      ${_selectHTML('pr-f-priority', 'Priorité', 'Toutes', uniq('priority'), _fPriority)}
      ${_selectHTML('pr-f-status', 'Statut', 'Tous', uniq('status'), _fStatus)}
      ${_selectHTML('pr-f-sector', 'Secteur', 'Tous', uniq('sector'), _fSector)}
      ${_selectHTML('pr-f-group', 'Groupe', 'Tous', uniq('group'), _fGroup)}
      <button class="btn btn-ghost btn-sm" id="pr-export" style="margin-left:auto">Exporter</button>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <table class="crm-table">
        <thead><tr>
          <th>Entreprise</th><th>Groupe</th><th>Ville</th><th>Secteur</th>
          <th>Priorité</th><th>Score</th><th>Statut</th><th>Touchés</th>
        </tr></thead>
        <tbody>
          ${rows.length ? rows.map(co => _rowHTML(co, contacts)).join('') : `
            <tr><td colspan="8"><div class="empty-state"><p>${
              all.length ? (_search ? `Aucune entreprise ne correspond à « ${_esc(_search)} »` : 'Aucune entreprise pour ces filtres')
                         : 'Base vide — importe ta base marché'}</p></div></td></tr>`}
        </tbody>
      </table>
    </div>

    ${filtered.length ? `
      <div class="crm-pager">
        <span class="crm-pager-count">${filtered.length} entreprise${filtered.length > 1 ? 's' : ''}${pageCount > 1 ? ` · ${start + 1}–${start + rows.length}` : ''}</span>
        ${pageCount > 1 ? `
          <div class="crm-pager-nav">
            <button class="btn btn-secondary btn-sm" id="pr-prev" ${_page === 1 ? 'disabled' : ''}>‹ Précédent</button>
            <span class="crm-pager-pos">Page ${_page} / ${pageCount}</span>
            <button class="btn btn-secondary btn-sm" id="pr-next-page" ${_page === pageCount ? 'disabled' : ''}>Suivant ›</button>
          </div>` : ''}
      </div>` : ''}
  `;
  _bindBase(container);
}

function _selectHTML(id, label, allLabel, values, current) {
  return `<label class="pr-filter">
    <span>${label}</span>
    <select class="form-select crm-company-select" id="${id}">
      <option value="${allLabel}">${allLabel}</option>
      ${values.map(v => `<option value="${_esc(v)}" ${current === v ? 'selected' : ''}>${_esc(v)}</option>`).join('')}
    </select>
  </label>`;
}

function _rowHTML(co, contacts) {
  const linked = contacts.filter(c => c.company_id === co.id);
  const touched = linked.filter(c => (c.interactions || []).length).length;
  return `
    <tr data-co="${co.id}">
      <td><div class="contact-name">${_esc(co.name)}</div></td>
      <td>${co.group ? `<span class="badge badge-part pr-group-badge" data-group="${_esc(co.group)}">${_esc(co.group)}</span>` : '<span style="color:var(--text-3)">—</span>'}</td>
      <td>${_esc(co.city) || '—'}</td>
      <td><span class="sector-tag">${_esc(co.sector) || '—'}</span></td>
      <td>${co.priority ? `<span class="badge badge-q3">${_esc(co.priority)}</span>` : '—'}</td>
      <td><strong>${co.score !== '' && co.score !== undefined ? _esc(String(co.score)) : '—'}</strong></td>
      <td>${_esc(co.status) || '—'}</td>
      <td>${touched}/${linked.length}</td>
    </tr>`;
}

function _applyFilters(list) {
  const q = normalizeText(_search);
  return list.filter(co => {
    if (q) {
      const hay = normalizeText([co.name, co.city, co.activities, co.note, co.group, co.sector].filter(Boolean).join(' '));
      if (!hay.includes(q)) return false;
    }
    if (_fPriority !== 'Toutes' && (co.priority || '') !== _fPriority) return false;
    if (_fStatus !== 'Tous' && (co.status || '') !== _fStatus) return false;
    if (_fSector !== 'Tous' && (co.sector || '') !== _fSector) return false;
    if (_fGroup !== 'Tous' && (co.group || '') !== _fGroup) return false;
    return true;
  });
}

function _bindBase(container) {
  const reset = () => { _page = 1; renderProspection(container); };

  const search = container.querySelector('#pr-search');
  search?.addEventListener('input', () => {
    _search = search.value; _page = 1;
    renderProspection(container);
    const again = container.querySelector('#pr-search');
    again.focus();
    again.setSelectionRange(again.value.length, again.value.length);
  });
  container.querySelector('#pr-search-clear')?.addEventListener('click', () => { _search = ''; reset(); });

  const bind = (id, setter) => container.querySelector('#' + id)?.addEventListener('change', e => { setter(e.target.value); reset(); });
  bind('pr-f-priority', v => { _fPriority = v; });
  bind('pr-f-status',   v => { _fStatus = v; });
  bind('pr-f-sector',   v => { _fSector = v; });
  bind('pr-f-group',    v => { _fGroup = v; });

  container.querySelector('#pr-prev')?.addEventListener('click', () => { if (_page > 1) { _page--; renderProspection(container); } });
  container.querySelector('#pr-next-page')?.addEventListener('click', () => { _page++; renderProspection(container); });
  container.querySelector('#pr-export')?.addEventListener('click', () => {
    exportCompanies(getCompaniesList());
    toast('Base exportée');
  });

  container.querySelectorAll('.pr-group-badge').forEach(b =>
    b.addEventListener('click', e => { e.stopPropagation(); _fGroup = b.dataset.group; reset(); }));
  container.querySelectorAll('tr[data-co]').forEach(tr =>
    tr.addEventListener('click', () => { _detailId = tr.dataset.co; renderProspection(container); }));
}

// ── Fiche entreprise ─────────────────────────────────────────
function _renderDetail(container) {
  const co = getCompanyById(_detailId);
  const companies = getCompaniesList();
  const contacts = getContacts();
  const linked = getContactsForCompany(co.id, contacts);
  const members = getGroupMembers(co, companies).filter(c => c.id !== co.id);
  const coverage = computeGroupCoverage(co, companies, contacts);
  const custom = Object.entries(co.custom || {});

  const field = (key, label, type = 'text') => `
    <div class="form-group">
      <label class="form-label">${label}</label>
      <input class="form-input" data-cf="${key}" type="${type}" value="${_esc(co[key] ?? '')}">
    </div>`;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <button class="btn btn-ghost btn-sm" id="pr-back">← Prospection</button>
        <div class="page-title" style="margin-top:6px">${_esc(co.name)}</div>
        <div class="page-subtitle">${linked.length} contact${linked.length > 1 ? 's' : ''} · ${coverage.touched} touché${coverage.touched > 1 ? 's' : ''} sur le groupe</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" id="pr-add-c">+ Contact</button>
        <button class="btn btn-secondary btn-sm" id="pr-merge">Fusionner avec…</button>
        <button class="btn btn-danger btn-sm" id="pr-del">Supprimer</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Fiche</div>
      <div class="form-row">${field('name', 'Nom')}${field('group', 'Groupe / réseau')}</div>
      <div class="form-row">${field('city', 'Ville')}${field('region', 'Région')}</div>
      <div class="form-row">${field('sector', 'Secteur')}${field('activities', 'Activités')}</div>
      <div class="form-row">${field('priority', 'Priorité')}${field('score', 'Score')}</div>
      <div class="form-row">${field('status', 'Statut')}${field('size', 'Taille')}</div>
      <div class="form-row">${field('target_role', 'Rôle cible')}${field('website', 'Site web')}</div>
      <div class="form-row">${field('email', 'Email')}${field('phone', 'Téléphone')}</div>
      ${field('note', 'Note')}
      ${co.ref ? `<div class="form-hint">Référence d'import : <code>${_esc(co.ref)}</code></div>` : ''}
      <button class="btn btn-primary btn-sm" id="pr-save" style="margin-top:10px">Enregistrer</button>
    </div>

    ${custom.length ? `
      <div class="card" style="margin-top:16px">
        <div class="card-title">Champs personnalisés</div>
        <div class="form-hint" style="margin-bottom:12px">Colonnes de ta base non couvertes par le socle — conservées telles quelles.</div>
        ${custom.map(([k, v]) => `
          <div class="pr-custom-row">
            <span class="pr-custom-key">${_esc(k)}</span>
            <input class="form-input pr-custom-val" data-ck="${_esc(k)}" value="${_esc(String(v ?? ''))}">
          </div>`).join('')}
      </div>` : ''}

    <div class="card" style="margin-top:16px">
      <div class="card-title">Contacts (${linked.length})</div>
      ${linked.length ? linked.map(c => {
        const last = getLastInteraction(c);
        return `<div class="task-item" style="cursor:default">
          <span class="task-title">${_esc(c.name)}</span>
          <div class="task-meta">
            <span class="stars">${starsHTML(c.pertinence || 0)}</span>
            <span style="font-size:.76rem;color:var(--text-3)">${last ? fmtDate(last.date) : 'jamais contacté'}</span>
          </div>
        </div>`;
      }).join('') : '<div class="form-hint">Aucun contact rattaché.</div>'}
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-title">Groupe</div>
      ${co.group ? `<div style="margin-bottom:10px"><span class="badge badge-part">${_esc(co.group)}</span></div>` : ''}
      <div class="prosp-global" style="margin-bottom:12px">
        <span class="prosp-global-value">${coverage.touched}</span>
        <span class="prosp-global-label">personne${coverage.touched > 1 ? 's' : ''} touchée${coverage.touched > 1 ? 's' : ''} sur ${coverage.companies} entreprise${coverage.companies > 1 ? 's' : ''} du groupe (${coverage.contacts} contact${coverage.contacts > 1 ? 's' : ''} enregistré${coverage.contacts > 1 ? 's' : ''})</span>
      </div>
      ${members.length ? members.map(m => `
        <div class="task-item" data-sister="${m.id}">
          <span class="task-title">${_esc(m.name)}</span>
          <div class="task-meta" style="font-size:.76rem;color:var(--text-3)">
            ${_esc(m.city)} ${m.parent_id === co.id ? '· filiale' : co.parent_id === m.id ? '· maison mère' : ''}
          </div>
        </div>`).join('') : '<div class="form-hint">Aucune entreprise sœur.</div>'}
    </div>
  `;
  _bindDetail(container);
}

function _bindDetail(container) {
  const go = () => renderProspection(container);
  const co = getCompanyById(_detailId);

  container.querySelector('#pr-back').addEventListener('click', () => { _detailId = null; go(); });

  container.querySelector('#pr-save').addEventListener('click', () => {
    const patch = { ...co };
    container.querySelectorAll('[data-cf]').forEach(i => { patch[i.dataset.cf] = i.value.trim(); });
    const custom = { ...(co.custom || {}) };
    container.querySelectorAll('[data-ck]').forEach(i => { custom[i.dataset.ck] = i.value; });
    patch.custom = custom;
    if (!patch.name) { toast('Le nom est requis', 'error'); return; }
    saveCompany(patch);
    toast('Fiche enregistrée', 'success');
    go();
  });

  container.querySelector('#pr-add-c').addEventListener('click', () => _openQuickContactModal(co.id, go));
  container.querySelectorAll('[data-sister]').forEach(el =>
    el.addEventListener('click', () => { _detailId = el.dataset.sister; go(); }));

  container.querySelector('#pr-del').addEventListener('click', () => {
    const n = getContactsForCompany(co.id).length;
    confirmModal(
      `Supprimer « ${co.name} » ?${n ? ` Ses ${n} contact${n > 1 ? 's' : ''} seront conservés mais déliés.` : ''}`,
      () => { deleteCompany(co.id); _detailId = null; toast('Entreprise supprimée'); go(); });
  });

  container.querySelector('#pr-merge').addEventListener('click', () => _openMergeModal(co, container));
}

function _openMergeModal(co, container) {
  const others = getCompaniesList().filter(c => c.id !== co.id)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  openModal({
    title: 'Fusionner deux fiches',
    saveLabel: 'Fusionner',
    bodyHTML: `
      <div class="form-hint" style="margin-bottom:14px">
        Les contacts et les champs renseignés du doublon sont récupérés par la fiche
        conservée ; le doublon est ensuite supprimé.
      </div>
      <div class="form-group">
        <label class="form-label">Doublon à absorber</label>
        <select class="form-select" id="mg-dup">
          ${others.map(c => `<option value="${c.id}">${_esc(c.name)}${c.city ? ' — ' + _esc(c.city) : ''}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Fiche conservée</label>
        <select class="form-select" id="mg-keep">
          <option value="${co.id}">${_esc(co.name)} (fiche courante)</option>
          <option value="__dup__">…garder plutôt le doublon sélectionné</option>
        </select>
      </div>`,
    onSave: () => {
      const dupId = document.getElementById('mg-dup').value;
      const keep = document.getElementById('mg-keep').value;
      if (!dupId) { toast('Aucune fiche à fusionner', 'error'); return; }
      const canonicalId = keep === '__dup__' ? dupId : co.id;
      const absorbedId  = keep === '__dup__' ? co.id : dupId;
      const merged = mergeCompanies(canonicalId, absorbedId);
      if (!merged) { toast('Fusion impossible', 'error'); return; }
      _detailId = merged.id;
      closeModal();
      toast('Fiches fusionnées', 'success');
      renderProspection(container);
    },
  });
}

// ── Import ───────────────────────────────────────────────────
function _openImportModal(container) {
  openModal({
    title: 'Importer une base marché',
    saveLabel: 'Analyser',
    bodyHTML: `
      <div class="form-group">
        <label class="form-label">Coller le contenu (CSV ou JSON)</label>
        <textarea class="form-textarea io-textarea" id="mi-text" placeholder="Nom;Ville;Secteur;Priorité&#10;Société Exemple;Lyon;Services;Haute"></textarea>
      </div>
      <div class="form-group">
        <label class="btn btn-secondary btn-sm" style="cursor:pointer">
          Charger un fichier…
          <input type="file" accept=".csv,.json,.txt" id="mi-file" style="display:none">
        </label>
        <span class="form-hint" id="mi-file-name" style="margin-left:8px"></span>
        <button class="btn btn-ghost btn-sm" id="mi-template" style="margin-left:8px">Télécharger un gabarit</button>
      </div>
      <div class="form-hint">
        Les colonnes sont reconnues automatiquement (français ou anglais).
        Toute colonne inconnue est conservée dans les champs personnalisés de la fiche.
      </div>`,
    onSave: () => {
      const raw = document.getElementById('mi-text').value;
      const parsed = parseMarketBase(raw);
      if (!parsed.companies.length) {
        toast(parsed.errors.length ? parsed.errors[0].reason : 'Rien à importer', 'error');
        return;
      }
      closeModal();
      _openImportPreview(parsed, container);
    },
  });

  setTimeout(() => {
    document.getElementById('mi-file')?.addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = ev => {
        document.getElementById('mi-text').value = ev.target.result;
        document.getElementById('mi-file-name').textContent = f.name;
      };
      reader.readAsText(f);
    });
    document.getElementById('mi-template')?.addEventListener('click', e => {
      e.preventDefault();
      downloadTemplate();
      toast('Gabarit téléchargé');
    });
  }, 0);
}

function _openImportPreview(parsed, container) {
  const recap = analyzeMarketImport(parsed);
  openModal({
    title: 'Récapitulatif de l\'import',
    saveLabel: 'Confirmer l\'import',
    bodyHTML: `
      <div class="io-summary">
        <span class="io-stat io-stat-new">${recap.created} créée${recap.created > 1 ? 's' : ''}</span>
        <span class="io-stat io-stat-upd">${recap.updated} mise${recap.updated > 1 ? 's' : ''} à jour</span>
        <span class="io-stat">${recap.contacts} contact${recap.contacts > 1 ? 's' : ''}</span>
        <span class="io-stat ${recap.unresolved.length ? 'io-stat-err' : ''}">${recap.unresolved.length} parent${recap.unresolved.length > 1 ? 's' : ''} non résolu${recap.unresolved.length > 1 ? 's' : ''}</span>
        <span class="io-stat ${recap.errors ? 'io-stat-err' : ''}">${recap.errors} ligne${recap.errors > 1 ? 's' : ''} en erreur</span>
      </div>
      <div class="form-hint" style="margin-bottom:14px">
        Les fiches existantes sont complétées, jamais écrasées : le statut que tu suis
        à la main et les interactions sont conservés.
      </div>
      ${parsed.unmapped.length ? `
        <div class="section-title">Colonnes non reconnues — conservées en champs personnalisés</div>
        <div class="io-preview">${parsed.unmapped.map(u => `<div class="io-prev-item">${_esc(u)}</div>`).join('')}</div>` : ''}
      ${parsed.errors.length ? `
        <div class="section-title" style="margin-top:12px">Lignes ignorées</div>
        <div class="io-errors">${parsed.errors.slice(0, 20).map(e => `<div class="io-error"><span class="io-error-line">L.${e.line}</span> ${_esc(e.reason)}</div>`).join('')}</div>` : ''}
      ${recap.unresolved.length ? `
        <div class="section-title" style="margin-top:12px">Rattachements non résolus</div>
        <div class="io-errors">${recap.unresolved.slice(0, 15).map(u => `<div class="io-error">${_esc(u)}</div>`).join('')}</div>` : ''}
      <div class="section-title" style="margin-top:12px">Aperçu</div>
      <div class="io-preview">
        ${parsed.companies.slice(0, 10).map(c => `<div class="io-prev-item">${_esc(c.name)}${c.city ? ' — ' + _esc(c.city) : ''}</div>`).join('')}
        ${parsed.companies.length > 10 ? `<div class="io-prev-more">… et ${parsed.companies.length - 10} de plus</div>` : ''}
      </div>`,
    onSave: () => {
      const res = applyMarketImport(parsed, { saveCompany, saveContact });
      closeModal();
      toast(`${res.created} créée(s) · ${res.updated} mise(s) à jour · ${res.contacts} contact(s)`, 'success');
      _tab = 'base'; _page = 1;
      renderProspection(container);
    },
  });
}

function _openFormatModal() {
  const rows = Object.entries(COLUMN_ALIASES)
    .map(([field, aliases]) => `
      <tr><td><code>${field}</code></td><td>${aliases.slice(0, 6).map(_esc).join(', ')}</td></tr>`).join('');

  openModal({
    title: 'Format d\'import',
    saveLabel: 'Télécharger un gabarit',
    bodyHTML: `
      <p class="form-hint" style="margin-bottom:14px">
        Un fichier <strong>CSV</strong> (séparateur <code>;</code>, <code>,</code> ou tabulation) ou
        <strong>JSON</strong>. Une ligne = une entreprise. Seule la colonne de nom est obligatoire.
      </p>
      <div class="section-title">Colonnes reconnues</div>
      <div class="io-preview" style="max-height:240px">
        <table class="crm-table" style="font-size:.8rem">
          <thead><tr><th>Champ</th><th>Libellés acceptés</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="section-title" style="margin-top:14px">Colonnes de contact</div>
      <p class="form-hint">
        <code>contact nominatif</code>, <code>rôle</code>, <code>email</code>,
        <code>téléphone</code>, <code>linkedin</code> — si renseignées, la personne est
        créée et rattachée à l'entreprise de la ligne.
      </p>
      <div class="section-title" style="margin-top:14px">Et le reste ?</div>
      <p class="form-hint">
        Toute colonne non reconnue est conservée telle quelle dans les
        <strong>champs personnalisés</strong> de la fiche, sous son libellé d'origine.
        Rien n'est perdu, quel que soit ton secteur.
      </p>`,
    onSave: () => { downloadTemplate(); closeModal(); toast('Gabarit téléchargé'); },
  });
}

function _esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
