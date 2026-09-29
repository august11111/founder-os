/* ============================================================
   FOUNDER OS — Interviews : liste + transcription / synthèse
   ============================================================ */

import {
  INTERVIEW_STATUSES, getInterviews, saveInterview, deleteInterview, getInterviewById,
  getContacts, getContactById,
  openModal, closeModal, confirmModal, starsHTML, fmtDate,
  toast, parseTagsInput, tagsToInput, renderMarkdown, escapeHTML as _esc,
} from './core.js';

const STATUS_COLORS = {
  'Planifiée': 'badge-q2',
  'Réalisée':  'badge-ea',
  'Analysée':  'badge-actif',
};

let _openId    = null;
let _tab       = 'transcription';   // 'transcription' | 'synthese'
let _filter    = 'Toutes';
let _editSynth = false;             // synthèse en mode édition
let _timer     = null;

export function renderInterviews(container) {
  if (_openId && !getInterviewById(_openId)) _openId = null;
  if (_openId) return _renderDetail(container);
  _renderList(container);
}

// ── Liste ────────────────────────────────────────────────────
function _renderList(container) {
  const all = getInterviews();
  const done     = all.filter(i => i.status === 'Réalisée').length;
  const analyzed = all.filter(i => i.status === 'Analysée').length;

  const rows = all
    .filter(i => _filter === 'Toutes' || i.status === _filter)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Interviews</div>
        <div class="page-subtitle">${all.length} au total · ${done} réalisée${done > 1 ? 's' : ''} · ${analyzed} analysée${analyzed > 1 ? 's' : ''}</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="add-interview-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nouvelle interview
        </button>
      </div>
    </div>

    <div class="filter-bar">
      <span style="font-size:.8rem;color:var(--text-3);font-weight:600">Statut :</span>
      ${['Toutes', ...INTERVIEW_STATUSES].map(s => `
        <button class="filter-chip ${_filter === s ? 'active' : ''}" data-fiv="${s}">${s}</button>
      `).join('')}
    </div>

    ${rows.length ? `
      <div class="card" style="padding:0;overflow:hidden">
        <table class="crm-table">
          <thead><tr>
            <th>Contact</th><th>Entreprise</th><th>Date</th>
            <th>Statut</th><th>Early Adopter</th><th>Contenu</th>
          </tr></thead>
          <tbody>${rows.map(_rowHTML).join('')}</tbody>
        </table>
      </div>`
    : `<div class="empty-state">
        <p>${all.length ? 'Aucune interview avec ce statut' : 'Aucune interview pour l\'instant'}</p>
        ${all.length ? '' : `<p style="margin-top:8px">Une interview se crée pour quelqu'un que tu vas réellement
          interviewer. Les personnes à contacter vivent dans le CRM et la prospection.</p>`}
      </div>`}
  `;

  _bindList(container);
}

function _rowHTML(iv) {
  const contact = getContactById(iv.contact_id);
  const hasT = (iv.transcription || '').trim().length > 0;
  const hasS = (iv.synthese || '').trim().length > 0;
  return `
    <tr data-iv="${iv.id}">
      <td><div class="contact-name">${_esc(contact ? contact.name : '—')}</div></td>
      <td>${contact && contact.company ? `<span class="company-cell">${_esc(contact.company)}</span>` : '<span style="color:var(--text-3)">—</span>'}</td>
      <td>${iv.date ? fmtDate(iv.date) : '<span style="color:var(--text-3)">à fixer</span>'}</td>
      <td><span class="badge ${STATUS_COLORS[iv.status] || 'badge-q3'}">${_esc(iv.status)}</span></td>
      <td>${iv.ea_score > 0 ? `<span class="stars">${starsHTML(iv.ea_score)}</span>` : '<span style="color:var(--text-3)">—</span>'}</td>
      <td>
        <span class="iv-dot ${hasT ? 'on' : ''}" title="Transcription">T</span>
        <span class="iv-dot ${hasS ? 'on' : ''}" title="Synthèse">S</span>
      </td>
    </tr>`;
}

function _bindList(container) {
  container.querySelectorAll('[data-fiv]').forEach(b =>
    b.addEventListener('click', () => { _filter = b.dataset.fiv; renderInterviews(container); }));
  container.querySelectorAll('tr[data-iv]').forEach(tr =>
    tr.addEventListener('click', () => { _openId = tr.dataset.iv; _tab = 'transcription'; _editSynth = false; renderInterviews(container); }));
  container.querySelector('#add-interview-btn').addEventListener('click', () => openInterviewModal(null, container));
}

// ── Détail : transcription et synthèse ───────────────────────
function _renderDetail(container) {
  const iv = getInterviewById(_openId);
  const contact = getContactById(iv.contact_id);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <button class="btn btn-ghost btn-sm" id="iv-back">← Interviews</button>
        <div class="page-title" style="margin-top:6px">${_esc(contact ? contact.name : 'Interview')}</div>
        <div class="page-subtitle">
          ${contact && contact.company ? _esc(contact.company) + ' · ' : ''}
          ${iv.date ? fmtDate(iv.date) : 'date à fixer'}
          <span class="badge ${STATUS_COLORS[iv.status] || 'badge-q3'}" style="margin-left:8px">${_esc(iv.status)}</span>
          <span id="iv-saved" class="dlv-saved"></span>
        </div>
      </div>
      <div class="page-actions">
        <select class="form-select crm-company-select" id="iv-quick-status">
          ${INTERVIEW_STATUSES.map(s => `<option value="${s}" ${iv.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <button class="btn btn-secondary btn-sm" id="iv-edit">Modifier</button>
        <button class="btn btn-danger btn-sm" id="iv-del">Supprimer</button>
      </div>
    </div>

    <div class="task-tabs">
      <button class="task-tab ${_tab === 'transcription' ? 'active' : ''}" data-ivtab="transcription">Transcription</button>
      <button class="task-tab ${_tab === 'synthese' ? 'active' : ''}" data-ivtab="synthese">Synthèse</button>
    </div>

    <div id="iv-body"></div>
  `;

  if (_tab === 'synthese') _renderSynthese(container, iv);
  else _renderTranscription(container, iv);

  _bindDetail(container, iv);
}

// Le brut : ce qui s'est dit, tel quel.
function _renderTranscription(container, iv) {
  container.querySelector('#iv-body').innerHTML = `
    <div class="card">
      <div class="iv-pane-head">
        <div class="card-title" style="margin:0">Transcription</div>
        <span class="form-hint" style="margin:0">Le brut : ce qui s'est dit, tes notes pendant l'entretien, ou un transcript collé.</span>
      </div>
      <textarea class="dlv-textarea" id="iv-transcription" spellcheck="false"
        placeholder="Colle ici le transcript, ou prends tes notes au fil de l'entretien…">${_esc(iv.transcription)}</textarea>
    </div>`;
}

// L'analysé : ce qu'on en retire.
function _renderSynthese(container, iv) {
  const synth = iv.synthese || '';
  const hasSynth = synth.trim().length > 0;

  container.querySelector('#iv-body').innerHTML = `
    <div class="card">
      <div class="card-title">Signaux</div>
      <div class="form-row">
        <div class="form-group" style="margin:0">
          <label class="form-label">Score Early Adopter</label>
          <div class="stars" id="iv-stars-inline" style="gap:10px;margin-top:6px;cursor:pointer;font-size:1.2rem">
            ${starsHTML(iv.ea_score, 5, true, 'ivi')}
          </div>
        </div>
        <div class="form-group" style="margin:0;display:flex;align-items:flex-end;padding-bottom:6px">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
            <input type="checkbox" id="iv-validated-inline" ${iv.hypothesis_validated ? 'checked' : ''} style="width:18px;height:18px">
            <span class="form-label" style="margin:0">✓ Hypothèse validée</span>
          </label>
        </div>
      </div>
      <div class="form-group" style="margin-top:14px">
        <label class="form-label">Pain points (séparés par des virgules)</label>
        <input class="form-input" id="iv-pains-inline" value="${_esc(tagsToInput(iv.pain_points))}" placeholder="Douleur 1, Douleur 2…">
        ${(iv.pain_points || []).length ? `<div class="iv-tags">${iv.pain_points.map(p => `<span class="pain-tag">${_esc(p)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="form-group" style="margin:0">
        <label class="form-label">Verbatims (un par ligne)</label>
        <textarea class="form-textarea" id="iv-verbatims-inline" rows="3" placeholder="Citation directe du prospect…">${_esc((iv.verbatims || []).join('\n'))}</textarea>
        ${(iv.verbatims || []).length ? (iv.verbatims || []).map(v => `<div class="verbatim-card">« ${_esc(v)} »</div>`).join('') : ''}
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="iv-pane-head">
        <div class="card-title" style="margin:0">Synthèse rédigée</div>
        <button class="btn btn-ghost btn-sm" id="iv-synth-toggle">${_editSynth ? 'Aperçu' : (hasSynth ? 'Éditer' : '+ Rédiger')}</button>
      </div>
      ${_editSynth ? `
        <textarea class="dlv-textarea" id="iv-synthese" spellcheck="false"
          placeholder="## Enseignements&#10;- …&#10;&#10;## Signaux forts&#10;- …&#10;&#10;## Ce que ça infirme&#10;- …">${_esc(synth)}</textarea>`
      : hasSynth
        ? `<div class="iv-recap-content">${renderMarkdown(synth)}</div>`
        : `<p class="iv-recap-empty">Pas encore de synthèse. Les enseignements, signaux forts ou faibles,
             ce que l'entretien confirme ou infirme.</p>`}
    </div>`;
}

function _bindDetail(container, iv) {
  const go = () => renderInterviews(container);
  const flag = () => {
    const el = container.querySelector('#iv-saved');
    if (!el) return;
    el.textContent = ' · enregistré';
    setTimeout(() => { if (el.isConnected) el.textContent = ''; }, 1200);
  };
  const patch = p => { saveInterview({ ...getInterviewById(_openId), ...p }); flag(); };

  container.querySelector('#iv-back').addEventListener('click', () => { _openId = null; go(); });
  container.querySelectorAll('[data-ivtab]').forEach(b =>
    b.addEventListener('click', () => { _tab = b.dataset.ivtab; _editSynth = false; go(); }));

  container.querySelector('#iv-quick-status').addEventListener('change', e => {
    patch({ status: e.target.value });
    go();
  });
  container.querySelector('#iv-edit').addEventListener('click', () => openInterviewModal(getInterviewById(_openId), container));
  container.querySelector('#iv-del').addEventListener('click', () => {
    confirmModal('Supprimer cette interview ?', () => {
      deleteInterview(_openId);
      _openId = null;
      toast('Interview supprimée');
      go();
    });
  });

  // Auto-save débounce, comme l'édition de sections ailleurs dans l'app
  const autosave = (el, field) => {
    if (!el) return;
    el.addEventListener('input', () => {
      clearTimeout(_timer);
      _timer = setTimeout(() => patch({ [field]: el.value }), 900);
    });
    el.addEventListener('blur', () => { clearTimeout(_timer); patch({ [field]: el.value }); });
  };

  autosave(container.querySelector('#iv-transcription'), 'transcription');
  autosave(container.querySelector('#iv-synthese'), 'synthese');

  const pains = container.querySelector('#iv-pains-inline');
  if (pains) {
    pains.addEventListener('blur', () => { patch({ pain_points: parseTagsInput(pains.value) }); go(); });
  }
  const verb = container.querySelector('#iv-verbatims-inline');
  if (verb) {
    verb.addEventListener('blur', () => {
      patch({ verbatims: verb.value.split('\n').map(s => s.trim()).filter(Boolean) });
      go();
    });
  }
  container.querySelector('#iv-validated-inline')?.addEventListener('change', e =>
    patch({ hypothesis_validated: e.target.checked }));

  container.querySelectorAll('#iv-stars-inline .star').forEach(star => {
    star.addEventListener('click', () => {
      patch({ ea_score: Number(star.dataset.star) });
      go();
    });
  });

  container.querySelector('#iv-synth-toggle')?.addEventListener('click', () => {
    // On enregistre avant de basculer, sinon la frappe en cours serait perdue
    const ta = container.querySelector('#iv-synthese');
    if (ta) { clearTimeout(_timer); patch({ synthese: ta.value }); }
    _editSynth = !_editSynth;
    go();
  });
}

// ── Modal : contact, statut, date ────────────────────────────
export function openInterviewModal(interview, container) {
  const isNew = !interview;
  const iv = interview || {
    id: null, contact_id: '', status: INTERVIEW_STATUSES[0], date: '',
    pain_points: [], hypothesis_validated: false, ea_score: 0,
    verbatims: [], transcription: '', synthese: '',
  };
  const contacts = getContacts();

  openModal({
    title: isNew ? 'Nouvelle interview' : `Interview — ${getContactById(iv.contact_id)?.name || ''}`,
    showDelete: !isNew,
    bodyHTML: `
      <div class="form-group">
        <label class="form-label">Contact *</label>
        <select class="form-select" id="iv-contact">
          <option value="">— Choisir —</option>
          ${contacts.map(c => `<option value="${c.id}" ${iv.contact_id === c.id ? 'selected' : ''}>${_esc(c.name)}${c.company ? ' · ' + _esc(c.company) : ''}</option>`).join('')}
        </select>
        ${contacts.length ? '' : '<div class="form-hint">Aucun contact au CRM — ajoute d\'abord la personne.</div>'}
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Statut</label>
          <select class="form-select" id="iv-status">
            ${INTERVIEW_STATUSES.map(s => `<option value="${s}" ${iv.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Date</label>
          <input class="form-input" id="iv-date" type="date" value="${iv.date || ''}">
        </div>
      </div>
      <div class="form-hint">
        La transcription et la synthèse se remplissent ensuite dans la fiche de l'interview.
      </div>`,
    onSave: () => {
      const contact_id = document.getElementById('iv-contact').value;
      if (!contact_id) { toast('Choisir un contact', 'error'); return; }
      const saved = saveInterview({
        ...iv,
        contact_id,
        status: document.getElementById('iv-status').value,
        date: document.getElementById('iv-date').value,
      });
      closeModal();
      toast(isNew ? 'Interview créée' : 'Interview mise à jour', 'success');
      // On enchaîne directement sur la fiche : créer une interview, c'est
      // vouloir la remplir.
      if (isNew) { _openId = saved.id; _tab = 'transcription'; _editSynth = false; }
      renderInterviews(container);
    },
    onDelete: () => {
      closeModal();
      confirmModal('Supprimer cette interview ?', () => {
        deleteInterview(iv.id);
        _openId = null;
        toast('Interview supprimée');
        renderInterviews(container);
      });
    },
  });
}
