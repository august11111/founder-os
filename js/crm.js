/* ============================================================
   FOUNDER OS — CRM : tableau contacts + modal fiche + CRUD
   ============================================================ */

import {
  getContacts, saveContact, deleteContact, getContactById,
  getInterviews, getCompanies, normalizeText,
  openModal, closeModal, confirmModal, starsHTML,
  fmtDate, daysSince, toast, truncate, tagsToInput, parseTagsInput,
  uid, todayStr
} from './core.js';

const PAGE_SIZE = 25;

// Les contacts les plus précieux en premier, à égalité par ordre alphabétique
const byPertinence = (a, b) =>
  (b.pertinence || 0) - (a.pertinence || 0) || a.name.localeCompare(b.name, 'fr');

const INTERACTION_TYPES = [
  // LinkedIn
  { value: 'li_demande',     label: 'Demande de connexion envoyée', short: 'Demande LinkedIn', icon: '🔗', group: 'LinkedIn' },
  { value: 'li_accepte',     label: 'Connexion acceptée',           short: 'Connexion acceptée', icon: '✅', group: 'LinkedIn' },
  { value: 'li_msg_envoye',  label: 'Message LinkedIn envoyé',      short: 'Message envoyé',  icon: '📤', group: 'LinkedIn' },
  { value: 'li_msg_repondu', label: 'Message LinkedIn répondu',     short: 'Message répondu', icon: '📥', group: 'LinkedIn' },
  // Email
  { value: 'email_envoye',   label: 'Email envoyé',                 short: 'Email envoyé',    icon: '✉️', group: 'Email' },
  { value: 'email_repondu',  label: 'Email répondu',                short: 'Email répondu',   icon: '📬', group: 'Email' },
  // Appel / RDV
  { value: 'appel_passe',    label: 'Appel passé',                  short: 'Appel passé',     icon: '📞', group: 'Appel / RDV' },
  { value: 'rdv_fixe',       label: 'RDV fixé',                     short: 'RDV fixé',        icon: '📅', group: 'Appel / RDV' },
  { value: 'rdv_passe',      label: 'RDV passé',                    short: 'RDV passé',       icon: '🤝', group: 'Appel / RDV' },
  { value: 'rdv_annule',     label: 'RDV annulé',                   short: 'RDV annulé',      icon: '❌', group: 'Appel / RDV' },
  // Autre
  { value: 'relance',        label: 'Relancé',                      short: 'Relancé',         icon: '🔁', group: 'Autre' },
  { value: 'autre',          label: 'Autre',                        short: 'Autre',           icon: '·',  group: 'Autre' },
];

const INTERACTION_GROUPS = ['Tous', 'LinkedIn', 'Email', 'Appel / RDV', 'Autre', 'Aucune'];

let _filterInteraction = 'Tous';
let _filterCompany     = 'Toutes';
let _search            = '';
// État d'affichage pur : la page courante n'a pas à être persistée
let _page              = 1;
let _modalInteractions = [];

export function renderCRM(container) {
  const contacts  = getContacts();
  const companies = getCompanies();
  const filtered  = _applyFilters(contacts).sort(byPertinence);

  // La pagination s'applique après recherche et filtres
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (_page > pageCount) _page = pageCount;
  const start = (_page - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">CRM</div>
        <div class="page-subtitle">${contacts.length} contact${contacts.length > 1 ? 's' : ''}${companies.length ? ` · ${companies.length} entreprise${companies.length > 1 ? 's' : ''}` : ''}${filtered.length !== contacts.length ? ` · ${filtered.length} affiché${filtered.length > 1 ? 's' : ''}` : ''}</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="add-contact-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nouveau contact
        </button>
      </div>
    </div>

    <!-- Recherche -->
    <div class="crm-search">
      <svg class="crm-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input class="form-input crm-search-input" id="crm-search" value="${_esc(_search)}"
             placeholder="Rechercher un nom, une entreprise, un secteur, une note…" autocomplete="off">
      ${_search ? `<button class="crm-search-clear" id="crm-search-clear" title="Vider la recherche">×</button>` : ''}
    </div>

    <!-- Filtres -->
    <div class="filter-bar">
      <span style="font-size:.8rem;color:var(--text-3);font-weight:600">Interaction :</span>
      ${INTERACTION_GROUPS.map(g => `<button class="filter-chip ${_filterInteraction === g ? 'active' : ''}" data-fi="${g}">${g}</button>`).join('')}
    </div>
    <div class="filter-bar" style="margin-top:6px">
      <span style="font-size:.8rem;color:var(--text-3);font-weight:600">Entreprise :</span>
      <select class="form-select crm-company-select" id="crm-company">
        <option value="Toutes" ${_filterCompany === 'Toutes' ? 'selected' : ''}>Toutes les entreprises</option>
        ${companies.map(co => `
          <option value="${_esc(co.name)}" ${_filterCompany === co.name ? 'selected' : ''}>${_esc(co.name)} (${co.count})</option>
        `).join('')}
      </select>
    </div>

    <!-- Tableau -->
    <div class="card" style="padding:0;overflow:hidden">
      <table class="crm-table">
        <thead>
          <tr>
            <th>Nom</th>
            <th>Entreprise</th>
            <th>Pertinence</th>
            <th>Dernière interaction</th>
            <th>Dernier contact</th>
            <th>Secteur</th>
          </tr>
        </thead>
        <tbody>
          ${pageRows.length ? pageRows.map(c => _contactRow(c)).join('') : `
            <tr><td colspan="6">
              <div class="empty-state"><p>${_emptyMessage(contacts.length)}</p></div>
            </td></tr>`}
        </tbody>
      </table>
    </div>

    ${_paginationHTML(filtered.length, pageCount, start, pageRows.length)}
  `;

  _bindCRM(container);
}

function _emptyMessage(totalContacts) {
  if (!totalContacts) return 'Aucun contact — ajoute ton premier contact';
  if (_search) return `Aucun contact ne correspond à « ${_esc(_search)} »`;
  return 'Aucun contact pour ces filtres';
}

function _paginationHTML(total, pageCount, start, shown) {
  if (!total) return '';
  return `
    <div class="crm-pager">
      <span class="crm-pager-count">
        ${total} contact${total > 1 ? 's' : ''}${pageCount > 1 ? ` · ${start + 1}–${start + shown} affichés` : ''}
      </span>
      ${pageCount > 1 ? `
        <div class="crm-pager-nav">
          <button class="btn btn-secondary btn-sm" id="pg-prev" ${_page === 1 ? 'disabled' : ''}>‹ Précédent</button>
          <span class="crm-pager-pos">Page ${_page} / ${pageCount}</span>
          <button class="btn btn-secondary btn-sm" id="pg-next" ${_page === pageCount ? 'disabled' : ''}>Suivant ›</button>
        </div>` : ''}
    </div>`;
}

function _esc(str) {
  return (str || '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _getLastInteraction(c) {
  const interactions = c.interactions || [];
  if (!interactions.length) return null;
  return [...interactions].sort((a, b) => b.date.localeCompare(a.date))[0];
}

function _getNextFollowup(c) {
  const interactions = c.interactions || [];
  if (!interactions.length) return null;
  const sorted = [...interactions].sort((a, b) => b.date.localeCompare(a.date));
  for (const inter of sorted) {
    if (inter.next_followup) return inter.next_followup;
  }
  return null;
}

function _interactionTypeInfo(type) {
  return INTERACTION_TYPES.find(t => t.value === type) || { label: type, short: type, icon: '·', group: 'Autre' };
}

function _timelineHTML(interactions) {
  if (!interactions.length) {
    return `<div style="font-size:.82rem;color:var(--text-3);padding:6px 0">Aucune interaction enregistrée</div>`;
  }
  const today = todayStr();
  const sorted = [...interactions].sort((a, b) => b.date.localeCompare(a.date));
  return `<div class="interaction-timeline">${sorted.map(inter => {
    const info = _interactionTypeInfo(inter.type);
    const overdue = inter.next_followup && inter.next_followup < today;
    return `
      <div class="interaction-item">
        <div class="interaction-icon">${info.icon}</div>
        <div class="interaction-content">
          <div class="interaction-header">
            <span class="interaction-type">${info.label}</span>
            <span class="interaction-date">${fmtDate(inter.date)}</span>
            <button class="interaction-delete" data-del-id="${inter.id}" title="Supprimer">×</button>
          </div>
          ${inter.note ? `<div class="interaction-note">${inter.note}</div>` : ''}
          ${inter.next_followup ? `<div class="interaction-followup${overdue ? ' overdue' : ''}">Relancer le : <strong>${fmtDate(inter.next_followup)}</strong>${overdue ? ' · En retard' : ''}</div>` : ''}
        </div>
      </div>`;
  }).join('')}</div>`;
}

function _contactRow(c) {
  const late         = daysSince(c.last_contact) > 14;
  const lastInter    = _getLastInteraction(c);
  const nextFollowup = _getNextFollowup(c);
  const today        = todayStr();

  let interCell = '<span style="color:var(--text-3);font-size:.82rem">—</span>';
  if (lastInter) {
    const info    = _interactionTypeInfo(lastInter.type);
    const ago     = daysSince(lastInter.date);
    const agoStr  = ago === 0 ? "aujourd'hui" : ago === 1 ? 'hier' : `${ago}j`;
    let followupLine = '';
    if (nextFollowup) {
      const overdue = nextFollowup < today;
      followupLine = `<div class="followup-badge ${overdue ? 'overdue' : 'upcoming'}" style="margin:3px 0 0;display:inline-flex">${overdue ? '⚠ Relance due' : '→ ' + fmtDate(nextFollowup)}</div>`;
    }
    interCell = `
      <div class="inter-last-label">${info.icon} ${info.short}</div>
      <div class="inter-last-meta">${fmtDate(lastInter.date)} · ${agoStr}</div>
      ${followupLine}`;
  }

  return `
    <tr data-id="${c.id}">
      <td><div class="contact-name">${_esc(c.name)}</div></td>
      <td>${c.company
        ? `<span class="company-cell">${_esc(c.company)}</span>`
        : '<span style="color:var(--text-3)">—</span>'}</td>
      <td><span class="stars" title="Pertinence ${c.pertinence || 0}/5">${starsHTML(c.pertinence || 0)}</span></td>
      <td>${interCell}</td>
      <td>
        ${fmtDate(c.last_contact)}
        ${late ? `<span class="late-badge" title="Contact il y a ${daysSince(c.last_contact)} jours">⚠ ${daysSince(c.last_contact)}j</span>` : ''}
      </td>
      <td><span class="sector-tag">${_esc(c.secteur) || '—'}</span></td>
    </tr>`;
}

function _applyFilters(contacts) {
  const q = normalizeText(_search);
  return contacts.filter(c => {
    // Recherche : nom, entreprise, secteur, notes
    if (q) {
      const haystack = normalizeText([c.name, c.company, c.secteur, c.notes].filter(Boolean).join(' '));
      if (!haystack.includes(q)) return false;
    }
    if (_filterCompany !== 'Toutes' && normalizeText(c.company) !== normalizeText(_filterCompany)) return false;
    if (_filterInteraction !== 'Tous') {
      const last = _getLastInteraction(c);
      if (_filterInteraction === 'Aucune') {
        if (last) return false;
      } else {
        if (!last) return false;
        const info = _interactionTypeInfo(last.type);
        if (info.group !== _filterInteraction) return false;
      }
    }
    return true;
  });
}

function _bindCRM(container) {
  // Tout changement de filtre, de recherche ou de tri ramène à la page 1 :
  // sinon on reste bloqué sur une page devenue vide.
  const reset = () => { _page = 1; renderCRM(container); };

  container.querySelectorAll('[data-fi]').forEach(btn => {
    btn.addEventListener('click', () => { _filterInteraction = btn.dataset.fi; reset(); });
  });
  container.querySelector('#crm-company')?.addEventListener('change', e => {
    _filterCompany = e.target.value; reset();
  });

  // Recherche au fil de la frappe, sans perdre le focus ni le curseur
  const searchInput = container.querySelector('#crm-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      _search = searchInput.value;
      _page = 1;
      renderCRM(container);
      const again = container.querySelector('#crm-search');
      again.focus();
      again.setSelectionRange(again.value.length, again.value.length);
    });
  }
  container.querySelector('#crm-search-clear')?.addEventListener('click', () => {
    _search = ''; reset();
    container.querySelector('#crm-search')?.focus();
  });

  container.querySelector('#pg-prev')?.addEventListener('click', () => {
    if (_page > 1) { _page--; renderCRM(container); }
  });
  container.querySelector('#pg-next')?.addEventListener('click', () => {
    _page++; renderCRM(container);
  });

  // Clic sur ligne → fiche
  container.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', () => {
      const c = getContactById(row.dataset.id);
      if (c) openContactModal(c, container);
    });
  });

  // Nouveau contact
  container.querySelector('#add-contact-btn').addEventListener('click', () => {
    openContactModal(null, container);
  });
}

// ── Modal fiche contact ──────────────────────────────────────
export function openContactModal(contact, container) {
  const isNew = !contact;
  const c = contact || {
    id: null, name: '', company: '',
    last_contact: todayStr(), pertinence: 3, secteur: '', notes: '',
    interactions: [], email: '', phone: '', linkedin: ''
  };
  _modalInteractions = [...(c.interactions || [])];

  // Interviews liées
  const interviews = !isNew ? getInterviews().filter(i => i.contact_id === c.id) : [];
  const companies = getCompanies();

  const linkedInterviewsHTML = interviews.length
    ? interviews.map(i => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
          <span class="badge badge-q3" style="font-size:.7rem">${i.status}</span>
          <span style="font-size:.85rem">${fmtDate(i.date)}</span>
          <span style="font-size:.8rem;color:var(--text-3)">${i.ea_score > 0 ? starsHTML(i.ea_score) : ''}</span>
        </div>`).join('')
    : `<div class="text-muted text-sm">Aucune interview liée</div>`;

  openModal({
    title: isNew ? 'Nouveau contact' : c.name,
    showDelete: !isNew,
    bodyHTML: `
      <div class="form-group">
        <label class="form-label">Nom *</label>
        <input class="form-input" id="c-name" value="${_esc(c.name)}" placeholder="Prénom Nom">
      </div>
      <div class="form-group">
        <label class="form-label">Entreprise</label>
        <input class="form-input c-company-input" id="c-company" list="company-list"
               value="${_esc(c.company)}" placeholder="Nom de l'entreprise" autocomplete="off">
        <datalist id="company-list">
          ${companies.map(co => `<option value="${_esc(co.name)}">${co.count} contact${co.count > 1 ? 's' : ''}</option>`).join('')}
        </datalist>
        <div class="form-hint">Choisis une entreprise existante ou saisis-en une nouvelle.</div>
      </div>

      <div class="section-title" style="margin-bottom:10px">Coordonnées</div>
      <div class="form-group">
        <label class="form-label">LinkedIn</label>
        <div class="input-with-action">
          <input class="form-input" id="c-linkedin" value="${c.linkedin || ''}" placeholder="https://linkedin.com/in/prenom-nom">
          <button class="btn-open-url" id="c-linkedin-open" type="button" title="Ouvrir le profil" ${!c.linkedin ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </button>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-input" id="c-email" value="${c.email || ''}" placeholder="prenom@exemple.com">
        </div>
        <div class="form-group">
          <label class="form-label">Téléphone</label>
          <input class="form-input" id="c-phone" value="${c.phone || ''}" placeholder="+33 6 00 00 00 00">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Dernier contact</label>
          <input class="form-input" id="c-last" type="date" value="${c.last_contact || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Secteur d'activité</label>
          <input class="form-input" id="c-secteur" value="${_esc(c.secteur)}" placeholder="ex: Location de matériel, Festival, Salle…">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Pertinence (1–5)</label>
        <div class="stars" id="c-stars" style="gap:8px;margin-top:6px;cursor:pointer">
          ${starsHTML(c.pertinence, 5, true, 'c')}
        </div>
        <input type="hidden" id="c-pertinence" value="${c.pertinence}">
        <div class="form-hint">À quel point ce contact est précieux pour le projet.</div>
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <textarea class="form-textarea" id="c-notes" rows="4" placeholder="Contexte, signaux d'intérêt, points importants…">${_esc(c.notes)}</textarea>
      </div>

      <div class="divider"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div class="section-title" style="margin:0">Suivi des interactions</div>
        <button class="btn btn-secondary btn-sm" id="add-inter-btn" type="button">+ Ajouter</button>
      </div>
      <div id="inter-timeline">${_timelineHTML(_modalInteractions)}</div>
      <div id="add-inter-form" style="display:none">
        <div class="add-interaction-form">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Type</label>
              <select class="form-select" id="inter-type">
                ${(() => {
                  const groups = [...new Set(INTERACTION_TYPES.map(t => t.group))];
                  return groups.map(g => `
                    <optgroup label="${g}">
                      ${INTERACTION_TYPES.filter(t => t.group === g).map(t => `<option value="${t.value}">${t.icon} ${t.label}</option>`).join('')}
                    </optgroup>`).join('');
                })()}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Date</label>
              <input class="form-input" id="inter-date" type="date" value="${todayStr()}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Note (optionnel)</label>
            <input class="form-input" id="inter-note" placeholder="ex : a répondu positivement, relancer dans 1 semaine…">
          </div>
          <div class="form-group">
            <label class="form-label">Prochain suivi (optionnel)</label>
            <input class="form-input" id="inter-followup" type="date">
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-secondary btn-sm" id="inter-cancel-btn" type="button">Annuler</button>
            <button class="btn btn-primary btn-sm" id="inter-save-btn" type="button">Ajouter</button>
          </div>
        </div>
      </div>

      ${!isNew ? `
        <div class="divider"></div>
        <div class="section-title">Interviews liées</div>
        ${linkedInterviewsHTML}
      ` : ''}`,
    onSave: () => {
      const name = document.getElementById('c-name').value.trim();
      if (!name) { toast('Le nom est requis', 'error'); return; }
      saveContact({
        ...c,
        name,
        company: document.getElementById('c-company').value.trim(),
        last_contact: document.getElementById('c-last').value,
        pertinence: Number(document.getElementById('c-pertinence').value) || 3,
        secteur: document.getElementById('c-secteur').value.trim(),
        notes: document.getElementById('c-notes').value.trim(),
        interactions: _modalInteractions,
        linkedin: document.getElementById('c-linkedin').value.trim(),
        email: document.getElementById('c-email').value.trim(),
        phone: document.getElementById('c-phone').value.trim(),
      });
      closeModal();
      toast(isNew ? 'Contact ajouté' : 'Contact mis à jour', 'success');
      renderCRM(container);
    },
    onDelete: () => {
      closeModal();
      confirmModal(`Supprimer ${c.name} ?`, () => {
        deleteContact(c.id);
        toast('Contact supprimé');
        renderCRM(container);
      });
    },
  });

  // Étoiles cliquables + interactions
  setTimeout(() => {
    document.querySelectorAll('#c-stars .star').forEach(star => {
      star.addEventListener('click', () => {
        const val = Number(star.dataset.star);
        document.getElementById('c-pertinence').value = val;
        document.querySelectorAll('#c-stars .star').forEach((s, i) => {
          s.classList.toggle('filled', i < val);
        });
      });
    });

    _bindInteractionSection();

    const liInput = document.getElementById('c-linkedin');
    const liBtn   = document.getElementById('c-linkedin-open');
    if (liInput && liBtn) {
      liInput.addEventListener('input', () => {
        liBtn.disabled = !liInput.value.trim();
      });
      liBtn.addEventListener('click', () => {
        const url = liInput.value.trim();
        if (url) window.open(url, '_blank', 'noopener');
      });
    }
  }, 0);
}

function _bindInteractionSection() {
  const addBtn     = document.getElementById('add-inter-btn');
  const form       = document.getElementById('add-inter-form');
  const saveBtn    = document.getElementById('inter-save-btn');
  const cancelBtn  = document.getElementById('inter-cancel-btn');
  const timeline   = document.getElementById('inter-timeline');
  if (!addBtn || !form || !timeline) return;

  const refreshTimeline = () => {
    timeline.innerHTML = _timelineHTML(_modalInteractions);
    timeline.querySelectorAll('.interaction-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        _modalInteractions = _modalInteractions.filter(i => i.id !== btn.dataset.delId);
        refreshTimeline();
      });
    });
  };

  refreshTimeline();

  addBtn.addEventListener('click', () => {
    form.style.display = 'block';
    addBtn.style.display = 'none';
  });

  cancelBtn.addEventListener('click', () => {
    form.style.display = 'none';
    addBtn.style.display = '';
  });

  saveBtn.addEventListener('click', () => {
    const type  = document.getElementById('inter-type').value;
    const date  = document.getElementById('inter-date').value;
    const note  = document.getElementById('inter-note').value.trim();
    const next  = document.getElementById('inter-followup').value;
    if (!date) { toast('La date est requise', 'error'); return; }
    // Loguer une interaction honore les relances en attente : on vient de faire
    // l'action. Seul le `next_followup` est effacé — types et dates de
    // l'historique restent intacts. Résultat : au plus une relance active,
    // portée par la dernière interaction.
    const consumed = _modalInteractions.filter(i => i.next_followup).length;
    _modalInteractions = _modalInteractions.map(i =>
      i.next_followup ? { ...i, next_followup: null } : i
    );
    _modalInteractions.push({ id: uid('ia'), type, date, note, next_followup: next || null });
    if (consumed) toast(`Relance en attente marquée comme honorée`);
    form.style.display = 'none';
    addBtn.style.display = '';
    document.getElementById('inter-note').value = '';
    document.getElementById('inter-followup').value = '';
    document.getElementById('inter-date').value = todayStr();
    refreshTimeline();
  });
}
