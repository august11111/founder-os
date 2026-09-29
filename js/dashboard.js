/* ============================================================
   FOUNDER OS — Dashboard
   ============================================================ */

import {
  getMeta, getContacts, getInterviews,
  getTodayHabit, saveHabit, updateMeta, getTaskById, setTaskDone,
  getDueToday, isDoneOn, toggleTaskDay, getStreak,
  getRoadmapRoots, getWeakestDimensions, getQuickWins, pickQuickWin,
  getProspectionStats, getContactsToFollowUp,
  badgeQuadrant, toast, todayStr,
} from './core.js';
import { renderRadar } from './radar.js';
import { renderDailyPilot } from './prospection.js';

// Tâche actuellement piochée dans la file « temps mort »
let _quickWinId = null;
// Fenêtre de l'entonnoir de prospection : null = depuis toujours
let _prospectionDays = null;

export function renderDashboard(container) {
  const meta       = getMeta();
  const interviews = getInterviews();
  const contacts   = getContacts();
  const habit      = getTodayHabit() || { energy_score: 0 };

  const roots      = getRoadmapRoots();
  const objDone    = roots.filter(i => i.completed).length;
  const weakest    = getWeakestDimensions();
  const dueToday   = getDueToday();
  const dueDone    = dueToday.filter(t => isDoneOn(t)).length;
  const interviewsDone = interviews.filter(i => i.status === 'Analysée' || i.status === 'Réalisée').length;
  const quickWins  = getQuickWins();
  const daysLeft   = _daysUntil(meta.eval_date);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Founder OS</div>
        <div class="page-subtitle">${_dateDisplay()} &nbsp;·&nbsp; Semaine ${meta.week}</div>
      </div>
      <div class="page-actions">
        <span class="phase-badge">
          <span class="phase-dot"></span>
          Phase : <strong id="dash-phase-val">${meta.phase}</strong>
        </span>
      </div>
    </div>

    <!-- Priorité unique du jour -->
    <div class="focus-callout">
      <div style="flex:1">
        <div class="focus-label">⚡ Priorité unique du jour</div>
        <div class="focus-text" id="focus-text" contenteditable="true" title="Cliquer pour éditer">${meta.focus_today || 'Définir la priorité du jour…'}</div>
      </div>
      <button class="btn btn-ghost btn-sm" id="focus-save-btn" style="display:none">Enregistrer</button>
    </div>

    <!-- Radar des 8 dimensions -->
    <div id="dash-radar-slot"></div>

    <!-- KPI -->
    <div class="kpi-grid kpi-grid-5">
      <div class="kpi-card">
        <div class="kpi-label">Objectifs validés</div>
        <div class="kpi-value">${objDone}<span style="font-size:1rem;color:var(--text-3)">/${roots.length}</span></div>
        <div class="kpi-delta">sur les 8 dimensions</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Dimension la plus faible</div>
        <div class="kpi-value" style="font-size:1.15rem;line-height:1.3;padding-top:8px">${weakest.map(w => w.short).slice(0, 2).join(', ')}</div>
        <div class="kpi-delta">${weakest[0].score}/10 — à travailler</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Objectifs du jour</div>
        <div class="kpi-value">${dueDone}<span style="font-size:1rem;color:var(--text-3)">/${dueToday.length}</span></div>
        <div class="kpi-delta">${dueToday.length && dueDone === dueToday.length ? '🔥 Journée parfaite !' : 'quotidien coché'}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Interviews réalisées</div>
        <div class="kpi-value">${interviewsDone}</div>
        <div class="kpi-delta">${contacts.length} contact${contacts.length > 1 ? 's' : ''} au CRM</div>
      </div>
      <div class="kpi-card ${daysLeft !== null && daysLeft <= 14 ? 'kpi-urgent' : ''}">
        <div class="kpi-label">Évaluation</div>
        <div class="kpi-value">${daysLeft === null ? '—' : daysLeft}</div>
        <div class="kpi-delta">${daysLeft === null
          ? '<button class="btn-link" data-nav="settings">Définir la date</button>'
          : daysLeft < 0 ? 'date passée' : `jour${daysLeft > 1 ? 's' : ''} restant${daysLeft > 1 ? 's' : ''}`}</div>
      </div>
    </div>

    <!-- Objectifs du jour -->
    <div class="card" style="margin-top:16px">
      <div class="card-title">Objectifs du jour</div>
      ${dueToday.length ? dueToday.map(t => `
        <div class="rec-item ${isDoneOn(t) ? 'rec-done' : ''}" data-id="${t.id}">
          <div class="task-check ${isDoneOn(t) ? 'checked' : ''}" data-daycheck="${t.id}">
            ${isDoneOn(t) ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
          </div>
          <div class="rec-body">
            <div class="rec-title">${t.title}</div>
            <div class="rec-sub">${getStreak(t) > 0 ? `🔥 ${getStreak(t)} jour${getStreak(t) > 1 ? 's' : ''}` : 'Nouvelle série'}</div>
          </div>
        </div>
      `).join('') : `<div class="empty-state" style="padding:24px">
          <p>Aucun objectif quotidien — définis tes propres rituels</p>
          <button class="btn btn-secondary btn-sm" data-nav="tasks">Créer un objectif quotidien →</button>
        </div>`}
      <div class="divider"></div>
      <div class="section-title">Énergie du jour</div>
      <div style="display:flex;gap:8px;margin-top:6px">
        ${[1, 2, 3, 4, 5].map(n => `
          <button class="btn btn-sm ${habit.energy_score >= n ? 'btn-primary' : 'btn-secondary'}"
            data-energy="${n}" style="min-width:36px">${n}</button>
        `).join('')}
      </div>
    </div>

    <!-- File temps mort -->
    <div class="card qw-card" style="margin-top:16px">
      <div class="qw-head">
        <div class="card-title" style="margin:0">⚡ J'ai 15 minutes</div>
        <span class="qw-stock ${quickWins.length < 5 ? 'qw-stock-low' : ''}">
          ${quickWins.length} tâche${quickWins.length > 1 ? 's' : ''} rapide${quickWins.length > 1 ? 's' : ''} en réserve
        </span>
      </div>
      <div id="qw-body">${_quickWinBody(quickWins)}</div>
      ${quickWins.length > 0 && quickWins.length < 5 ? `
        <div class="qw-warning">Réserve basse : sans quick wins d'avance, tes temps morts sont perdus.</div>` : ''}
    </div>

    <!-- Prospection du jour, épinglée depuis le module Prospection -->
    <div class="card-title" style="margin-top:20px">Prospection du jour</div>
    <div id="dash-pilot-slot"></div>

    <!-- Entonnoir de prospection -->
    ${_prospectionHTML(contacts)}

    ${meta.quote ? `
      <div class="quote-block">
        <div class="quote-text">"${meta.quote}"</div>
        <div class="quote-author">— ${meta.quote_author}</div>
      </div>` : ''}
  `;

  // Le pilote vit dans le module Prospection : on l'affiche, on ne le duplique pas.
  renderDailyPilot(container.querySelector('#dash-pilot-slot'), {
    onChange: () => renderDashboard(container),
    onOpenDetail: () => container.dispatchEvent(
      new CustomEvent('navigate', { detail: 'prospection', bubbles: true })),
  });

  renderRadar(container.querySelector('#dash-radar-slot'), () => {
    const ev = new CustomEvent('navigate', { detail: 'roadmap', bubbles: true });
    container.dispatchEvent(ev);
  });

  _bindDashboard(container);
}

// ── Entonnoir de prospection ─────────────────────────────────
// La vue n'agrège rien : tout vient de getProspectionStats().
function _prospectionHTML(contacts) {
  const s = getProspectionStats(contacts, { sinceDays: _prospectionDays });
  // Compté sur l'ensemble des contacts, indépendamment de la fenêtre choisie
  const toFollowUp = getContactsToFollowUp(contacts, todayStr()).length;
  const periods = [[7, '7 j'], [30, '30 j'], [null, 'Tout']];

  // Largeur relative au plus grand étage, pour que l'entonnoir reste lisible
  // même si une acceptation a été loguée sans sa demande.
  const top = Math.max(s.demandes, s.acceptations, s.rdv, 1);
  const stages = [
    { label: 'Demandes',     value: s.demandes,     color: 'var(--text-3)',    rateAfter: s.tauxAcceptation },
    { label: 'Acceptations', value: s.acceptations, color: 'var(--status-blue)', rateAfter: s.tauxRdv },
    { label: 'RDV', value: s.rdv, color: 'var(--q2)', rateAfter: null,
      hint: 'RDV fixé, passé ou annulé, et appel passé' },
  ];

  const empty = !s.demandes && !s.acceptations && !s.rdv;

  return `
    <div class="card prosp-card" style="margin-top:16px">
      <div class="prosp-head">
        <div class="card-title" style="margin:0">Prospection</div>
        ${toFollowUp ? `<button class="btn-link prosp-followup" data-nav="crm">⏰ ${toFollowUp} à relancer</button>` : ''}
        <div class="filter-bar" style="margin:0">
          ${periods.map(([d, lbl]) => `
            <button class="filter-chip ${_prospectionDays === d ? 'active' : ''}" data-prosp="${d === null ? 'all' : d}">${lbl}</button>
          `).join('')}
        </div>
      </div>

      ${empty ? `
        <div class="qw-empty">
          Aucune interaction de prospection sur cette période. Logue tes demandes de
          connexion et tes RDV depuis la fiche d'un contact, dans le CRM.
          <div style="margin-top:10px"><button class="btn btn-secondary btn-sm" data-nav="crm">Aller au CRM →</button></div>
        </div>`
      : `
        <div class="prosp-global">
          <span class="prosp-global-value">${_pct(s.tauxGlobal)}</span>
          <span class="prosp-global-label">de RDV obtenus sur l'ensemble des demandes</span>
        </div>

        <div class="prosp-funnel">
          ${stages.map((st, i) => `
            <div class="prosp-stage">
              <span class="prosp-stage-label"${st.hint ? ` title="${st.hint}"` : ''}>${st.label}</span>
              <span class="prosp-stage-value">${st.value}</span>
              <div class="prosp-bar-track">
                <div class="prosp-bar" style="width:${st.value ? Math.max((st.value / top) * 100, 2) : 0}%;background:${st.color}"></div>
              </div>
            </div>
            ${i < stages.length - 1 ? `
              <div class="prosp-conv"><span class="prosp-conv-arrow">↓</span> ${_pct(st.rateAfter)}</div>` : ''}
          `).join('')}
        </div>

        <div class="prosp-secondary">
          ${s.messagesEnvoyes} message${s.messagesEnvoyes > 1 ? 's' : ''} LinkedIn ·
          ${s.emailsEnvoyes} email${s.emailsEnvoyes > 1 ? 's' : ''} ·
          ${s.relances} relance${s.relances > 1 ? 's' : ''}
        </div>`}
    </div>`;
}

// Un dénominateur nul donne « — », jamais NaN
function _pct(rate) { return rate === null ? '—' : `${rate} %`; }

// ── Bloc « J'ai 15 minutes » ─────────────────────────────────
function _quickWinBody(quickWins) {
  if (!quickWins.length) {
    return `<div class="qw-empty">
      Aucune tâche rapide en réserve. Coche « ⚡ Quick win » sur tes tâches courtes
      pour ne plus perdre un seul temps mort.
      <div style="margin-top:10px"><button class="btn btn-secondary btn-sm" data-nav="tasks">Aller aux tâches →</button></div>
    </div>`;
  }

  const picked = _quickWinId ? quickWins.find(t => t.id === _quickWinId) : null;
  if (!picked) {
    return `<div class="qw-idle">
      <button class="btn btn-primary" id="qw-pick">🎲 Pioche une tâche</button>
    </div>`;
  }

  return `
    <div class="qw-picked">
      <div class="qw-picked-title">${picked.title}</div>
      <div class="qw-picked-meta">${badgeQuadrant(picked.quadrant)}</div>
      <div class="qw-actions">
        <button class="btn btn-primary" id="qw-done">✓ C'est fait</button>
        <button class="btn btn-secondary" id="qw-again">🎲 Une autre</button>
      </div>
    </div>`;
}

// ── Binding des événements ───────────────────────────────────
function _bindDashboard(container) {
  const focusEl = container.querySelector('#focus-text');
  const focusSaveBtn = container.querySelector('#focus-save-btn');

  focusEl.addEventListener('focus', () => focusSaveBtn.style.display = 'inline-flex');
  focusEl.addEventListener('blur', () => {
    setTimeout(() => { focusSaveBtn.style.display = 'none'; }, 200);
  });
  focusSaveBtn.addEventListener('click', () => {
    updateMeta({ focus_today: focusEl.textContent.trim() });
    toast('Priorité mise à jour', 'success');
    focusSaveBtn.style.display = 'none';
  });

  // Objectifs quotidiens
  container.querySelectorAll('[data-daycheck]').forEach(box => {
    box.addEventListener('click', e => {
      e.stopPropagation();
      toggleTaskDay(box.dataset.daycheck);
      renderDashboard(container);
    });
  });

  // File temps mort
  container.querySelector('#qw-pick')?.addEventListener('click', () => {
    const pick = pickQuickWin();
    _quickWinId = pick ? pick.id : null;
    renderDashboard(container);
  });
  container.querySelector('#qw-again')?.addEventListener('click', () => {
    const pick = pickQuickWin(_quickWinId);
    if (!pick) { toast('C\'est la seule tâche rapide en réserve'); return; }
    _quickWinId = pick.id;
    renderDashboard(container);
  });
  container.querySelector('#qw-done')?.addEventListener('click', () => {
    const task = getTaskById(_quickWinId);
    if (task) {
      setTaskDone(task.id, true);
      toast(`✓ "${task.title}"`, 'success');
    }
    const next = pickQuickWin(_quickWinId);
    _quickWinId = next ? next.id : null;
    renderDashboard(container);
  });

  // Fenêtre de l'entonnoir de prospection
  container.querySelectorAll('[data-prosp]').forEach(btn => {
    btn.addEventListener('click', () => {
      _prospectionDays = btn.dataset.prosp === 'all' ? null : Number(btn.dataset.prosp);
      renderDashboard(container);
    });
  });

  // Énergie du jour
  container.querySelectorAll('[data-energy]').forEach(btn => {
    btn.addEventListener('click', () => {
      saveHabit({ energy_score: Number(btn.dataset.energy) });
      renderDashboard(container);
    });
  });

  container.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.dispatchEvent(new CustomEvent('navigate', { detail: btn.dataset.nav, bubbles: true }));
    });
  });
}

// ── Helpers ──────────────────────────────────────────────────
function _dateDisplay() {
  return new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function _daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  if (isNaN(target)) return null;
  const today = new Date(todayStr() + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

