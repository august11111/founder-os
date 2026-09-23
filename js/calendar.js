/* ============================================================
   FOUNDER OS — Calendrier
   Vue semaine (défaut) · mois · jour + mini-calendrier sidebar
   ============================================================ */

import {
  getCalendarEvents, saveCalendarEvent, deleteCalendarEvent, getCalendarEventById,
  getTasks, getTaskById, saveTask,
  openModal, closeModal, confirmModal, fmtDate, toast, uid, todayStr
} from './core.js';

// ── Constantes ───────────────────────────────────────────────
export const CATEGORIES = {
  'Interview':        '#1D9E75',
  'Deep work':        '#378ADD',
  'RDV':              '#9B59B6',
  'Proposition RDV':  '#F97316',
  'Perso':            '#F39C12',
  'Travail':          '#1A1A1A',
  'Revue':            '#E74C3C',
  'Autre':            '#95A5A6',
};

const HOUR_H    = 64;  // px par heure
const DAY_START = 7;
const DAY_END   = 22;
const SPAN      = DAY_END - DAY_START; // 15 heures

const FR_DAYS_S  = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
const FR_DAYS_L  = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const FR_MONTHS  = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

// ── État ─────────────────────────────────────────────────────
let _date       = new Date();       // date de navigation
let _view       = 'week';           // 'week' | 'month' | 'day'
let _activeCats = new Set(Object.keys(CATEGORIES));
let _miniMonth  = new Date();
let _root       = null;             // container de la page

// ── Point d'entrée ───────────────────────────────────────────
export function renderCalendar(container) {
  _root = container;

  container.innerHTML = `
    <div class="cal-layout">
      <div class="cal-panel" id="cal-panel"></div>
      <div class="cal-content">
        <div class="cal-toolbar" id="cal-toolbar"></div>
        <div class="cal-view-wrap" id="cal-view-wrap"></div>
      </div>
    </div>`;

  _renderPanel(container.querySelector('#cal-panel'));
  _renderToolbar(container.querySelector('#cal-toolbar'));
  _renderView(container.querySelector('#cal-view-wrap'));
}

// ── Sidebar : mini-cal + filtres ─────────────────────────────
function _renderPanel(panel) {
  panel.innerHTML = `
    <div id="cal-mini"></div>
    <div class="cal-filters">
      <div class="section-title" style="margin-bottom:8px">Catégories</div>
      ${Object.entries(CATEGORIES).map(([cat, color]) => `
        <label class="cal-filter-item">
          <span class="cal-cat-dot" style="background:${color}"></span>
          <span class="cal-filter-label">${cat}</span>
          <input type="checkbox" class="cal-filter-check" data-cat="${cat}"
            ${_activeCats.has(cat) ? 'checked' : ''}>
        </label>`).join('')}
    </div>`;

  _renderMiniCal(panel.querySelector('#cal-mini'));

  panel.querySelectorAll('.cal-filter-check').forEach(cb => {
    cb.addEventListener('change', () => {
      _activeCats[cb.checked ? 'add' : 'delete'](cb.dataset.cat);
      _renderView(_root.querySelector('#cal-view-wrap'));
    });
  });
}

function _renderMiniCal(el) {
  const y = _miniMonth.getFullYear(), m = _miniMonth.getMonth();
  const today = new Date();
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // lundi=0
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  // Dates avec events
  const evDates = new Set(
    getCalendarEvents()
      .filter(e => { const d = new Date(e.date); return d.getFullYear()===y && d.getMonth()===m; })
      .map(e => new Date(e.date).getDate())
  );

  let cells = '', day = 1;
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 7; col++) {
      const idx = row * 7 + col;
      if (idx < firstDow || day > daysInMonth) { cells += `<div class="cal-mini-cell"></div>`; continue; }
      const d = new Date(y, m, day);
      const ds = _ds(d);
      const isToday    = d.toDateString() === today.toDateString();
      const isCurrent  = d.toDateString() === _date.toDateString();
      cells += `<div class="cal-mini-cell ${isToday?'mini-today':''} ${isCurrent&&!isToday?'mini-sel':''}" data-date="${ds}">
        ${day}${evDates.has(day) ? '<span class="cal-mini-dot"></span>' : ''}
      </div>`;
      day++;
    }
    if (day > daysInMonth) break;
  }

  el.innerHTML = `
    <div class="cal-mini-hd">
      <button class="btn btn-ghost btn-icon btn-sm" id="mp">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="cal-mini-month">${FR_MONTHS[m]} ${y}</span>
      <button class="btn btn-ghost btn-icon btn-sm" id="mn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
    <div class="cal-mini-dow">${['L','M','M','J','V','S','D'].map(d=>`<span>${d}</span>`).join('')}</div>
    <div class="cal-mini-grid">${cells}</div>`;

  el.querySelector('#mp').onclick = () => { _miniMonth = new Date(y, m-1, 1); _renderMiniCal(el); };
  el.querySelector('#mn').onclick = () => { _miniMonth = new Date(y, m+1, 1); _renderMiniCal(el); };

  el.querySelectorAll('.cal-mini-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', () => {
      _date = new Date(cell.dataset.date + 'T00:00:00');
      if (_view === 'month') _view = 'week';
      _refresh();
    });
  });
}

// ── Toolbar ──────────────────────────────────────────────────
function _renderToolbar(tb) {
  tb.innerHTML = `
    <div class="cal-tb-left">
      <button class="btn btn-secondary btn-sm" id="tb-prev">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <button class="btn btn-secondary btn-sm" id="tb-today">Aujourd'hui</button>
      <button class="btn btn-secondary btn-sm" id="tb-next">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <span class="cal-view-title">${_title()}</span>
    </div>
    <div class="cal-tb-right">
      <div class="cal-view-toggle">
        ${['day','week','month'].map(v => `
          <button class="btn btn-ghost btn-sm ${_view===v?'cal-toggle-active':''}" data-vm="${v}">
            ${v==='day'?'Jour':v==='week'?'Semaine':'Mois'}
          </button>`).join('')}
      </div>
      <button class="btn btn-primary btn-sm" id="tb-new">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nouveau
      </button>
    </div>`;

  tb.querySelector('#tb-prev').onclick   = () => _nav(-1);
  tb.querySelector('#tb-today').onclick  = () => { _date = new Date(); _refresh(); };
  tb.querySelector('#tb-next').onclick   = () => _nav(1);
  tb.querySelector('#tb-new').onclick    = () => openEventModal(null, _root);

  tb.querySelectorAll('[data-vm]').forEach(btn => {
    btn.addEventListener('click', () => { _view = btn.dataset.vm; _refresh(); });
  });
}

function _nav(dir) {
  const d = new Date(_date);
  if (_view === 'day')   d.setDate(d.getDate() + dir);
  if (_view === 'week')  d.setDate(d.getDate() + dir * 7);
  if (_view === 'month') d.setMonth(d.getMonth() + dir);
  _date = d;
  _refresh();
}

function _refresh() {
  _renderToolbar(_root.querySelector('#cal-toolbar'));
  _renderView(_root.querySelector('#cal-view-wrap'));
  _renderMiniCal(_root.querySelector('#cal-mini'));
}

function _title() {
  const d = _date;
  if (_view === 'day')
    return `${FR_DAYS_L[d.getDay()]} ${d.getDate()} ${FR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (_view === 'week') {
    const mon = _monday(d), sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return mon.getMonth() === sun.getMonth()
      ? `${mon.getDate()} – ${sun.getDate()} ${FR_MONTHS[mon.getMonth()]} ${mon.getFullYear()}`
      : `${mon.getDate()} ${FR_MONTHS[mon.getMonth()]} – ${sun.getDate()} ${FR_MONTHS[sun.getMonth()]} ${mon.getFullYear()}`;
  }
  return `${FR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// ── Dispatch vue ─────────────────────────────────────────────
function _renderView(wrap) {
  const evs = getCalendarEvents().filter(e => _activeCats.has(e.category));
  if      (_view === 'week')  _weekView(wrap, evs);
  else if (_view === 'month') _monthView(wrap, evs);
  else                        _dayView(wrap, evs);
}

// ── Vue Semaine ──────────────────────────────────────────────
function _weekView(wrap, evs) {
  const mon  = _monday(_date);
  const days = Array.from({length:7}, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate()+i); return d; });
  const todayDs = _ds(new Date());
  const hours   = Array.from({length: SPAN}, (_, i) => DAY_START + i);

  wrap.innerHTML = `
    <div class="cal-week">
      <div class="cal-week-head">
        <div class="cal-gutter"></div>
        ${days.map(d => `
          <div class="cal-day-head ${_ds(d)===todayDs?'head-today':''}">
            <span class="cal-dn">${FR_DAYS_S[d.getDay()]}</span>
            <span class="cal-dd ${_ds(d)===todayDs?'dd-today':''}">${d.getDate()}</span>
          </div>`).join('')}
      </div>
      <div class="cal-week-body" id="cal-body">
        <div class="cal-gutter cal-hours">
          ${hours.map(h => `<div class="cal-hl">${h}h</div>`).join('')}
          <div class="cal-hl"></div>
        </div>
        ${days.map(d => {
          const ds = _ds(d);
          const isToday = ds === todayDs;
          const positioned = _placeEvents(evs.filter(e => e.date === ds));
          return `
            <div class="cal-day-col ${isToday?'col-today':''}" data-date="${ds}">
              ${hours.map(h => `<div class="cal-slot" data-date="${ds}" data-hour="${h}"></div>`).join('')}
              ${positioned.map(({ev, col, cols}) => _evBlock(ev, col, cols)).join('')}
              ${isToday ? `<div class="cal-now" style="top:${_nowY()}px"><span class="cal-now-dot"></span></div>` : ''}
            </div>`;
        }).join('')}
      </div>
    </div>`;

  _bindTimeGrid(wrap);
  // Scroll vers l'heure actuelle ou 8h
  const body = wrap.querySelector('#cal-body');
  if (body) body.scrollTop = Math.max(0, (_ds(new Date())===_ds(_date) ? _nowY() : _toY('08:00')) - 100);
}

// ── Vue Jour ─────────────────────────────────────────────────
function _dayView(wrap, evs) {
  const ds      = _ds(_date);
  const isToday = ds === _ds(new Date());
  const hours   = Array.from({length: SPAN}, (_, i) => DAY_START + i);
  const positioned = _placeEvents(evs.filter(e => e.date === ds));

  wrap.innerHTML = `
    <div class="cal-week">
      <div class="cal-week-head">
        <div class="cal-gutter"></div>
        <div class="cal-day-head head-today" style="flex:1">
          <span class="cal-dn">${FR_DAYS_L[_date.getDay()]}</span>
          <span class="cal-dd ${isToday?'dd-today':''}">${_date.getDate()}</span>
        </div>
      </div>
      <div class="cal-week-body" id="cal-body">
        <div class="cal-gutter cal-hours">
          ${hours.map(h => `<div class="cal-hl">${h}h</div>`).join('')}
          <div class="cal-hl"></div>
        </div>
        <div class="cal-day-col ${isToday?'col-today':''}" data-date="${ds}" style="flex:1">
          ${hours.map(h => `<div class="cal-slot" data-date="${ds}" data-hour="${h}"></div>`).join('')}
          ${positioned.map(({ev, col, cols}) => _evBlock(ev, col, cols)).join('')}
          ${isToday ? `<div class="cal-now" style="top:${_nowY()}px"><span class="cal-now-dot"></span></div>` : ''}
        </div>
      </div>
    </div>`;

  _bindTimeGrid(wrap);
  const body = wrap.querySelector('#cal-body');
  if (body) body.scrollTop = Math.max(0, _nowY() - 100);
}

// ── Vue Mois ─────────────────────────────────────────────────
function _monthView(wrap, evs) {
  const y = _date.getFullYear(), m = _date.getMonth();
  const todayDs  = _ds(new Date());
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7;
  const lastDay  = new Date(y, m+1, 0).getDate();

  let rows = '', day = 1 - firstDow;
  for (let row = 0; row < 6; row++) {
    let cells = '';
    for (let col = 0; col < 7; col++, day++) {
      const d  = new Date(y, m, day);
      const ds = _ds(d);
      const inMonth = d.getMonth() === m;
      const dayEvs  = evs.filter(e => e.date === ds).slice(0, 3);
      const more    = evs.filter(e => e.date === ds).length - dayEvs.length;
      cells += `
        <div class="cal-month-cell ${inMonth?'':'out-month'} ${ds===todayDs?'month-today':''}" data-date="${ds}">
          <div class="cal-month-date ${ds===todayDs?'md-today':''}">${d.getDate()}</div>
          <div class="cal-month-evs">
            ${dayEvs.map(ev => `
              <div class="cal-month-ev${ev.category === 'Proposition RDV' ? ' cal-ev-proposed' : ''}" data-id="${ev.id}"
                style="background:${ev.color}22;color:${ev.color};border-left:2px solid ${ev.color}">
                ${ev.title}
              </div>`).join('')}
            ${more > 0 ? `<div class="cal-month-more">+${more} autres</div>` : ''}
          </div>
        </div>`;
    }
    rows += `<div class="cal-month-row">${cells}</div>`;
    if (day > lastDay && row >= 3) break;
  }

  wrap.innerHTML = `
    <div class="cal-month">
      <div class="cal-month-head">
        ${['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(d=>`<div>${d}</div>`).join('')}
      </div>
      <div class="cal-month-body">${rows}</div>
    </div>`;

  wrap.querySelectorAll('.cal-month-cell').forEach(cell => {
    cell.addEventListener('click', e => {
      if (e.target.closest('.cal-month-ev')) return;
      _date = new Date(cell.dataset.date + 'T00:00:00');
      _view = 'day';
      _refresh();
    });
  });
  wrap.querySelectorAll('.cal-month-ev').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const ev = getCalendarEventById(el.dataset.id);
      if (ev) _popover(ev, el);
    });
  });
}

// ── Bloc événement (semaine/jour) ────────────────────────────
function _evBlock(ev, col, cols) {
  const top    = _toY(ev.start_time);
  const height = Math.max(_dh(ev.start_time, ev.end_time), 26);
  const w      = cols > 1 ? `calc(${100/cols}% - 3px)` : 'calc(100% - 6px)';
  const l      = cols > 1 ? `calc(${col*100/cols}% + 2px)` : '3px';
  const light  = _isLight(ev.color);
  const task   = ev.task_id ? getTaskById(ev.task_id) : null;

  const proposed = ev.category === 'Proposition RDV';
  return `
    <div class="cal-ev${proposed ? ' cal-ev-proposed' : ''}" data-id="${ev.id}"
      style="top:${top}px;height:${height}px;width:${w};left:${l};
             background:${ev.color};color:${light?'#1A1A1A':'#fff'};
             border-color:${_darken(ev.color)}">
      <div class="cal-ev-title">${ev.title}</div>
      ${height > 38 ? `<div class="cal-ev-time">${ev.start_time}–${ev.end_time}</div>` : ''}
      ${task && height > 52 ? `<div class="cal-ev-task">📋 ${task.title.slice(0,28)}</div>` : ''}
    </div>`;
}

// ── Binding grille temps ─────────────────────────────────────
function _bindTimeGrid(wrap) {
  // Clic sur événement → popover
  wrap.querySelectorAll('.cal-ev').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const ev = getCalendarEventById(el.dataset.id);
      if (ev) _popover(ev, el);
    });
  });

  // Clic sur colonne vide → créer
  wrap.querySelectorAll('.cal-day-col').forEach(col => {
    col.addEventListener('click', e => {
      if (e.target.closest('.cal-ev')) return;
      const body = col.closest('.cal-week-body');
      const rect = col.getBoundingClientRect();
      const relY = e.clientY - rect.top + (body ? body.scrollTop : 0);
      let hour = Math.floor(relY / HOUR_H) + DAY_START;
      hour = Math.max(DAY_START, Math.min(DAY_END - 1, hour));
      openEventModal(null, _root, col.dataset.date, hour);
    });
  });
}

// ── Popover détail ───────────────────────────────────────────
function _popover(ev, anchor) {
  document.querySelector('.cal-pop')?.remove();

  const task = ev.task_id ? getTaskById(ev.task_id) : null;
  const pop  = document.createElement('div');
  pop.className = 'cal-pop';
  pop.innerHTML = `
    <div class="cal-pop-hd" style="border-left:3px solid ${ev.color}">
      <div style="flex:1">
        <div class="cal-pop-title">${ev.title}</div>
        <div class="cal-pop-meta">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${fmtDate(ev.date)} · ${ev.start_time}–${ev.end_time}
        </div>
        <div class="cal-pop-meta">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${ev.color}"></span>
          ${ev.category}
        </div>
        ${ev.notes ? `<div class="cal-pop-notes">${ev.notes}</div>` : ''}
        ${task ? `<div class="cal-pop-meta" style="margin-top:6px">📋 ${task.title}</div>` : ''}
      </div>
      <button class="btn-close" id="pop-x" style="flex-shrink:0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="cal-pop-ft">
      <button class="btn btn-secondary btn-sm" id="pop-edit">Modifier</button>
      <button class="btn btn-danger btn-sm" id="pop-del">Supprimer</button>
    </div>`;

  document.body.appendChild(pop);

  // Positionnement
  const r = anchor.getBoundingClientRect();
  const pw = 280;
  let left = r.right + 10;
  let top  = r.top;
  if (left + pw > window.innerWidth - 10) left = r.left - pw - 10;
  if (top + 220 > window.innerHeight)     top  = window.innerHeight - 230;
  pop.style.cssText += `;left:${Math.max(8,left)}px;top:${Math.max(8,top)}px`;

  pop.querySelector('#pop-x').onclick    = () => pop.remove();
  pop.querySelector('#pop-edit').onclick = () => { pop.remove(); openEventModal(ev, _root); };
  pop.querySelector('#pop-del').onclick  = () => {
    pop.remove();
    confirmModal(`Supprimer "${ev.title}" ?`, () => {
      deleteCalendarEvent(ev.id);
      toast('Événement supprimé');
      renderCalendar(_root);
    });
  };

  setTimeout(() => {
    document.addEventListener('click', function _close(e) {
      if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', _close); }
    });
  }, 0);
}

// ── Modal création / édition ─────────────────────────────────
export function openEventModal(event, container, preDate = null, preHour = null) {
  const isNew   = !event;
  const defDate  = preDate || todayStr();
  const defStart = preHour != null ? `${String(preHour).padStart(2,'0')}:00` : '09:00';
  const defEnd   = preHour != null ? `${String(Math.min(preHour+1,22)).padStart(2,'0')}:00` : '10:00';

  const ev = event || {
    id: null, title: '', date: defDate, start_time: defStart, end_time: defEnd,
    category: 'RDV', color: CATEGORIES['RDV'], notes: '', task_id: null
  };

  // Section tâche : si une tâche est déjà liée → afficher avec option "Délier"
  //                 sinon → checkbox pour en créer une nouvelle
  const linkedTask = ev.task_id ? getTaskById(ev.task_id) : null;

  const taskSection = linkedTask ? `
    <div class="divider"></div>
    <div class="form-group">
      <label class="form-label">Tâche associée</label>
      <div style="background:var(--bg-2);border-radius:6px;padding:10px 14px;display:flex;align-items:center;gap:10px">
        <span>📋</span>
        <span style="flex:1;font-size:.88rem;font-weight:600">${linkedTask.title}</span>
        <span class="badge badge-${linkedTask.quadrant.toLowerCase()}">${linkedTask.quadrant}</span>
        <button class="btn btn-ghost btn-sm" id="ev-unlink-btn" style="color:var(--text-3);flex-shrink:0">Délier</button>
      </div>
      <input type="hidden" id="ev-task-id" value="${linkedTask.id}">
    </div>` : `
    <div class="divider"></div>
    <div class="form-group">
      <label class="form-label">Tâche associée</label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.88rem;font-weight:500;padding:2px 0">
        <input type="checkbox" id="ev-create-task" style="width:16px;height:16px">
        Créer une tâche correspondante
      </label>
      <div id="ev-task-form" class="hidden" style="margin-top:12px;padding:14px;background:var(--bg-2);border-radius:8px">
        <div class="form-group" style="margin-bottom:12px">
          <label class="form-label">Titre de la tâche</label>
          <input class="form-input" id="ev-task-title" value="${ev.title}" placeholder="Titre de la tâche">
        </div>
        <div class="form-group">
          <label class="form-label">Quadrant</label>
          <select class="form-select" id="ev-task-quadrant">
            <option value="Q2" selected>Q2 — Important, pas urgent</option>
            <option value="Q1">Q1 — Urgent + Important</option>
            <option value="Q3">Q3 — Urgent, pas important</option>
            <option value="Q4">Q4 — Ni urgent ni important</option>
          </select>
        </div>
      </div>
      <input type="hidden" id="ev-task-id" value="">
    </div>`;

  openModal({
    title: isNew ? 'Nouvel événement' : 'Modifier l\'événement',
    showDelete: !isNew,
    bodyHTML: `
      <div class="form-group">
        <label class="form-label">Titre *</label>
        <input class="form-input" id="ev-title" value="${ev.title}" placeholder="Nom de l'événement" autofocus>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Date</label>
          <input class="form-input" id="ev-date" type="date" value="${ev.date}">
        </div>
        <div class="form-group">
          <label class="form-label">Catégorie</label>
          <select class="form-select" id="ev-cat">
            ${Object.keys(CATEGORIES).map(c => `
              <option value="${c}" ${ev.category===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Heure début</label>
          <input class="form-input" id="ev-start" type="time" value="${ev.start_time}">
        </div>
        <div class="form-group">
          <label class="form-label">Heure fin</label>
          <input class="form-input" id="ev-end" type="time" value="${ev.end_time}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <textarea class="form-textarea" id="ev-notes" rows="2" placeholder="Contexte, préparation…">${ev.notes||''}</textarea>
      </div>
      ${taskSection}`,
    onSave: () => {
      const title = document.getElementById('ev-title').value.trim();
      if (!title) { toast('Le titre est requis', 'error'); return; }
      const cat = document.getElementById('ev-cat').value;

      // Résoudre le task_id final
      let finalTaskId = document.getElementById('ev-task-id')?.value || null;

      // Créer une nouvelle tâche si la checkbox est cochée
      const createTask = document.getElementById('ev-create-task')?.checked;
      if (createTask) {
        const taskTitle = document.getElementById('ev-task-title')?.value.trim() || title;
        const newTaskId = uid('t');
        saveTask({
          id:       newTaskId,
          title:    taskTitle,
          quadrant: document.getElementById('ev-task-quadrant')?.value || 'Q2',
          done: false,
          recurrence: 'none', weekdays: [], completions: [],
          quickwin: false, linked_subgoal_id: null,
        });
        finalTaskId = newTaskId;
        toast('Tâche créée', 'success');
      }

      saveCalendarEvent({
        ...ev, title,
        date:       document.getElementById('ev-date').value,
        start_time: document.getElementById('ev-start').value,
        end_time:   document.getElementById('ev-end').value,
        category:   cat,
        color:      CATEGORIES[cat] || '#95A5A6',
        notes:      document.getElementById('ev-notes').value.trim(),
        task_id:    finalTaskId || null,
      });
      closeModal();
      toast(isNew ? 'Événement créé' : 'Événement mis à jour', 'success');
      renderCalendar(container);
    },
    onDelete: () => {
      closeModal();
      confirmModal(`Supprimer "${ev.title}" ?`, () => {
        deleteCalendarEvent(ev.id);
        toast('Événement supprimé');
        renderCalendar(container);
      });
    },
  });

  // Bind interactivité section tâche après insertion dans le DOM
  setTimeout(() => {
    // Checkbox → afficher/masquer le formulaire de création
    const createChk = document.getElementById('ev-create-task');
    if (createChk) {
      createChk.addEventListener('change', () => {
        document.getElementById('ev-task-form').classList.toggle('hidden', !createChk.checked);
        // Sync le titre de la tâche avec le titre de l'event en temps réel
        if (createChk.checked) {
          const evTitle = document.getElementById('ev-title');
          const taskTitle = document.getElementById('ev-task-title');
          if (evTitle && taskTitle && !taskTitle.value) taskTitle.value = evTitle.value;
        }
      });
    }

    // Bouton Délier → vider l'id et afficher une confirmation visuelle
    const unlinkBtn = document.getElementById('ev-unlink-btn');
    if (unlinkBtn) {
      unlinkBtn.addEventListener('click', () => {
        document.getElementById('ev-task-id').value = '';
        unlinkBtn.closest('[style]').style.opacity = '0.4';
        unlinkBtn.textContent = '✓ Délié';
        unlinkBtn.disabled = true;
      });
    }
  }, 0);
}

// ── Helpers positionnement ───────────────────────────────────
function _tm(t) { const [h,m] = t.split(':').map(Number); return h*60+m; }
function _toY(t) { return (_tm(t) - DAY_START*60) / 60 * HOUR_H; }
function _dh(s, e) { return (_tm(e) - _tm(s)) / 60 * HOUR_H; }
function _nowY() {
  const n = new Date();
  return _toY(`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`);
}
function _monday(d) {
  const r = new Date(d);
  r.setDate(d.getDate() - (d.getDay()+6)%7);
  r.setHours(0,0,0,0);
  return r;
}
// Toujours en heure locale — toISOString() retournerait UTC et décalerait d'un jour en UTC+x
function _ds(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _isLight(hex) {
  const h = hex.replace('#','');
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  return (r*299+g*587+b*114)/1000 > 155;
}

function _darken(hex) {
  const h = hex.replace('#','');
  return '#' + [0,2,4].map(i => Math.max(0,parseInt(h.slice(i,i+2),16)-30).toString(16).padStart(2,'0')).join('');
}

// Placement anti-overlap : tri par heure de début, colonnes gloutonne
function _placeEvents(events) {
  const sorted = [...events].sort((a,b) => _tm(a.start_time)-_tm(b.start_time));
  const result = [];
  const colEnds = [];

  for (const ev of sorted) {
    const s = _tm(ev.start_time);
    const e = _tm(ev.end_time || ev.start_time) + 30;
    let col = 0;
    while (col < colEnds.length && colEnds[col] > s) col++;
    if (col === colEnds.length) colEnds.push(0);
    colEnds[col] = e;
    result.push({ ev, col, cols: 1 });
  }

  // Calcul du nombre total de colonnes pour les groupes qui se chevauchent
  for (let i = 0; i < result.length; i++) {
    const ea = _tm(result[i].ev.start_time), eb = _tm(result[i].ev.end_time||result[i].ev.start_time)+30;
    for (let j = i+1; j < result.length; j++) {
      if (_tm(result[j].ev.start_time) >= eb) break;
      const max = Math.max(result[i].col, result[j].col) + 1;
      result[i].cols = Math.max(result[i].cols, max);
      result[j].cols = Math.max(result[j].cols, max);
    }
  }
  return result;
}
