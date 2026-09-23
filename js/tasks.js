/* ============================================================
   FOUNDER OS — Tâches : liste + matrice Eisenhower + CRUD
   ============================================================ */

import {
  getTasks, saveTask, deleteTask, getTaskById, setTaskDone,
  getOneShotTasks, getRecurringTasks, isRecurring, isDueOn, isDoneOn,
  toggleTaskDay, getStreak, getRecentDays,
  getRoadmapItemById, getDimension,
  getEventByTaskId, saveCalendarEvent, deleteCalendarEvent,
  openModal, closeModal, confirmModal, badgeQuadrant, fmtDate, toast, uid, todayStr
} from './core.js';

const QUADRANTS = ['Q1', 'Q2', 'Q3', 'Q4'];
const QUADRANT_LABELS = {
  Q1: { label: 'Urgent + Important', desc: 'À faire maintenant', cls: 'q1-header e-q1' },
  Q2: { label: 'Important, pas urgent', desc: 'Planifier', cls: 'q2-header e-q2' },
  Q3: { label: 'Urgent, pas important', desc: 'Déléguer', cls: 'q3-header e-q3' },
  Q4: { label: 'Ni urgent ni important', desc: 'Éliminer', cls: 'q4-header e-q4' },
};

const CAT_COLORS = {
  'Interview': '#1D9E75', 'Deep work': '#378ADD', 'RDV': '#9B59B6',
  'Perso': '#F39C12', 'Travail': '#1A1A1A', 'Revue': '#E74C3C', 'Autre': '#95A5A6',
};
const CAT_LIST = Object.keys(CAT_COLORS);

const WEEKDAYS = [
  { n: 1, label: 'L' }, { n: 2, label: 'M' }, { n: 3, label: 'M' }, { n: 4, label: 'J' },
  { n: 5, label: 'V' }, { n: 6, label: 'S' }, { n: 0, label: 'D' },
];

let _filterQuadrant = 'Tous';
let _filterDone = 'Tous';
let _filterQuickWin = false;
// Les récurrentes ont leur propre onglet : elles ne polluent pas la matrice Eisenhower
let _mode = 'oneshot';

export function renderTasks(container) {
  const oneShot   = getOneShotTasks();
  const recurring = getRecurringTasks();
  const dueToday  = recurring.filter(t => isDueOn(t));

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Tâches</div>
        <div class="page-subtitle">${oneShot.filter(t => !t.done).length} en cours · ${oneShot.filter(t => t.done).length} terminées · ${recurring.length} récurrente${recurring.length > 1 ? 's' : ''}</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="add-task-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nouvelle tâche
        </button>
      </div>
    </div>

    <div class="task-tabs">
      <button class="task-tab ${_mode === 'oneshot' ? 'active' : ''}" data-mode="oneshot">Ponctuelles <span class="task-tab-count">${oneShot.filter(t => !t.done).length}</span></button>
      <button class="task-tab ${_mode === 'recurring' ? 'active' : ''}" data-mode="recurring">Récurrentes <span class="task-tab-count">${dueToday.filter(t => isDoneOn(t)).length}/${dueToday.length}</span></button>
    </div>

    <div id="tasks-body"></div>
  `;

  if (_mode === 'recurring') _renderRecurring(container, recurring);
  else _renderOneShot(container, oneShot);

  _bindTabs(container);
}

// ── Onglet « Ponctuelles » : matrice Eisenhower ──────────────
function _renderOneShot(container, tasks) {
  container.querySelector('#tasks-body').innerHTML = `
    <div class="eisenhower-grid">
      ${QUADRANTS.map(q => {
        const count = tasks.filter(t => t.quadrant === q).length;
        const done  = tasks.filter(t => t.quadrant === q && t.done).length;
        return `
          <div class="eisenhower-cell e-${q.toLowerCase()} filter-q" data-q="${q}" style="cursor:pointer" title="Filtrer ${q}">
            <div class="cell-label">${q} — ${QUADRANT_LABELS[q].label}</div>
            <div class="cell-count">${count - done}<span style="font-size:1rem;opacity:.5">/${count}</span></div>
            <div class="cell-desc">${QUADRANT_LABELS[q].desc}</div>
          </div>`;
      }).join('')}
    </div>

    <div class="filter-bar">
      <span style="font-size:.8rem;color:var(--text-3);font-weight:600">Quadrant :</span>
      ${['Tous', ...QUADRANTS].map(q => `
        <button class="filter-chip ${_filterQuadrant === q ? 'active' : ''}" data-fq="${q}">${q === 'Tous' ? 'Tous' : q}</button>
      `).join('')}
      <div class="filter-sep"></div>
      <span style="font-size:.8rem;color:var(--text-3);font-weight:600">Statut :</span>
      ${['Tous', 'En cours', 'Terminé'].map(s => `
        <button class="filter-chip ${_filterDone === s ? 'active' : ''}" data-fd="${s}">${s}</button>
      `).join('')}
      <div class="filter-sep"></div>
      <button class="filter-chip ${_filterQuickWin ? 'active' : ''}" data-fqw="1">⚡ Quick win</button>
    </div>

    <div id="tasks-list"></div>
  `;

  _renderList(container, tasks);
  _bindTasks(container);
}

// ── Onglet « Récurrentes » : objectifs quotidiens ────────────
function _renderRecurring(container, tasks) {
  const body = container.querySelector('#tasks-body');

  if (!tasks.length) {
    body.innerHTML = `<div class="empty-state">
      <p>Aucune tâche récurrente — crée tes propres objectifs quotidiens</p>
      <button class="btn btn-primary" id="add-rec-empty">Créer un objectif quotidien</button>
    </div>`;
    body.querySelector('#add-rec-empty').addEventListener('click', () => openTaskModal(null, container, true));
    return;
  }

  const due  = tasks.filter(t => isDueOn(t));
  const rest = tasks.filter(t => !isDueOn(t));

  body.innerHTML = `
    ${due.length ? `
      <div class="quadrant-section">
        <div class="quadrant-header q2-header">
          <span>Aujourd'hui</span>
          <span style="margin-left:auto;font-size:.8rem;opacity:.7">${due.filter(t => isDoneOn(t)).length}/${due.length}</span>
        </div>
        ${due.map(_recurringHTML).join('')}
      </div>` : ''}
    ${rest.length ? `
      <div class="quadrant-section">
        <div class="quadrant-header q3-header"><span>Pas prévu aujourd'hui</span></div>
        ${rest.map(_recurringHTML).join('')}
      </div>` : ''}
  `;

  _bindRecurring(container);
}

function _recurringHTML(t) {
  const due    = isDueOn(t);
  const done   = isDoneOn(t);
  const streak = getStreak(t);
  const rhythm = t.recurrence === 'daily'
    ? 'Quotidien'
    : `Hebdo · ${(t.weekdays || []).map(n => (WEEKDAYS.find(w => w.n === n) || {}).label).join('')}`;

  return `
    <div class="rec-item ${done ? 'rec-done' : ''} ${due ? '' : 'rec-off'}" data-id="${t.id}">
      <div class="task-check ${done ? 'checked' : ''} ${due ? '' : 'rec-check-off'}" data-recheck="${t.id}">
        ${done ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
      </div>
      <div class="rec-body">
        <div class="rec-title">${t.title}</div>
        <div class="rec-sub">${rhythm}${streak > 0 ? ` · 🔥 ${streak} jour${streak > 1 ? 's' : ''}` : ''}</div>
      </div>
      <div class="rec-week" title="7 derniers jours">
        ${getRecentDays(t).map(d => `
          <span class="rec-day ${!d.due ? 'rec-day-off' : d.done ? 'rec-day-done' : 'rec-day-missed'}" title="${d.date}"></span>
        `).join('')}
      </div>
    </div>`;
}

function _bindTabs(container) {
  container.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => { _mode = btn.dataset.mode; renderTasks(container); });
  });
  container.querySelector('#add-task-btn').addEventListener('click', () => {
    openTaskModal(null, container, _mode === 'recurring');
  });
}

function _bindRecurring(container) {
  container.querySelectorAll('[data-recheck]').forEach(box => {
    box.addEventListener('click', e => {
      e.stopPropagation();
      toggleTaskDay(box.dataset.recheck);
      renderTasks(container);
    });
  });
  container.querySelectorAll('.rec-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('[data-recheck]')) return;
      const task = getTaskById(item.dataset.id);
      if (task) openTaskModal(task, container);
    });
  });
}

function _renderList(container, tasks) {
  const list = container.querySelector('#tasks-list');
  const filtered = _applyFilters(tasks);

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
      </svg>
      <p>Aucune tâche pour ces filtres</p>
    </div>`;
    return;
  }

  const grouped = {};
  QUADRANTS.forEach(q => { grouped[q] = filtered.filter(t => t.quadrant === q); });

  list.innerHTML = QUADRANTS.map(q => {
    if (!grouped[q].length) return '';
    return `
      <div class="quadrant-section">
        <div class="quadrant-header ${QUADRANT_LABELS[q].cls.split(' ')[0]}">
          <span>${q}</span>
          <span style="font-weight:400;font-size:.82rem">${QUADRANT_LABELS[q].label}</span>
          <span style="margin-left:auto;font-size:.8rem;opacity:.7">${grouped[q].filter(t => !t.done).length}/${grouped[q].length}</span>
        </div>
        ${grouped[q].map(t => _taskHTML(t)).join('')}
      </div>`;
  }).join('');
}

function _taskHTML(t) {
  const calEvent = getEventByTaskId(t.id);
  return `
    <div class="task-item ${t.done ? 'done' : ''}" data-id="${t.id}">
      <div class="task-check ${t.done ? 'checked' : ''}" data-check="${t.id}">
        ${t.done ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
      </div>
      <span class="task-title">${t.title}</span>
      <div class="task-meta">
        ${_subgoalBadge(t)}
        ${calEvent ? `<span class="task-cal-pill" title="Planifié le ${fmtDate(calEvent.date)} à ${calEvent.start_time}" style="background:${calEvent.color}20;color:${calEvent.color};font-size:.72rem;padding:2px 7px;border-radius:20px;font-weight:600">📅 ${calEvent.start_time}</span>` : ''}
        ${t.quickwin ? '<span title="Quick win — faisable en moins de 15 min">⚡</span>' : ''}
        ${badgeQuadrant(t.quadrant)}
      </div>
    </div>`;
}

// Indique d'où vient une tâche issue de la roadmap, sans avoir à y naviguer
function _subgoalBadge(t) {
  if (!t.linked_subgoal_id) return '';
  const sub = getRoadmapItemById(t.linked_subgoal_id);
  if (!sub) return '';
  const parent = getRoadmapItemById(sub.parent_id);
  const dim = getDimension(sub.category);
  const tip = parent ? `Sous-objectif de « ${parent.title} » · ${dim.label}` : 'Issu de la roadmap';
  return `<span class="task-link-pill" title="${tip.replace(/"/g, '&quot;')}" style="color:${dim.color};background:${dim.color}1a">🎯</span>`;
}

function _applyFilters(tasks) {
  return tasks.filter(t => {
    if (_filterQuadrant !== 'Tous' && t.quadrant !== _filterQuadrant) return false;
    if (_filterDone === 'En cours' && t.done) return false;
    if (_filterDone === 'Terminé' && !t.done) return false;
    if (_filterQuickWin && !t.quickwin) return false;
    return true;
  });
}

function _bindTasks(container) {
  container.querySelectorAll('.filter-q').forEach(cell => {
    cell.addEventListener('click', () => {
      _filterQuadrant = _filterQuadrant === cell.dataset.q ? 'Tous' : cell.dataset.q;
      renderTasks(container);
    });
  });
  container.querySelectorAll('[data-fq]').forEach(btn => {
    btn.addEventListener('click', () => { _filterQuadrant = btn.dataset.fq; renderTasks(container); });
  });
  container.querySelectorAll('[data-fd]').forEach(btn => {
    btn.addEventListener('click', () => { _filterDone = btn.dataset.fd; renderTasks(container); });
  });
  container.querySelectorAll('[data-fqw]').forEach(btn => {
    btn.addEventListener('click', () => { _filterQuickWin = !_filterQuickWin; renderTasks(container); });
  });

  container.querySelectorAll('[data-check]').forEach(check => {
    check.addEventListener('click', e => {
      e.stopPropagation();
      const task = getTaskById(check.dataset.check);
      if (!task) return;
      // Passe par le core : une tâche liée valide aussi son sous-objectif
      setTaskDone(task.id, !task.done);
      renderTasks(container);
    });
  });

  container.querySelectorAll('.task-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('[data-check]')) return;
      const task = getTaskById(item.dataset.id);
      if (task) openTaskModal(task, container);
    });
  });
}

// ── Helpers formulaire calendrier ────────────────────────────
function _calFormFields(date, start, end, cat) {
  return `
    <div class="form-row" style="margin-top:12px">
      <div class="form-group">
        <label class="form-label">Date</label>
        <input class="form-input" id="cal-date" type="date" value="${date}">
      </div>
      <div class="form-group">
        <label class="form-label">Catégorie</label>
        <select class="form-select" id="cal-cat">
          ${CAT_LIST.map(c => `<option value="${c}" ${cat === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Heure début</label>
        <input class="form-input" id="cal-start" type="time" value="${start}">
      </div>
      <div class="form-group">
        <label class="form-label">Heure fin</label>
        <input class="form-input" id="cal-end" type="time" value="${end}">
      </div>
    </div>`;
}

// ── Modal CRUD ───────────────────────────────────────────────
export function openTaskModal(task, container, presetRecurring = false) {
  const isNew = !task;
  const t = task || {
    id: null, title: '', quadrant: 'Q2', done: false,
    recurrence: presetRecurring ? 'daily' : 'none', weekdays: [1, 2, 3, 4, 5], completions: [],
    quickwin: false, linked_subgoal_id: null,
  };
  const existingEvent = t.id ? getEventByTaskId(t.id) : null;
  const today = todayStr();
  const recurrent = isRecurring(t);

  // Section calendrier selon l'état
  const calSection = existingEvent ? `
    <div class="divider"></div>
    <div class="section-title" style="margin-bottom:10px">📅 Planification</div>
    <div id="cal-section">
      <div id="cal-existing-info" style="background:var(--bg-2);border-radius:6px;padding:10px 14px;display:flex;align-items:center;gap:10px">
        <span style="width:10px;height:10px;border-radius:50%;background:${existingEvent.color};flex-shrink:0"></span>
        <span style="font-size:.88rem;font-weight:600">${fmtDate(existingEvent.date)}</span>
        <span style="font-size:.82rem;color:var(--text-3)">${existingEvent.start_time} – ${existingEvent.end_time}</span>
        <span class="badge badge-q3" style="font-size:.68rem;margin-left:auto">${existingEvent.category}</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-secondary btn-sm" id="cal-modify-btn">Modifier</button>
        <button class="btn btn-ghost btn-sm" id="cal-remove-btn" style="color:var(--q1)">Retirer du calendrier</button>
      </div>
      <div id="cal-edit-form" class="hidden">
        ${_calFormFields(existingEvent.date, existingEvent.start_time, existingEvent.end_time, existingEvent.category)}
      </div>
      <input type="hidden" id="cal-action" value="none">
    </div>` : `
    <div class="divider"></div>
    <div class="section-title" style="margin-bottom:10px">📅 Planification</div>
    <div id="cal-section">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.88rem;font-weight:500">
        <input type="checkbox" id="cal-add-check" style="width:16px;height:16px">
        Ajouter au calendrier
      </label>
      <div id="cal-new-form" class="hidden">
        ${_calFormFields(today, '09:00', '10:00', 'Travail')}
      </div>
      <input type="hidden" id="cal-action" value="none">
    </div>`;

  openModal({
    title: isNew ? 'Nouvelle tâche' : 'Modifier la tâche',
    showDelete: !isNew,
    bodyHTML: `
      <div class="form-group">
        <label class="form-label">Titre *</label>
        <input class="form-input" id="t-title" value="${t.title}" placeholder="Décrire la tâche…" autofocus>
      </div>
      <div class="form-group">
        <label class="form-label">Quadrant</label>
        <select class="form-select" id="t-quadrant">
          ${QUADRANTS.map(q => `<option value="${q}" ${t.quadrant === q ? 'selected' : ''}>${q} — ${QUADRANT_LABELS[q].label}</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer">
          <input type="checkbox" id="t-quickwin" ${t.quickwin ? 'checked' : ''} style="width:16px;height:16px;margin-top:2px">
          <span>
            <span class="form-label" style="margin:0">⚡ Quick win</span>
            <span class="form-hint" style="margin-top:2px">Moins de 15 min, sans dépendance à un tiers, faisable n'importe où.</span>
          </span>
        </label>
      </div>

      <div class="divider"></div>
      <div class="form-group">
        <label class="form-label">Récurrence</label>
        <select class="form-select" id="t-recurrence">
          <option value="none"   ${t.recurrence === 'none'   ? 'selected' : ''}>Ponctuelle</option>
          <option value="daily"  ${t.recurrence === 'daily'  ? 'selected' : ''}>Tous les jours</option>
          <option value="weekly" ${t.recurrence === 'weekly' ? 'selected' : ''}>Certains jours de la semaine</option>
        </select>
      </div>
      <div class="form-group ${t.recurrence === 'weekly' ? '' : 'hidden'}" id="t-weekdays-wrap">
        <label class="form-label">Jours</label>
        <div class="weekday-picker">
          ${WEEKDAYS.map(w => `
            <button type="button" class="weekday-btn ${(t.weekdays || []).includes(w.n) ? 'active' : ''}" data-wd="${w.n}">${w.label}</button>
          `).join('')}
        </div>
      </div>
      ${recurrent ? `<div class="form-hint">${(t.completions || []).length} jour${(t.completions || []).length > 1 ? 's' : ''} déjà validé${(t.completions || []).length > 1 ? 's' : ''} · série en cours : ${getStreak(t)}</div>` : ''}

      <div id="cal-wrap" class="${t.recurrence !== 'none' ? 'hidden' : ''}">${calSection}</div>`,
    onSave: () => {
      const title = document.getElementById('t-title').value.trim();
      if (!title) { toast('Le titre est requis', 'error'); return; }

      // Pré-générer l'ID pour pouvoir le lier au calendrier
      const taskId = t.id || uid('t');
      const recurrence = document.getElementById('t-recurrence').value;
      const weekdays = [...document.querySelectorAll('.weekday-btn.active')].map(b => Number(b.dataset.wd));
      if (recurrence === 'weekly' && !weekdays.length) {
        toast('Choisis au moins un jour de la semaine', 'error');
        return;
      }
      saveTask({
        ...t,
        id: taskId,
        title,
        quadrant: document.getElementById('t-quadrant').value,
        quickwin: document.getElementById('t-quickwin').checked,
        recurrence,
        weekdays,
        completions: t.completions || [],
      });

      // Gestion du calendrier
      const calAction = document.getElementById('cal-action')?.value;
      if (calAction === 'create') {
        const cat = document.getElementById('cal-cat')?.value;
        const dateVal = document.getElementById('cal-date')?.value;
        if (cat && dateVal) {
          saveCalendarEvent({
            id: null, title, task_id: taskId,
            date: dateVal,
            start_time: document.getElementById('cal-start').value,
            end_time: document.getElementById('cal-end').value,
            category: cat, color: CAT_COLORS[cat] || '#95A5A6', notes: '',
          });
        }
      } else if (calAction === 'update' && existingEvent) {
        const cat = document.getElementById('cal-cat')?.value;
        saveCalendarEvent({
          ...existingEvent,
          date: document.getElementById('cal-date').value,
          start_time: document.getElementById('cal-start').value,
          end_time: document.getElementById('cal-end').value,
          category: cat, color: CAT_COLORS[cat] || existingEvent.color,
        });
      } else if (calAction === 'delete' && existingEvent) {
        deleteCalendarEvent(existingEvent.id);
      }

      closeModal();
      toast(isNew ? 'Tâche créée' : 'Tâche mise à jour', 'success');
      renderTasks(container);
    },
    onDelete: () => {
      closeModal();
      confirmModal('Supprimer cette tâche ?', () => {
        // Supprimer l'événement calendrier lié si présent
        if (existingEvent) deleteCalendarEvent(existingEvent.id);
        deleteTask(t.id);
        toast('Tâche supprimée');
        renderTasks(container);
      });
    },
  });

  // Bind interactivité section calendrier (après insertion dans le DOM)
  setTimeout(() => {
    // Récurrence : afficher les jours en hebdo, masquer le calendrier si récurrent
    const recSelect = document.getElementById('t-recurrence');
    if (recSelect) {
      recSelect.addEventListener('change', () => {
        document.getElementById('t-weekdays-wrap').classList.toggle('hidden', recSelect.value !== 'weekly');
        document.getElementById('cal-wrap').classList.toggle('hidden', recSelect.value !== 'none');
      });
    }
    document.querySelectorAll('.weekday-btn').forEach(btn => {
      btn.addEventListener('click', () => btn.classList.toggle('active'));
    });

    const calCheck = document.getElementById('cal-add-check');
    if (calCheck) {
      calCheck.addEventListener('change', () => {
        document.getElementById('cal-new-form').classList.toggle('hidden', !calCheck.checked);
        document.getElementById('cal-action').value = calCheck.checked ? 'create' : 'none';
      });
    }

    const modifyBtn = document.getElementById('cal-modify-btn');
    if (modifyBtn) {
      let editing = false;
      modifyBtn.addEventListener('click', () => {
        editing = !editing;
        document.getElementById('cal-edit-form').classList.toggle('hidden', !editing);
        document.getElementById('cal-action').value = editing ? 'update' : 'none';
        modifyBtn.textContent = editing ? '↩ Annuler' : 'Modifier';
      });
    }

    const removeBtn = document.getElementById('cal-remove-btn');
    if (removeBtn) {
      let removing = false;
      removeBtn.addEventListener('click', () => {
        removing = !removing;
        document.getElementById('cal-action').value = removing ? 'delete' : 'none';
        removeBtn.textContent = removing ? '↩ Annuler' : 'Retirer du calendrier';
        removeBtn.style.color = removing ? 'var(--text-3)' : 'var(--q1)';
        document.getElementById('cal-existing-info').style.opacity = removing ? '0.5' : '1';
      });
    }
  }, 0);
}
