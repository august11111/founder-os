/* ============================================================
   FOUNDER OS — Livrables : slides markdown + assemblage du pitch
   ============================================================ */

import {
  DIMENSIONS, getDimension, splitSlides,
  getDeliverables, getDeliverableById, saveDeliverable, deleteDeliverable,
  getRoadmapRoots, getRoadmapChildren, getRoadmapItemById,
  getPitchSlides, isSlideInPitch, addPitchSlide, removePitchSlide,
  removePitchSlideRef, movePitchSlide, resolvePitchSlides,
  confirmModal, toast, uid, todayStr, fmtDate, normalizeText,
} from './core.js';

// 'list' | 'edit' | 'pitch'
let _mode        = 'list';
let _editingId   = null;
let _slideIndex  = 0;
let _filterDim   = 'all';
let _search      = '';
let _saveTimer   = null;

// Demande d'ouverture venue d'une autre vue (bouton « + Livrable » de la Roadmap)
let _pendingOpen = null;

export function openDeliverable(id) { _pendingOpen = id; }

export function renderDeliverables(container) {
  if (_pendingOpen) {
    const exists = getDeliverableById(_pendingOpen);
    if (exists) { _mode = 'edit'; _editingId = _pendingOpen; _slideIndex = 0; }
    _pendingOpen = null;
  }
  if (_mode === 'edit' && !getDeliverableById(_editingId)) _mode = 'list';

  if (_mode === 'edit')  return _renderEditor(container);
  if (_mode === 'pitch') return _renderPitch(container);
  _renderList(container);
}

// ── Liste ────────────────────────────────────────────────────
function _renderList(container) {
  const all = getDeliverables();
  const q = normalizeText(_search);
  const items = all
    .filter(d => _filterDim === 'all' || d.dimension === _filterDim)
    .filter(d => !q || normalizeText(d.title).includes(q))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Livrables</div>
        <div class="page-subtitle">${all.length} livrable${all.length > 1 ? 's' : ''} · ${getPitchSlides().length} slide${getPitchSlides().length > 1 ? 's' : ''} dans le pitch</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" id="dlv-pitch-btn">📊 Pitch deck</button>
        <button class="btn btn-primary" id="dlv-new-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nouveau livrable
        </button>
      </div>
    </div>

    ${all.length ? `
      <div class="crm-search">
        <svg class="crm-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="form-input crm-search-input" id="dlv-search" value="${_esc(_search)}" placeholder="Rechercher un livrable…" autocomplete="off">
      </div>

      <div class="filter-bar">
        <span style="font-size:.8rem;color:var(--text-3);font-weight:600">Dimension :</span>
        <button class="filter-chip ${_filterDim === 'all' ? 'active' : ''}" data-fdim="all">Toutes</button>
        ${DIMENSIONS.map(d => `<button class="filter-chip ${_filterDim === d.key ? 'active' : ''}" data-fdim="${d.key}">${d.label}</button>`).join('')}
      </div>` : ''}

    ${items.length ? `
      <div class="dlv-grid">${items.map(_cardHTML).join('')}</div>`
    : all.length ? `
      <div class="empty-state"><p>Aucun livrable pour ces filtres</p></div>`
    : `
      <div class="empty-state dlv-empty">
        <div class="dlv-empty-icon">📊</div>
        <p><strong>Un livrable = quelques slides qui présentent le résultat d'un objectif.</strong></p>
        <p style="margin-top:8px">Quand tu termines « Chiffrer le marché », tu produis ici les 3 slides qui
        montrent le résultat. Elles deviennent la matière première de ton pitch deck.</p>
        <button class="btn btn-primary" id="dlv-new-empty" style="margin-top:16px">Créer mon premier livrable</button>
      </div>`}
  `;

  _bindList(container);
}

function _cardHTML(d) {
  const dim = getDimension(d.dimension);
  const count = splitSlides(d.markdown).length;
  const obj = d.linked_objective_id ? getRoadmapItemById(d.linked_objective_id) : null;
  return `
    <div class="dlv-card" data-id="${d.id}">
      <div class="dlv-card-top">
        <span class="dlv-dim" style="background:${dim.color}1a;color:${dim.color}">${dim.label}</span>
        <span class="dlv-status dlv-status-${d.status}">${d.status === 'final' ? 'Final' : 'Brouillon'}</span>
      </div>
      <div class="dlv-card-title">${_esc(d.title) || 'Sans titre'}</div>
      ${obj ? `<div class="dlv-card-obj" title="Objectif lié">🎯 ${_esc(obj.title)}</div>` : ''}
      <div class="dlv-card-foot">
        <span>${count} slide${count > 1 ? 's' : ''}</span>
        <span>${d.updated ? fmtDate(d.updated) : ''}</span>
      </div>
      <div class="dlv-card-actions">
        <button class="btn btn-secondary btn-sm" data-present="${d.id}" ${count ? '' : 'disabled'}>▶ Présenter</button>
        <button class="btn btn-ghost btn-sm" data-edit="${d.id}">Éditer</button>
      </div>
    </div>`;
}

function _bindList(container) {
  const go = () => renderDeliverables(container);

  container.querySelector('#dlv-pitch-btn')?.addEventListener('click', () => { _mode = 'pitch'; go(); });
  const create = () => {
    const d = saveDeliverable({
      id: null, title: 'Nouveau livrable', dimension: 'strategie',
      linked_objective_id: null, markdown: _starterMarkdown('Nouveau livrable'),
      status: 'draft', order: 0, updated: todayStr(),
    });
    _mode = 'edit'; _editingId = d.id; _slideIndex = 0;
    toast('Livrable créé', 'success');
    go();
  };
  container.querySelector('#dlv-new-btn')?.addEventListener('click', create);
  container.querySelector('#dlv-new-empty')?.addEventListener('click', create);

  container.querySelectorAll('[data-fdim]').forEach(btn => {
    btn.addEventListener('click', () => { _filterDim = btn.dataset.fdim; go(); });
  });

  const search = container.querySelector('#dlv-search');
  search?.addEventListener('input', () => {
    _search = search.value;
    go();
    const again = container.querySelector('#dlv-search');
    again.focus();
    again.setSelectionRange(again.value.length, again.value.length);
  });

  container.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      _mode = 'edit'; _editingId = btn.dataset.edit; _slideIndex = 0; go();
    });
  });
  container.querySelectorAll('[data-present]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      presentDeliverable(btn.dataset.present);
    });
  });
  container.querySelectorAll('.dlv-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      _mode = 'edit'; _editingId = card.dataset.id; _slideIndex = 0; go();
    });
  });
}

function _starterMarkdown(title) {
  return `# ${title}\n\nLe message principal de cette slide.\n\n---\n\n## Ce que montre le résultat\n\n- Premier point\n- Deuxième point\n`;
}

// ── Éditeur ──────────────────────────────────────────────────
function _renderEditor(container) {
  const d = getDeliverableById(_editingId);
  const slides = splitSlides(d.markdown);
  if (_slideIndex >= slides.length) _slideIndex = Math.max(0, slides.length - 1);
  const linkedObj = d.linked_objective_id ? getRoadmapItemById(d.linked_objective_id) : null;
  const dim = getDimension(d.dimension);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <button class="btn btn-ghost btn-sm" id="dlv-back">← Livrables</button>
        <div class="page-title" style="margin-top:6px">${_esc(d.title) || 'Sans titre'}</div>
        <div class="page-subtitle">${slides.length} slide${slides.length > 1 ? 's' : ''} · ${dim.label}<span id="dlv-saved" class="dlv-saved"></span></div>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" id="dlv-present" ${slides.length ? '' : 'disabled'}>▶ Présenter</button>
        <button class="btn btn-secondary btn-sm" id="dlv-pdf" ${slides.length ? '' : 'disabled'}>Exporter en PDF</button>
        <button class="btn btn-danger btn-sm" id="dlv-delete">Supprimer</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="form-row" style="grid-template-columns:2fr 1fr">
        <div class="form-group" style="margin:0">
          <label class="form-label">Titre</label>
          <input class="form-input" id="dlv-title" value="${_esc(d.title)}">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Statut</label>
          <select class="form-select" id="dlv-status">
            <option value="draft" ${d.status !== 'final' ? 'selected' : ''}>Brouillon</option>
            <option value="final" ${d.status === 'final' ? 'selected' : ''}>Final</option>
          </select>
        </div>
      </div>
      <div class="form-row" style="margin-top:12px">
        <div class="form-group" style="margin:0">
          <label class="form-label">Objectif lié</label>
          <select class="form-select" id="dlv-obj">
            <option value="">— Livrable libre —</option>
            ${_objectiveOptions(d.linked_objective_id)}
          </select>
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Dimension${linkedObj ? ' (héritée)' : ''}</label>
          <select class="form-select" id="dlv-dim" ${linkedObj ? 'disabled' : ''}>
            ${DIMENSIONS.map(dd => `<option value="${dd.key}" ${d.dimension === dd.key ? 'selected' : ''}>${dd.label}</option>`).join('')}
          </select>
          ${linkedObj ? `<div class="form-hint">Héritée de « ${_esc(linkedObj.title)} ».</div>` : ''}
        </div>
      </div>
    </div>

    <div class="dlv-editor">
      <div class="dlv-pane">
        <div class="dlv-pane-head">
          <span class="dlv-pane-title">Markdown</span>
          <span class="dlv-syntax"><code>#</code> titre · <code>##</code> sous-titre · <code>-</code> liste · <code>**gras**</code> · <code>---</code> nouvelle slide</span>
        </div>
        <textarea class="dlv-textarea" id="dlv-md" spellcheck="false">${_esc(d.markdown)}</textarea>
      </div>

      <div class="dlv-pane">
        <div class="dlv-pane-head">
          <span class="dlv-pane-title">Aperçu</span>
          <div class="dlv-nav">
            <button class="dlv-nav-btn" id="dlv-prev" title="Slide précédente">‹</button>
            <span class="dlv-nav-pos" id="dlv-pos">${slides.length ? `slide ${_slideIndex + 1} / ${slides.length}` : 'aucune slide'}</span>
            <button class="dlv-nav-btn" id="dlv-next" title="Slide suivante">›</button>
          </div>
        </div>
        <div class="slide-frame" id="dlv-preview">
          <div class="slide-canvas">${_mdSafe(slides[_slideIndex] || '')}</div>
        </div>
        <div class="dlv-preview-actions" id="dlv-pitch-action">${_pitchButtonHTML(d.id, _slideIndex, slides.length)}</div>
      </div>
    </div>
  `;

  _bindEditor(container);
}

function _pitchButtonHTML(dlvId, idx, total) {
  if (!total) return '';
  return isSlideInPitch(dlvId, idx)
    ? `<span class="dlv-in-pitch">✓ Dans le pitch</span>
       <button class="btn btn-ghost btn-sm" id="dlv-pitch-remove">Retirer du pitch</button>`
    : `<button class="btn btn-secondary btn-sm" id="dlv-pitch-add">+ Ajouter au pitch</button>`;
}

// Objectifs racines et sous-objectifs, groupés « Dimension › Objectif »
function _objectiveOptions(selectedId) {
  return DIMENSIONS.map(dim => {
    const roots = getRoadmapRoots().filter(r => r.category === dim.key);
    if (!roots.length) return '';
    const opts = roots.map(root => {
      const children = getRoadmapChildren(root.id);
      return [
        `<option value="${root.id}" ${selectedId === root.id ? 'selected' : ''}>${_esc(root.title)}</option>`,
        ...children.map(c => `<option value="${c.id}" ${selectedId === c.id ? 'selected' : ''}>&nbsp;&nbsp;↳ ${_esc(c.title)}</option>`),
      ].join('');
    }).join('');
    return `<optgroup label="${_esc(dim.label)}">${opts}</optgroup>`;
  }).join('');
}

function _bindEditor(container) {
  const go = () => renderDeliverables(container);
  const d = () => getDeliverableById(_editingId);

  container.querySelector('#dlv-back').addEventListener('click', () => { _mode = 'list'; go(); });

  // Auto-save débounce, comme l'édition de sections dans ideas.js
  const ta = container.querySelector('#dlv-md');
  const preview = container.querySelector('#dlv-preview');
  const pos = container.querySelector('#dlv-pos');
  const savedFlag = container.querySelector('#dlv-saved');

  const refreshPreview = () => {
    const slides = splitSlides(ta.value);
    if (_slideIndex >= slides.length) _slideIndex = Math.max(0, slides.length - 1);
    preview.innerHTML = `<div class="slide-canvas">${_mdSafe(slides[_slideIndex] || '')}</div>`;
    pos.textContent = slides.length ? `slide ${_slideIndex + 1} / ${slides.length}` : 'aucune slide';
    container.querySelector('#dlv-pitch-action').innerHTML = _pitchButtonHTML(_editingId, _slideIndex, slides.length);
    _bindPitchAction(container);
  };

  const persist = () => {
    saveDeliverable({ ...d(), markdown: ta.value });
    savedFlag.textContent = ' · enregistré';
    setTimeout(() => { savedFlag.textContent = ''; }, 1200);
  };

  ta.addEventListener('input', () => {
    refreshPreview();
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(persist, 900);
  });
  ta.addEventListener('blur', () => { clearTimeout(_saveTimer); persist(); });

  container.querySelector('#dlv-prev').addEventListener('click', () => {
    if (_slideIndex > 0) { _slideIndex--; refreshPreview(); }
  });
  container.querySelector('#dlv-next').addEventListener('click', () => {
    if (_slideIndex < splitSlides(ta.value).length - 1) { _slideIndex++; refreshPreview(); }
  });

  const title = container.querySelector('#dlv-title');
  title.addEventListener('input', () => {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => saveDeliverable({ ...d(), title: title.value.trim() }), 900);
  });
  title.addEventListener('blur', () => {
    clearTimeout(_saveTimer);
    saveDeliverable({ ...d(), title: title.value.trim() });
    go();
  });

  container.querySelector('#dlv-status').addEventListener('change', e => {
    saveDeliverable({ ...d(), status: e.target.value });
    toast(e.target.value === 'final' ? 'Livrable marqué final' : 'Repassé en brouillon');
  });

  // Choisir un objectif verrouille la dimension : elle en est héritée
  container.querySelector('#dlv-obj').addEventListener('change', e => {
    saveDeliverable({ ...d(), linked_objective_id: e.target.value || null });
    go();
  });
  container.querySelector('#dlv-dim').addEventListener('change', e => {
    saveDeliverable({ ...d(), dimension: e.target.value });
    go();
  });

  container.querySelector('#dlv-present').addEventListener('click', () => presentDeliverable(_editingId));
  container.querySelector('#dlv-pdf').addEventListener('click', () => {
    const cur = d();
    printSlides(splitSlides(cur.markdown), cur.title);
  });
  container.querySelector('#dlv-delete').addEventListener('click', () => {
    const cur = d();
    confirmModal(`Supprimer le livrable « ${cur.title} » ? Ses slides seront aussi retirées du pitch.`, () => {
      deleteDeliverable(cur.id);
      _mode = 'list';
      toast('Livrable supprimé');
      go();
    });
  });

  _bindPitchAction(container);
}

function _bindPitchAction(container) {
  container.querySelector('#dlv-pitch-add')?.addEventListener('click', () => {
    addPitchSlide(_editingId, _slideIndex);
    toast('Slide ajoutée au pitch', 'success');
    container.querySelector('#dlv-pitch-action').innerHTML =
      _pitchButtonHTML(_editingId, _slideIndex, splitSlides(getDeliverableById(_editingId).markdown).length);
    _bindPitchAction(container);
  });
  container.querySelector('#dlv-pitch-remove')?.addEventListener('click', () => {
    removePitchSlideRef(_editingId, _slideIndex);
    toast('Slide retirée du pitch');
    container.querySelector('#dlv-pitch-action').innerHTML =
      _pitchButtonHTML(_editingId, _slideIndex, splitSlides(getDeliverableById(_editingId).markdown).length);
    _bindPitchAction(container);
  });
}

// ── Assembleur du pitch ──────────────────────────────────────
function _renderPitch(container) {
  const resolved = resolvePitchSlides();
  const valid = resolved.filter(s => !s.missing);

  // Couverture : purement dérivée de la dimension des livrables référencés
  const covered = new Set(valid.map(s => s.deliverable?.dimension).filter(Boolean));
  const gaps = DIMENSIONS.filter(d => !covered.has(d.key));

  container.innerHTML = `
    <div class="page-header">
      <div>
        <button class="btn btn-ghost btn-sm" id="dlv-back">← Livrables</button>
        <div class="page-title" style="margin-top:6px">Pitch deck</div>
        <div class="page-subtitle">${resolved.length} slide${resolved.length > 1 ? 's' : ''} assemblée${resolved.length > 1 ? 's' : ''} · ${covered.size}/8 dimensions couvertes</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" id="pitch-present" ${valid.length ? '' : 'disabled'}>▶ Présenter le pitch</button>
        <button class="btn btn-secondary btn-sm" id="pitch-pdf" ${valid.length ? '' : 'disabled'}>Exporter en PDF</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-title">Couverture des 8 dimensions</div>
      <div class="radar-pills">
        ${DIMENSIONS.map(d => {
          const on = covered.has(d.key);
          return `<span class="radar-pill ${on ? '' : 'pitch-gap'}" style="${on ? `border-color:${d.color}55` : ''}">
            <span class="radar-pill-dot" style="background:${on ? d.color : 'var(--border-2)'}"></span>
            <span class="radar-pill-label">${d.label}</span>
            <span class="radar-pill-score" style="color:${on ? d.color : 'var(--text-3)'}">${on ? '✓' : '—'}</span>
          </span>`;
        }).join('')}
      </div>
      ${gaps.length ? `<div class="radar-weak">⚠️ Aucune slide sur : <strong>${gaps.map(g => g.short).join(', ')}</strong></div>`
                    : `<div class="radar-weak" style="border-left-color:var(--q2)">✓ Les 8 dimensions sont couvertes.</div>`}
    </div>

    ${resolved.length ? `
      <div class="pitch-list">
        ${resolved.map((s, i) => _pitchRowHTML(s, i, resolved.length)).join('')}
      </div>`
    : `<div class="empty-state">
        <p>Aucune slide dans le pitch.</p>
        <p style="margin-top:8px">Depuis l'aperçu d'un livrable, utilise « + Ajouter au pitch » pour composer ta présentation.</p>
      </div>`}
  `;

  _bindPitch(container);
}

function _pitchRowHTML(s, i, total) {
  if (s.missing) {
    return `
      <div class="pitch-row pitch-row-missing">
        <span class="pitch-num">${i + 1}</span>
        <div class="pitch-body">
          <div class="pitch-title">Slide manquante</div>
          <div class="pitch-src">${s.deliverable
            ? `« ${_esc(s.deliverable.title)} » n'a plus de slide ${s.slide_index + 1}`
            : 'Le livrable d\'origine a été supprimé'}</div>
        </div>
        <div class="pitch-actions">
          <button class="btn btn-danger btn-sm" data-prm="${i}">Retirer</button>
        </div>
      </div>`;
  }
  const dim = getDimension(s.deliverable.dimension);
  return `
    <div class="pitch-row">
      <span class="pitch-num">${i + 1}</span>
      <div class="pitch-body">
        <div class="pitch-title">${_esc(_slideTitle(s.markdown))}</div>
        <div class="pitch-src">
          <span class="dlv-dim" style="background:${dim.color}1a;color:${dim.color}">${dim.label}</span>
          ${_esc(s.deliverable.title)} · slide ${s.slide_index + 1}
        </div>
      </div>
      <div class="pitch-actions">
        <button class="ach-child-btn" data-pmv="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} title="Monter">↑</button>
        <button class="ach-child-btn" data-pmv="${i}" data-dir="1" ${i === total - 1 ? 'disabled' : ''} title="Descendre">↓</button>
        <button class="ach-child-btn ach-child-del" data-prm="${i}" title="Retirer du pitch">✕</button>
      </div>
    </div>`;
}

// Première ligne de titre markdown, sinon début du texte
function _slideTitle(md) {
  const heading = (md || '').split('\n').find(l => /^#{1,3}\s/.test(l.trim()));
  if (heading) return heading.replace(/^#{1,3}\s*/, '').trim();
  const first = (md || '').split('\n').map(l => l.trim()).find(Boolean) || 'Slide';
  return first.length > 70 ? first.slice(0, 70) + '…' : first;
}

function _bindPitch(container) {
  const go = () => renderDeliverables(container);
  container.querySelector('#dlv-back').addEventListener('click', () => { _mode = 'list'; go(); });

  container.querySelectorAll('[data-pmv]').forEach(btn => {
    btn.addEventListener('click', () => { movePitchSlide(Number(btn.dataset.pmv), Number(btn.dataset.dir)); go(); });
  });
  container.querySelectorAll('[data-prm]').forEach(btn => {
    btn.addEventListener('click', () => { removePitchSlide(Number(btn.dataset.prm)); toast('Slide retirée du pitch'); go(); });
  });

  container.querySelector('#pitch-present')?.addEventListener('click', () => {
    const slides = resolvePitchSlides().filter(s => !s.missing).map(s => s.markdown);
    startPresentation(slides, 'Pitch deck');
  });
  container.querySelector('#pitch-pdf')?.addEventListener('click', () => {
    const slides = resolvePitchSlides().filter(s => !s.missing).map(s => s.markdown);
    printSlides(slides, 'Pitch deck');
  });
}

// ── Mode présentation ────────────────────────────────────────
export function presentDeliverable(id) {
  const d = getDeliverableById(id);
  if (!d) { toast('Livrable introuvable', 'error'); return; }
  const slides = splitSlides(d.markdown);
  if (!slides.length) { toast('Ce livrable ne contient aucune slide', 'error'); return; }
  startPresentation(slides, d.title);
}

export function startPresentation(slides, title = '') {
  if (!slides.length) return;
  let idx = 0;

  const overlay = document.createElement('div');
  overlay.className = 'present-overlay';
  overlay.innerHTML = `
    <div class="present-stage">
      <div class="slide-frame present-frame"><div class="slide-canvas" id="present-canvas"></div></div>
    </div>
    <div class="present-bar">
      <span class="present-title">${_esc(title)}</span>
      <div class="present-nav">
        <button class="dlv-nav-btn" id="present-prev" title="Précédente (←)">‹</button>
        <span class="present-pos" id="present-pos"></span>
        <button class="dlv-nav-btn" id="present-next" title="Suivante (→)">›</button>
      </div>
      <button class="btn btn-ghost btn-sm" id="present-close">Échap · Quitter</button>
    </div>
    <div class="present-progress"><div class="present-progress-fill" id="present-fill"></div></div>
  `;
  document.body.appendChild(overlay);

  const canvas = overlay.querySelector('#present-canvas');
  const posEl  = overlay.querySelector('#present-pos');
  const fill   = overlay.querySelector('#present-fill');

  const draw = () => {
    canvas.innerHTML = _mdSafe(slides[idx]);
    posEl.textContent = `${idx + 1} / ${slides.length}`;
    fill.style.width = `${((idx + 1) / slides.length) * 100}%`;
  };
  const move = step => {
    const next = idx + step;
    if (next >= 0 && next < slides.length) { idx = next; draw(); }
  };
  const close = () => {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  };
  function onKey(e) {
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Escape') close();
  }

  overlay.querySelector('#present-prev').addEventListener('click', () => move(-1));
  overlay.querySelector('#present-next').addEventListener('click', () => move(1));
  overlay.querySelector('#present-close').addEventListener('click', close);
  document.addEventListener('keydown', onKey);

  // Le plein écran peut être refusé (hors geste utilisateur) : la superposition
  // reste pleinement utilisable dans ce cas.
  overlay.requestFullscreen?.().catch(() => {});
  draw();
  return { close, next: () => move(1), prev: () => move(-1), current: () => idx };
}

// ── Export PDF via l'impression navigateur ───────────────────
// Pas de librairie : une feuille @media print met une slide par page paysage.
export function printSlides(slides, title = '') {
  if (!slides.length) { toast('Rien à exporter', 'error'); return; }
  document.getElementById('print-root')?.remove();

  const root = document.createElement('div');
  root.id = 'print-root';
  root.innerHTML = slides.map(md => `
    <section class="print-slide"><div class="slide-canvas">${_mdSafe(md)}</div></section>
  `).join('');
  document.body.appendChild(root);
  document.body.classList.add('is-printing');

  const cleanup = () => {
    document.body.classList.remove('is-printing');
    root.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
  // Filet de sécurité si afterprint ne se déclenche pas (certains navigateurs)
  setTimeout(() => { if (document.getElementById('print-root')) cleanup(); }, 60000);
}

// ── Helpers ──────────────────────────────────────────────────
function _esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// marked rend le HTML brut tel quel : on assainit le résultat avant insertion
// pour qu'un <script> ou un onclick collé depuis ailleurs ne s'exécute pas.
const _FORBIDDEN = ['script', 'iframe', 'object', 'embed', 'link', 'meta', 'style', 'form', 'base'];

function _mdSafe(md) {
  if (!md || !md.trim()) return '';
  const html = window.marked ? window.marked.parse(md) : `<pre>${_esc(md)}</pre>`;
  const tpl = document.createElement('div');
  tpl.innerHTML = html;
  tpl.querySelectorAll(_FORBIDDEN.join(',')).forEach(n => n.remove());
  tpl.querySelectorAll('*').forEach(node => {
    [...node.attributes].forEach(attr => {
      const name = attr.name.toLowerCase();
      const value = (attr.value || '').replace(/\s/g, '').toLowerCase();
      if (name.startsWith('on')) node.removeAttribute(attr.name);
      else if ((name === 'href' || name === 'src') && value.startsWith('javascript:')) node.removeAttribute(attr.name);
    });
  });
  return tpl.innerHTML;
}
