/* ============================================================
   FOUNDER OS — Interviews : Kanban + recap panel + CRUD
   ============================================================ */

import {
  getInterviews, saveInterview, deleteInterview, getInterviewById,
  getContacts, getContactById, getIdeas,
  openModal, closeModal, confirmModal, starsHTML, fmtDate,
  toast, parseTagsInput, tagsToInput, uid
} from './core.js';

const STATUTS = ['À contacter', 'Confirmé', 'Réalisé', 'Analysé'];

const STATUS_COLORS = {
  'À contacter': 'badge-q3',
  'Confirmé':    'badge-q2',
  'Réalisé':     'badge-ea',
  'Analysé':     'badge-actif',
};

export function renderInterviews(container) {
  const interviews = getInterviews();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Interviews</div>
        <div class="page-subtitle">
          ${interviews.filter(i => i.status === 'Analysé').length} analysées
        </div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="add-interview-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nouvelle interview
        </button>
      </div>
    </div>

    <div class="iv-layout">
      <!-- Kanban -->
      <div class="kanban-board">
        ${STATUTS.map(status => {
          const cards = interviews.filter(i => i.status === status);
          return `
            <div class="kanban-column" data-status="${status}">
              <div class="kanban-col-header">
                <span class="kanban-col-title">${status}</span>
                <span class="kanban-col-count">${cards.length}</span>
              </div>
              ${cards.map(i => _kanbanCard(i)).join('')}
              <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:8px;justify-content:center" data-add-status="${status}">
                + Ajouter
              </button>
            </div>`;
        }).join('')}
      </div>

      <!-- Recap panel (hidden by default, filled on card click) -->
      <div class="iv-recap-panel" id="iv-recap-panel" style="display:none"></div>
    </div>
  `;

  _bindInterviews(container);
}

function _kanbanCard(interview) {
  const contact = getContactById(interview.contact_id);
  // pain_points et hypothesis_validated conservés dans le modèle, masqués de la carte
  // const painTags = (interview.pain_points || []).slice(0, 3)
  //   .map(p => `<span class="pain-tag">${p}</span>`).join('');

  return `
    <div class="kanban-card" data-id="${interview.id}">
      <div class="kanban-card-name">${contact ? contact.name : '—'}</div>
      <div class="kanban-card-date">
        ${interview.date ? fmtDate(interview.date) : 'Date à fixer'}
        ${contact ? ` · <span style="font-size:.72rem;color:var(--text-3)">${contact.company}</span>` : ''}
      </div>
      ${interview.ea_score > 0 ? `<div class="stars" style="margin-bottom:6px">${starsHTML(interview.ea_score)}</div>` : ''}
      <!-- pain tags masqués : <div class="kanban-card-tags">${(interview.pain_points||[]).slice(0,3).map(p=>`<span class="pain-tag">${p}</span>`).join('')}</div> -->
      <!-- hypothesis badge masqué : ${interview.hypothesis_validated ? '✓ Hypothèse validée' : ''} -->
    </div>`;
}

function _bindInterviews(container) {
  // Clic sur card → modale d'édition + recap panel en même temps
  container.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('click', () => {
      const interview = getInterviewById(card.dataset.id);
      if (interview) {
        openInterviewModal(interview, container);
        _openRecapPanel(interview, container);
      }
    });
  });

  // Bouton ajouter par colonne
  container.querySelectorAll('[data-add-status]').forEach(btn => {
    btn.addEventListener('click', () => {
      openInterviewModal(null, container, btn.dataset.addStatus);
    });
  });

  // Bouton principal
  container.querySelector('#add-interview-btn').addEventListener('click', () => {
    openInterviewModal(null, container);
  });
}

// ── Recap Panel ─────────────────────────────────────────────

function _openRecapPanel(interview, container) {
  const panel = container.querySelector('#iv-recap-panel');
  panel.style.display = '';
  _renderRecapView(interview, container, panel);
}

function _renderRecapView(interview, container, panel) {
  const contact = getContactById(interview.contact_id);
  const recap   = interview.recap || '';
  const hasRecap = recap.trim().length > 0;

  let renderedMarkdown;
  if (hasRecap) {
    renderedMarkdown = window.marked
      ? window.marked.parse(recap)
      : `<pre style="white-space:pre-wrap;font-size:.82rem">${recap}</pre>`;
  } else {
    renderedMarkdown = `<p class="iv-recap-empty">Aucun recap. Cliquez sur "Éditer" pour en ajouter un.</p>`;
  }

  panel.innerHTML = `
    <div class="iv-recap-header">
      <div>
        <div class="iv-recap-name">${contact ? contact.name : '—'}</div>
        <div class="iv-recap-meta">
          ${interview.date ? fmtDate(interview.date) : 'Date à fixer'}${contact?.company ? ` · ${contact.company}` : ''}
        </div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
        <button class="btn btn-ghost btn-sm" id="iv-panel-close" title="Fermer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:13px;height:13px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>

    <div class="iv-recap-section-title">Recap</div>

    <div class="iv-recap-view-mode">
      <div class="iv-recap-content">${renderedMarkdown}</div>
      <button class="btn btn-ghost btn-sm iv-recap-edit-btn" style="margin-top:10px">
        ${hasRecap ? 'Éditer le recap' : '+ Ajouter un recap'}
      </button>
    </div>

    <div class="iv-recap-edit-mode" style="display:none">
      <textarea class="iv-recap-textarea" id="iv-recap-textarea" placeholder="# Mon recap&#10;&#10;## Insights clés&#10;- Point 1&#10;- Point 2&#10;&#10;---&#10;&#10;**Citations importantes**">${recap}</textarea>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn btn-primary btn-sm iv-recap-save-btn">Enregistrer</button>
        <button class="btn btn-ghost btn-sm iv-recap-cancel-btn">Annuler</button>
      </div>
    </div>`;

  // Fermeture du panneau
  panel.querySelector('#iv-panel-close').addEventListener('click', () => {
    panel.style.display = 'none';
  });

  const viewMode = panel.querySelector('.iv-recap-view-mode');
  const editMode = panel.querySelector('.iv-recap-edit-mode');

  // Basculer en mode édition
  panel.querySelector('.iv-recap-edit-btn').addEventListener('click', () => {
    viewMode.style.display = 'none';
    editMode.style.display = '';
    panel.querySelector('#iv-recap-textarea').focus();
  });

  // Annuler l'édition
  panel.querySelector('.iv-recap-cancel-btn').addEventListener('click', () => {
    editMode.style.display = 'none';
    viewMode.style.display = '';
  });

  // Sauvegarder le recap
  panel.querySelector('.iv-recap-save-btn').addEventListener('click', () => {
    const newRecap = panel.querySelector('#iv-recap-textarea').value;
    const updated  = { ...interview, recap: newRecap };
    saveInterview(updated);
    toast('Recap sauvegardé', 'success');
    _renderRecapView(updated, container, panel);
  });
}

// ── Modal interview ──────────────────────────────────────────
export function openInterviewModal(interview, container, defaultStatus = 'À contacter') {
  const isNew = !interview;
  const iv = interview || {
    id: null, contact_id: '', status: defaultStatus, date: '',
    pain_points: [], hypothesis_validated: false, ea_score: 0,
    notes: '', verbatims: [], recap: ''
  };

  const contacts = getContacts();
  const ideas    = getIdeas();

  openModal({
    title: isNew ? 'Nouvelle interview' : `Interview — ${getContactById(iv.contact_id)?.name || ''}`,
    showDelete: !isNew,
    bodyHTML: `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Contact *</label>
          <select class="form-select" id="iv-contact">
            <option value="">— Choisir —</option>
            ${contacts.map(c => `<option value="${c.id}" ${iv.contact_id === c.id ? 'selected' : ''}>${c.name} · ${c.company}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Statut</label>
          <select class="form-select" id="iv-status">
            ${STATUTS.map(s => `<option value="${s}" ${iv.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Date</label>
          <input class="form-input" id="iv-date" type="date" value="${iv.date || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Score Early Adopter</label>
          <div class="stars" id="iv-stars" style="gap:10px;margin-top:6px;cursor:pointer;font-size:1.2rem">
            ${starsHTML(iv.ea_score, 5, true, 'iv')}
          </div>
          <input type="hidden" id="iv-ea-score" value="${iv.ea_score}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Pain points (séparés par virgules)</label>
        <input class="form-input" id="iv-pains" value="${tagsToInput(iv.pain_points)}" placeholder="Douleur 1, Douleur 2…">
      </div>
      <div class="form-group">
        <label class="form-label">Notes complètes</label>
        <textarea class="form-textarea" id="iv-notes" rows="5" placeholder="Résumé de l'interview, signaux forts/faibles…">${iv.notes || ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Verbatims (un par ligne)</label>
        <textarea class="form-textarea" id="iv-verbatims" rows="3" placeholder="Citation directe du prospect…">${(iv.verbatims || []).join('\n')}</textarea>
      </div>
      <div class="form-group" style="display:flex;align-items:center;gap:10px">
        <input type="checkbox" id="iv-validated" ${iv.hypothesis_validated ? 'checked' : ''} style="width:18px;height:18px">
        <label class="form-label" for="iv-validated" style="margin:0;cursor:pointer">✓ Hypothèse validée lors de cette interview</label>
      </div>`,
    onSave: () => {
      const contact_id = document.getElementById('iv-contact').value;
      if (!contact_id) { toast('Choisir un contact', 'error'); return; }
      saveInterview({
        ...iv,
        contact_id,
        status: document.getElementById('iv-status').value,
        date: document.getElementById('iv-date').value,
        ea_score: Number(document.getElementById('iv-ea-score').value) || 0,
        pain_points: parseTagsInput(document.getElementById('iv-pains').value),
        notes: document.getElementById('iv-notes').value.trim(),
        verbatims: document.getElementById('iv-verbatims').value.split('\n').map(s => s.trim()).filter(Boolean),
        hypothesis_validated: document.getElementById('iv-validated').checked,
      });
      closeModal();
      toast(isNew ? 'Interview créée' : 'Interview mise à jour', 'success');
      renderInterviews(container);
      // Re-ouvre le panneau sur l'interview mise à jour si ce n'est pas une création
      if (!isNew) {
        const updated = getInterviewById(iv.id);
        if (updated) _openRecapPanel(updated, container);
      }
    },
    onDelete: () => {
      closeModal();
      confirmModal('Supprimer cette interview ?', () => {
        deleteInterview(iv.id);
        toast('Interview supprimée');
        renderInterviews(container);
      });
    },
  });

  // Étoiles cliquables
  setTimeout(() => {
    document.querySelectorAll('#iv-stars .star').forEach(star => {
      star.addEventListener('click', () => {
        const val = Number(star.dataset.star);
        document.getElementById('iv-ea-score').value = val;
        document.querySelectorAll('#iv-stars .star').forEach((s, i) => {
          s.classList.toggle('filled', i < val);
        });
      });
    });
  }, 0);
}
