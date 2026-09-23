/* ============================================================
   FOUNDER OS — Roadmap : objectifs par dimension + sous-objectifs
   ============================================================ */

import {
  DIMENSIONS, getDimension, getRoadmap, getRoadmapRoots, getRoadmapChildren,
  getRoadmapItemById, saveRoadmapItem, deleteRoadmapItem, toggleRoadmapChild,
  getTaskBySubgoalId, saveTask,
  getDeliverableForObjective, saveDeliverable,
  openModal, closeModal, confirmModal, toast, uid, todayStr,
} from './core.js';
import { renderRadar } from './radar.js';
import { exportObjectives, openImportModal } from './roadmap-io.js';
import { presentDeliverable, openDeliverable } from './deliverables.js';

let _filterDim = 'all';
// Cartes dont la liste de sous-objectifs a été dépliée à la main
const _expanded = new Set();

export function renderRoadmap(container) {
  const roots = getRoadmapRoots();
  const done  = roots.filter(i => i.completed).length;
  const total = roots.length;

  // XP calculé sur les racines uniquement : un sous-objectif alimente la
  // progression partielle de son parent, il ne rapporte pas d'XP à part.
  const xp = roots.reduce((s, i) => {
    if (i.completed) return s + 100;
    if (i.target > 0) return s + Math.floor((Math.min(i.progress, i.target) / i.target) * 80);
    return s;
  }, 0);
  const maxXP     = total * 100;
  const level     = Math.floor(xp / 300) + 1;
  const pctGlobal = maxXP > 0 ? Math.round((xp / maxXP) * 100) : 0;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Roadmap</div>
        <div class="page-subtitle">${done}/${total} objectifs validés · ${xp}&thinsp;XP · Niveau&nbsp;${level}</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" id="rm-import-btn">Importer</button>
        <button class="btn btn-secondary btn-sm" id="rm-export-btn">Exporter</button>
        <button class="btn btn-primary" id="add-obj-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nouvel objectif
        </button>
      </div>
    </div>

    <div id="rm-radar-slot"></div>

    <div class="card rm-xp-card">
      <div class="rm-xp-header">
        <div style="display:flex;align-items:center;gap:10px">
          <span class="rm-level-badge">Niv.&nbsp;${level}</span>
          <span class="rm-xp-label">${xp}&thinsp;XP sur ${maxXP}&thinsp;XP</span>
        </div>
        <span class="rm-xp-pct">${pctGlobal}% complété</span>
      </div>
      <div class="rm-track-wrap">
        <div class="rm-track-fill" style="width:${pctGlobal}%"></div>
      </div>
    </div>

    <div class="filter-bar">
      <span style="font-size:.8rem;color:var(--text-3);font-weight:600">Dimension :</span>
      <button class="filter-chip ${_filterDim === 'all' ? 'active' : ''}" data-fdim="all">Toutes</button>
      ${DIMENSIONS.map(d => `
        <button class="filter-chip ${_filterDim === d.key ? 'active' : ''}" data-fdim="${d.key}">${d.label}</button>
      `).join('')}
    </div>

    <div id="rm-groups">
      ${DIMENSIONS.filter(d => _filterDim === 'all' || _filterDim === d.key)
                  .map(d => _groupHTML(d, roots)).join('')}
    </div>
  `;

  // Cliquer une pastille du radar filtre directement la dimension correspondante
  renderRadar(container.querySelector('#rm-radar-slot'), dim => {
    _filterDim = dim;
    renderRoadmap(container);
  });
  _bind(container);
}

// ── Groupe de dimension ──────────────────────────────────────
function _groupHTML(dim, roots) {
  const items = roots.filter(i => i.category === dim.key);
  const done  = items.filter(i => i.completed).length;

  const body = items.length
    ? `<div class="achievement-grid">${items.map(_achCard).join('')}</div>`
    : `<div class="rm-group-empty">Aucun objectif sur cette dimension — c'est un angle mort.</div>`;

  return `
    <div class="rm-group">
      <div class="rm-group-head" style="border-left-color:${dim.color}">
        <span class="rm-group-dot" style="background:${dim.color}"></span>
        <span class="rm-group-label">${dim.label}</span>
        <span class="rm-group-count">${done}/${items.length}</span>
        <button class="btn btn-ghost btn-sm rm-group-add" data-addin="${dim.key}" title="Ajouter un objectif dans ${dim.label}">+</button>
      </div>
      ${body}
    </div>`;
}

// ── Carte d'objectif racine ──────────────────────────────────
function _achCard(item) {
  const children = getRoadmapChildren(item.id);
  const hasKids  = children.length > 0;
  const col      = getDimension(item.category).color;

  const pct = item.target > 0
    ? Math.min(Math.round((item.progress / item.target) * 100), 100)
    : (item.completed ? 100 : 0);

  const statusBadge = item.completed
    ? `<span class="ach-badge ach-done">✓ Validé</span>`
    : item.progress > 0
      ? `<span class="ach-badge ach-wip">En cours</span>`
      : `<span class="ach-badge ach-todo">À faire</span>`;

  const progressHTML = (hasKids || item.target > 1 || (item.target === 1 && !item.completed)) ? `
    <div class="ach-progress-row">
      <div class="ach-track">
        <div class="ach-fill ${item.completed ? 'ach-fill-done' : ''}" style="width:${pct}%;${item.completed ? '' : `background:${col}`}"></div>
      </div>
      <span class="ach-prog-lbl">${item.progress}/${item.target}</span>
    </div>` : '';

  // Repliés par défaut au-delà de 4 sous-objectifs, pour garder la roadmap lisible
  const collapsed = hasKids && children.length > 4 && !_expanded.has(item.id);
  const childrenHTML = hasKids ? `
    <div class="ach-children">
      ${children.length > 4 ? `
        <button class="ach-children-toggle" data-toggle="${item.id}">
          ${collapsed ? '▸' : '▾'} ${children.length} sous-objectifs · ${children.filter(c => c.completed).length}/${children.length}
        </button>` : ''}
      <div class="ach-child-list ${collapsed ? 'hidden' : ''}">
        ${children.map((c, i) => _childHTML(c, i, children.length)).join('')}
      </div>
    </div>` : '';

  // Un objectif à enfants se valide par ses enfants : pas de +1 ni de validation directe
  const actionsHTML = hasKids
    ? `<div class="ach-actions"><span class="ach-derived-lbl">Progression dérivée des sous-objectifs</span></div>`
    : !item.completed ? `
      <div class="ach-actions">
        ${item.target > 1 ? `<button class="btn btn-sm btn-secondary ach-inc" data-id="${item.id}">+1</button>` : ''}
        <button class="btn btn-sm ach-validate" data-id="${item.id}">✓ Valider</button>
      </div>` : `
      <div class="ach-actions">
        <span class="ach-completed-lbl">🏆 Objectif atteint</span>
      </div>`;

  return `
    <div class="achievement-card ${item.completed ? 'ach-card-done' : item.progress > 0 ? 'ach-card-wip' : ''}" data-id="${item.id}">
      <div class="ach-top">
        <div class="ach-icon-wrap" style="background:${col}1a;border-color:${col}40">
          <span class="ach-icon">${item.icon || '🎯'}</span>
        </div>
        <div class="ach-meta">
          <span class="ach-cat" style="color:${col}">${getDimension(item.category).label}</span>
          ${statusBadge}
        </div>
      </div>
      <div class="ach-title">${item.title}</div>
      ${item.description ? `<div class="ach-desc">${item.description}</div>` : ''}
      ${progressHTML}
      ${childrenHTML}
      ${actionsHTML}
      <div class="ach-foot">
        <button class="btn btn-ghost btn-sm ach-add-child" data-addchild="${item.id}">+ sous-objectif</button>
        ${_deliverableRootAction(item.id)}
      </div>
    </div>`;
}

// ── Pont avec les livrables ──────────────────────────────────
// La résolution objectif → livrable vit dans core.js : les deux vues
// appellent la même fonction plutôt que de dupliquer la recherche.
function _deliverableRootAction(objId) {
  const dlv = getDeliverableForObjective(objId);
  return dlv
    ? `<button class="btn btn-ghost btn-sm ach-slides" data-slides="${dlv.id}" title="Ouvrir « ${_attr(dlv.title)} » en présentation">📊 Voir les slides</button>`
    : `<button class="btn btn-ghost btn-sm ach-add-dlv" data-adddlv="${objId}" title="Créer un livrable pour cet objectif">+ Livrable</button>`;
}

function _deliverableBadge(objId) {
  const dlv = getDeliverableForObjective(objId);
  return dlv ? `<span class="ach-child-dlv" title="Livrable : ${_attr(dlv.title)}">📊</span>` : '';
}

function _deliverableButton(objId) {
  const dlv = getDeliverableForObjective(objId);
  return dlv
    ? `<button class="ach-child-btn" data-slides="${dlv.id}" title="Voir les slides">📊</button>`
    : `<button class="ach-child-btn" data-adddlv="${objId}" title="Créer un livrable">+ 📊</button>`;
}

function _childHTML(child, idx, total) {
  // Badge si une tâche existe déjà, bouton de création sinon — jamais les deux
  const linked = getTaskBySubgoalId(child.id);
  return `
    <div class="ach-child ${child.completed ? 'ach-child-done' : ''}" data-child="${child.id}">
      <div class="ach-child-check ${child.completed ? 'checked' : ''}" data-childcheck="${child.id}">
        ${child.completed ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
      </div>
      <span class="ach-child-title" title="${child.description || ''}">${child.title}</span>
      ${linked ? `<span class="ach-child-linked" title="Une tâche liée existe déjà">→ dans Tâches</span>` : ''}
      ${_deliverableBadge(child.id)}
      <div class="ach-child-actions">
        ${_deliverableButton(child.id)}
        ${linked ? '' : `<button class="ach-child-btn ach-child-totask" data-childtask="${child.id}" title="Créer une tâche à partir de ce sous-objectif">→ tâche</button>`}
        <button class="ach-child-btn" data-childmove="${child.id}" data-dir="-1" ${idx === 0 ? 'disabled' : ''} title="Monter">↑</button>
        <button class="ach-child-btn" data-childmove="${child.id}" data-dir="1" ${idx === total - 1 ? 'disabled' : ''} title="Descendre">↓</button>
        <button class="ach-child-btn ach-child-del" data-childdel="${child.id}" title="Supprimer">✕</button>
      </div>
    </div>`;
}

// ── Événements ───────────────────────────────────────────────
function _bind(container) {
  const rerender = () => renderRoadmap(container);

  container.querySelector('#add-obj-btn')?.addEventListener('click', () => _openObjModal(null, container));
  container.querySelector('#rm-export-btn')?.addEventListener('click', exportObjectives);
  // Le radar se redessine avec la roadmap : les scores changent mécaniquement
  container.querySelector('#rm-import-btn')?.addEventListener('click', () => openImportModal(rerender));

  container.querySelectorAll('[data-fdim]').forEach(btn => {
    btn.addEventListener('click', () => { _filterDim = btn.dataset.fdim; rerender(); });
  });

  container.querySelectorAll('[data-addin]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      _openObjModal(null, container, btn.dataset.addin);
    });
  });

  container.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.toggle;
      if (_expanded.has(id)) _expanded.delete(id); else _expanded.add(id);
      rerender();
    });
  });

  container.querySelectorAll('[data-addchild]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      _openChildModal(null, btn.dataset.addchild, container);
    });
  });

  container.querySelectorAll('[data-childcheck]').forEach(box => {
    box.addEventListener('click', e => {
      e.stopPropagation();
      const child = getRoadmapItemById(box.dataset.childcheck);
      toggleRoadmapChild(box.dataset.childcheck);
      const parent = child ? getRoadmapItemById(child.parent_id) : null;
      if (parent && parent.completed) toast(`🏆 "${parent.title}" validé !`, 'success');
      rerender();
    });
  });

  // Voir les slides : ouvre directement la présentation du livrable lié
  container.querySelectorAll('[data-slides]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      presentDeliverable(btn.dataset.slides);
    });
  });

  // Créer un livrable pré-rempli, puis basculer sur la vue Livrables
  container.querySelectorAll('[data-adddlv]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const obj = getRoadmapItemById(btn.dataset.adddlv);
      if (!obj) return;
      const dlv = saveDeliverable({
        id: null, title: obj.title, dimension: obj.category,
        linked_objective_id: obj.id,
        markdown: `# ${obj.title}\n\n${obj.description || 'Le résultat de cet objectif.'}\n`,
        status: 'draft', order: 0, updated: todayStr(),
      });
      openDeliverable(dlv.id);
      toast('Livrable créé', 'success');
      btn.dispatchEvent(new CustomEvent('navigate', { detail: 'deliverables', bubbles: true }));
    });
  });

  container.querySelectorAll('[data-childtask]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      _openLinkTaskModal(btn.dataset.childtask, container);
    });
  });

  container.querySelectorAll('[data-childmove]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      _moveChild(btn.dataset.childmove, Number(btn.dataset.dir));
      rerender();
    });
  });

  container.querySelectorAll('[data-childdel]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const child = getRoadmapItemById(btn.dataset.childdel);
      if (!child) return;
      confirmModal(`Supprimer le sous-objectif "${child.title}" ?`, () => {
        deleteRoadmapItem(child.id);
        toast('Sous-objectif supprimé');
        rerender();
      });
    });
  });

  container.querySelectorAll('.ach-child-title').forEach(lbl => {
    lbl.addEventListener('click', e => {
      e.stopPropagation();
      const id = lbl.closest('[data-child]').dataset.child;
      const child = getRoadmapItemById(id);
      if (child) _openChildModal(child, child.parent_id, container);
    });
  });

  container.querySelectorAll('.achievement-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.ach-inc, .ach-validate, .ach-children, .ach-foot')) return;
      const item = getRoadmapItemById(card.dataset.id);
      if (item) _openObjModal(item, container);
    });
  });

  container.querySelectorAll('.ach-inc').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const item = getRoadmapItemById(btn.dataset.id);
      if (!item) return;
      const newProg   = Math.min((item.progress || 0) + 1, item.target);
      const completed = newProg >= item.target;
      saveRoadmapItem({ ...item, progress: newProg, completed });
      toast(completed ? `🏆 "${item.title}" validé !` : `+1 · ${newProg}/${item.target}`, completed ? 'success' : 'default');
      rerender();
    });
  });

  container.querySelectorAll('.ach-validate').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const item = getRoadmapItemById(btn.dataset.id);
      if (!item) return;
      saveRoadmapItem({ ...item, progress: item.target, completed: true });
      toast(`🏆 "${item.title}" validé !`, 'success');
      rerender();
    });
  });
}

function _moveChild(id, dir) {
  const child = getRoadmapItemById(id);
  if (!child) return;
  const siblings = getRoadmapChildren(child.parent_id);
  const idx = siblings.findIndex(s => s.id === id);
  const swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= siblings.length) return;
  const other = siblings[swapIdx];
  const tmp = child.order;
  saveRoadmapItem({ ...child, order: other.order });
  saveRoadmapItem({ ...other, order: tmp });
}

// ── Modal objectif racine ────────────────────────────────────
function _openObjModal(obj, container, presetDim = null) {
  const isNew    = !obj;
  const maxOrd   = getRoadmap().length ? Math.max(...getRoadmap().map(i => i.order || 0)) : 0;
  const children = obj ? getRoadmapChildren(obj.id) : [];
  const derived  = children.length > 0;

  const o = obj || {
    id: null, title: '', description: '', target: 1, progress: 0,
    completed: false, icon: '🎯', category: presetDim || '', order: maxOrd + 1, parent_id: null,
  };

  openModal({
    title:      isNew ? 'Nouvel objectif' : 'Modifier l\'objectif',
    showDelete: !isNew,
    bodyHTML: `
      <div class="form-row" style="grid-template-columns:72px 1fr">
        <div class="form-group">
          <label class="form-label">Icône</label>
          <input class="form-input" id="o-icon" value="${o.icon || '🎯'}" style="font-size:1.3rem;text-align:center;padding:7px 4px">
        </div>
        <div class="form-group">
          <label class="form-label">Titre *</label>
          <input class="form-input" id="o-title" value="${_attr(o.title)}" placeholder="ex: 20 interviews prospects réalisées">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <input class="form-input" id="o-desc" value="${_attr(o.description)}" placeholder="Ce que cet objectif prouve concrètement…">
      </div>
      <div class="form-group">
        <label class="form-label">Dimension *</label>
        <select class="form-select" id="o-cat">
          <option value="" ${!o.category ? 'selected' : ''} disabled>— Choisir une dimension —</option>
          ${DIMENSIONS.map(d => `<option value="${d.key}" ${o.category === d.key ? 'selected' : ''}>${d.label}</option>`).join('')}
        </select>
      </div>
      ${derived ? `
        <div class="form-hint" style="background:var(--bg-2);padding:10px 12px;border-radius:var(--radius-sm);margin-bottom:16px">
          Progression pilotée par les ${children.length} sous-objectifs
          (${children.filter(c => c.completed).length}/${children.length} validés) — non modifiable à la main.
        </div>` : `
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Objectif chiffré</label>
            <input class="form-input" id="o-target" type="number" min="1" value="${o.target}">
          </div>
          <div class="form-group">
            <label class="form-label">Progression actuelle</label>
            <input class="form-input" id="o-progress" type="number" min="0" value="${o.progress}">
          </div>
        </div>
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.88rem;color:var(--text-2)">
            <input type="checkbox" id="o-done" ${o.completed ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;accent-color:var(--accent)">
            Marquer comme validé
          </label>
        </div>`}`,
    onSave: () => {
      const title = document.getElementById('o-title').value.trim();
      if (!title) { toast('Le titre est requis', 'error'); return; }
      const category = document.getElementById('o-cat').value;
      if (!category) { toast('La dimension est requise', 'error'); return; }

      const patch = {
        ...o,
        id: o.id || uid('rm'),
        title,
        description: document.getElementById('o-desc').value.trim(),
        icon:        document.getElementById('o-icon').value.trim() || '🎯',
        category,
        parent_id:   null,
      };

      if (!derived) {
        const target    = Math.max(1, Number(document.getElementById('o-target').value) || 1);
        const progress  = Math.min(Number(document.getElementById('o-progress').value) || 0, target);
        const completed = document.getElementById('o-done').checked || progress >= target;
        patch.target    = target;
        patch.progress  = completed ? target : progress;
        patch.completed = completed;
      }

      saveRoadmapItem(patch);
      closeModal();
      toast(isNew ? 'Objectif ajouté' : 'Objectif mis à jour', 'success');
      renderRoadmap(container);
    },
    onDelete: () => {
      closeModal();
      const warn = children.length
        ? `Supprimer "${o.title}" et ses ${children.length} sous-objectif${children.length > 1 ? 's' : ''} ?`
        : `Supprimer "${o.title}" ?`;
      confirmModal(warn, () => {
        deleteRoadmapItem(o.id);
        toast('Objectif supprimé');
        renderRoadmap(container);
      });
    },
  });
}

// ── Modal sous-objectif ──────────────────────────────────────
// Pas de dimension ni d'objectif chiffré : un sous-objectif hérite de son parent
// et vaut 1 case à cocher.
function _openChildModal(child, parentId, container) {
  const isNew    = !child;
  const parent   = getRoadmapItemById(parentId);
  if (!parent) return;
  const siblings = getRoadmapChildren(parentId);
  const maxOrd   = siblings.length ? Math.max(...siblings.map(s => s.order || 0)) : 0;

  const c = child || {
    id: null, title: '', description: '', target: 1, progress: 0,
    completed: false, icon: '', category: parent.category, order: maxOrd + 1, parent_id: parentId,
  };

  openModal({
    title:      isNew ? 'Nouveau sous-objectif' : 'Modifier le sous-objectif',
    showDelete: !isNew,
    bodyHTML: `
      <div class="form-hint" style="margin-bottom:14px">
        Rattaché à <strong>${_attr(parent.title)}</strong> · dimension ${getDimension(parent.category).label} (héritée)
      </div>
      <div class="form-group">
        <label class="form-label">Titre *</label>
        <input class="form-input" id="c-title" value="${_attr(c.title)}" placeholder="ex: Écrire le guide d'entretien">
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <input class="form-input" id="c-desc" value="${_attr(c.description)}" placeholder="Facultatif">
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.88rem;color:var(--text-2)">
          <input type="checkbox" id="c-done" ${c.completed ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;accent-color:var(--accent)">
          Marquer comme validé
        </label>
      </div>`,
    onSave: () => {
      const title = document.getElementById('c-title').value.trim();
      if (!title) { toast('Le titre est requis', 'error'); return; }
      const completed = document.getElementById('c-done').checked;
      saveRoadmapItem({
        ...c,
        id: c.id || uid('rm'),
        title,
        description: document.getElementById('c-desc').value.trim(),
        completed,
        progress: completed ? 1 : 0,
        target: 1,
        parent_id: parentId,
      });
      closeModal();
      _expanded.add(parentId);
      toast(isNew ? 'Sous-objectif ajouté' : 'Sous-objectif mis à jour', 'success');
      renderRoadmap(container);
    },
    onDelete: () => {
      closeModal();
      confirmModal(`Supprimer "${c.title}" ?`, () => {
        deleteRoadmapItem(c.id);
        toast('Sous-objectif supprimé');
        renderRoadmap(container);
      });
    },
  });
}

// ── Sous-objectif → tâche ────────────────────────────────────
// Le titre vient du sous-objectif : il n'y a que le quadrant et le quick win à
// choisir. La tâche créée reste liée, donc la cocher validera le sous-objectif.
function _openLinkTaskModal(subgoalId, container) {
  const child = getRoadmapItemById(subgoalId);
  if (!child) return;
  const parent = getRoadmapItemById(child.parent_id);
  const dim = getDimension(child.category);

  openModal({
    title: 'Créer une tâche',
    saveLabel: 'Créer la tâche',
    bodyHTML: `
      <div class="io-summary" style="margin-bottom:16px">
        <span class="io-stat" style="background:${dim.color}1a;color:${dim.color}">${dim.label}</span>
      </div>
      <div class="form-group">
        <label class="form-label">Tâche</label>
        <div class="lt-title">${child.title}</div>
        ${parent ? `<div class="form-hint">Sous-objectif de « ${parent.title} »</div>` : ''}
      </div>
      <div class="form-group">
        <label class="form-label">Quadrant</label>
        <select class="form-select" id="lt-quadrant">
          <option value="Q2" selected>Q2 — Important, pas urgent</option>
          <option value="Q1">Q1 — Urgent + Important</option>
          <option value="Q3">Q3 — Urgent, pas important</option>
          <option value="Q4">Q4 — Ni urgent ni important</option>
        </select>
      </div>
      <div class="form-group">
        <label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer">
          <input type="checkbox" id="lt-quickwin" style="width:16px;height:16px;margin-top:2px">
          <span>
            <span class="form-label" style="margin:0">⚡ Quick win</span>
            <span class="form-hint" style="margin-top:2px">Moins de 15 min, sans dépendance à un tiers.</span>
          </span>
        </label>
      </div>
      <div class="form-hint">
        Cocher cette tâche validera le sous-objectif, et inversement.
      </div>`,
    onSave: () => {
      saveTask({
        id: uid('t'),
        title: child.title,
        quadrant: document.getElementById('lt-quadrant').value,
        done: child.completed,
        recurrence: 'none', weekdays: [], completions: [],
        quickwin: document.getElementById('lt-quickwin').checked,
        linked_subgoal_id: child.id,
      });
      closeModal();
      toast('Tâche créée et liée à la roadmap', 'success');
      renderRoadmap(container);
    },
  });
}

function _attr(str) {
  return (str || '').replace(/"/g, '&quot;');
}
