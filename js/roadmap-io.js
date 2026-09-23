/* ============================================================
   FOUNDER OS — Import / export des objectifs de roadmap
   Deux formats : JSON (aller-retour fidèle) et texte ligne à ligne
   (écriture rapide, génération par un LLM).
   ============================================================ */

import {
  DIMENSIONS, normalizeDimension, getRoadmap, getRoadmapRoots, getRoadmapChildren,
  replaceRoadmap, openModal, closeModal, confirmModal, toast, uid, todayStr,
} from './core.js';

const FIELDS = ['id', 'title', 'description', 'target', 'progress', 'completed', 'icon', 'category', 'order'];

// ── Export ───────────────────────────────────────────────────
// Uniquement la roadmap, enfants imbriqués sous leur parent : plus lisible
// à relire et plus simple à régénérer qu'un parent_id à plat.
export function exportObjectives() {
  const roadmap = getRoadmapRoots().map(root => ({
    ..._pick(root),
    children: getRoadmapChildren(root.id).map(c => _pick(c, ['id', 'title', 'description', 'completed', 'order'])),
  }));
  const blob = new Blob([JSON.stringify({ roadmap }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `founder-os-objectifs-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`${roadmap.length} objectif${roadmap.length > 1 ? 's' : ''} exporté${roadmap.length > 1 ? 's' : ''}`, 'success');
}

function _pick(obj, fields = FIELDS) {
  const out = {};
  fields.forEach(f => { if (obj[f] !== undefined) out[f] = obj[f]; });
  return out;
}

// ── Parsing ──────────────────────────────────────────────────
// Retourne { roots, errors } — jamais d'exception : une ligne fautive est une
// erreur listée, pas un plantage qui bloquerait tout l'import.
export function parseObjectives(raw) {
  const text = (raw || '').trim();
  if (!text) return { roots: [], errors: [{ line: 0, reason: 'Contenu vide' }] };
  return (text[0] === '{' || text[0] === '[') ? _parseJSON(text) : _parseText(text);
}

function _parseJSON(text) {
  const errors = [];
  let data;
  try { data = JSON.parse(text); }
  catch (e) { return { roots: [], errors: [{ line: 0, reason: 'JSON invalide : ' + e.message }] }; }

  const list = Array.isArray(data) ? data : Array.isArray(data.roadmap) ? data.roadmap : null;
  if (!list) return { roots: [], errors: [{ line: 0, reason: 'Format attendu : un tableau, ou un objet { "roadmap": [...] }' }] };

  const roots = [];
  list.forEach((item, i) => {
    const pos = i + 1;
    const title = (item.title || '').toString().trim();
    if (!title) { errors.push({ line: pos, reason: 'Titre vide' }); return; }
    const category = normalizeDimension(item.category);
    if (!category) { errors.push({ line: pos, reason: `Dimension inconnue : "${item.category ?? ''}"` }); return; }

    const target = item.target === undefined || item.target === '' ? 1 : Number(item.target);
    if (!Number.isFinite(target) || target < 1) { errors.push({ line: pos, reason: `Objectif chiffré non numérique : "${item.target}"` }); return; }

    const children = [];
    (Array.isArray(item.children) ? item.children : []).forEach((c, ci) => {
      const ct = (c.title || '').toString().trim();
      if (!ct) { errors.push({ line: pos, reason: `Sous-objectif ${ci + 1} sans titre` }); return; }
      children.push({
        id: c.id || null, title: ct,
        description: (c.description || '').toString().trim(),
        completed: !!c.completed,
      });
    });

    roots.push({
      id: item.id || null, title, category, target,
      description: (item.description || '').toString().trim(),
      icon: (item.icon || '🎯').toString(),
      progress: Number(item.progress) || 0,
      completed: !!item.completed,
      children,
    });
  });

  return { roots, errors };
}

function _parseText(text) {
  const roots = [];
  const errors = [];
  let lastRoot = null;

  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\r$/, '');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const pos = i + 1;

    // Une ligne indentée et/ou préfixée par « - » est un sous-objectif
    const isChild = /^[ \t]+/.test(line) || /^-/.test(trimmed);

    if (isChild) {
      if (!lastRoot) { errors.push({ line: pos, reason: 'Sous-objectif sans objectif parent au-dessus' }); return; }
      const content = trimmed.replace(/^-+\s*/, '');
      const [title, description = ''] = content.split('|').map(s => s.trim());
      if (!title) { errors.push({ line: pos, reason: 'Titre de sous-objectif vide' }); return; }
      lastRoot.children.push({ id: null, title, description, completed: false });
      return;
    }

    const parts = trimmed.split('|').map(s => s.trim());
    if (parts.length < 2) { errors.push({ line: pos, reason: 'Format attendu : dimension | titre [| description [| objectif chiffré]]' }); return; }

    const category = normalizeDimension(parts[0]);
    if (!category) { errors.push({ line: pos, reason: `Dimension inconnue : "${parts[0]}"` }); return; }
    const title = parts[1];
    if (!title) { errors.push({ line: pos, reason: 'Titre vide' }); return; }

    let target = 1;
    if (parts[3]) {
      target = Number(parts[3]);
      if (!Number.isFinite(target) || target < 1) { errors.push({ line: pos, reason: `Objectif chiffré non numérique : "${parts[3]}"` }); return; }
    }

    lastRoot = {
      id: null, title, category, target,
      description: parts[2] || '', icon: '🎯',
      progress: 0, completed: false, children: [],
    };
    roots.push(lastRoot);
  });

  return { roots, errors };
}

// ── Rapprochement avec l'existant ────────────────────────────
const _key = str => (str || '').toString()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

// Calcule ce que l'import ferait, sans rien écrire.
export function analyzeImport(roots, mode) {
  if (mode === 'replace') {
    const kids = roots.reduce((s, r) => s + r.children.length, 0);
    return { created: roots.length + kids, updated: 0, replaced: getRoadmap().length };
  }
  const existingRoots = getRoadmapRoots();
  let created = 0, updated = 0;
  roots.forEach(r => {
    const match = _findMatch(r, existingRoots);
    if (match) {
      updated++;
      const existingKids = getRoadmapChildren(match.id);
      r.children.forEach(c => { _findMatch(c, existingKids) ? updated++ : created++; });
    } else {
      created += 1 + r.children.length;
    }
  });
  return { created, updated, replaced: 0 };
}

function _findMatch(item, pool) {
  if (item.id) {
    const byId = pool.find(p => p.id === item.id);
    if (byId) return byId;
  }
  return pool.find(p => _key(p.title) === _key(item.title)) || null;
}

// ── Application ──────────────────────────────────────────────
// En fusion, la progression acquise n'est jamais écrasée : un objectif déjà
// suivi conserve progress/completed, seuls ses métadonnées sont mises à jour.
export function applyImport(roots, mode) {
  const out = [];
  let order = 1;

  if (mode === 'replace') {
    roots.forEach(r => {
      const rootId = r.id || uid('rm');
      const hasKids = r.children.length > 0;
      out.push({
        id: rootId, title: r.title, description: r.description,
        target: hasKids ? r.children.length : r.target,
        progress: hasKids ? 0 : (r.progress || 0),
        completed: hasKids ? false : !!r.completed,
        icon: r.icon || '🎯', category: r.category, order: order++, parent_id: null,
      });
      r.children.forEach(c => {
        out.push({
          id: c.id || uid('rm'), title: c.title, description: c.description || '',
          target: 1, progress: c.completed ? 1 : 0, completed: !!c.completed,
          icon: '', category: r.category, order: order++, parent_id: rootId,
        });
      });
    });
    replaceRoadmap(out);
    return;
  }

  // Fusion
  const existingRoots = getRoadmapRoots();
  const consumed = new Set();

  existingRoots.forEach(existing => {
    const incoming = roots.find(r => _findMatch(r, [existing]));
    const rootId = existing.id;
    if (incoming) consumed.add(incoming);

    const merged = incoming ? {
      ...existing,
      title:       incoming.title,
      description: incoming.description || existing.description,
      icon:        incoming.icon || existing.icon,
      category:    incoming.category,
      target:      incoming.target,
    } : { ...existing };
    merged.order = order++;
    out.push(merged);

    const existingKids = getRoadmapChildren(rootId);
    const kidsConsumed = new Set();
    existingKids.forEach(k => {
      const inc = incoming ? incoming.children.find(c => _findMatch(c, [k])) : null;
      if (inc) kidsConsumed.add(inc);
      out.push({
        ...k,
        title: inc ? inc.title : k.title,
        description: inc && inc.description ? inc.description : k.description,
        category: merged.category,
        order: order++,
      });
    });
    if (incoming) {
      incoming.children.filter(c => !kidsConsumed.has(c)).forEach(c => {
        out.push({
          id: uid('rm'), title: c.title, description: c.description || '',
          target: 1, progress: 0, completed: false,
          icon: '', category: merged.category, order: order++, parent_id: rootId,
        });
      });
    }
  });

  // Objectifs entrants sans correspondance : créés à zéro
  roots.filter(r => !consumed.has(r)).forEach(r => {
    const rootId = uid('rm');
    const hasKids = r.children.length > 0;
    out.push({
      id: rootId, title: r.title, description: r.description,
      target: hasKids ? r.children.length : r.target,
      progress: 0, completed: false,
      icon: r.icon || '🎯', category: r.category, order: order++, parent_id: null,
    });
    r.children.forEach(c => {
      out.push({
        id: uid('rm'), title: c.title, description: c.description || '',
        target: 1, progress: 0, completed: false,
        icon: '', category: r.category, order: order++, parent_id: rootId,
      });
    });
  });

  replaceRoadmap(out);
}

// ── Modale d'import ──────────────────────────────────────────
export function openImportModal(onDone) {
  openModal({
    title: 'Importer des objectifs',
    saveLabel: 'Analyser',
    bodyHTML: `
      <div class="form-group">
        <label class="form-label">Coller la liste</label>
        <textarea class="form-textarea io-textarea" id="io-text" placeholder="${_placeholder()}"></textarea>
        <div class="form-hint">
          Deux formats acceptés, détectés automatiquement : le JSON d'export, ou une ligne par objectif
          <code>dimension | titre | description | objectif chiffré</code>.
          Une ligne indentée ou préfixée par <code>-</code> devient un sous-objectif.
        </div>
      </div>
      <div class="form-group">
        <label class="btn btn-secondary btn-sm" style="cursor:pointer">
          Charger un fichier…
          <input type="file" accept=".json,.txt,.md" id="io-file" style="display:none">
        </label>
        <span class="form-hint" id="io-file-name" style="margin-left:8px"></span>
      </div>
      <div class="divider"></div>
      <div class="form-group">
        <label class="form-label">Mode</label>
        <label class="io-radio">
          <input type="radio" name="io-mode" value="merge" checked>
          <span><strong>Fusionner</strong> — met à jour les objectifs existants, ajoute les nouveaux, conserve toute progression acquise.</span>
        </label>
        <label class="io-radio">
          <input type="radio" name="io-mode" value="replace">
          <span><strong>Remplacer tout</strong> — efface la roadmap actuelle et sa progression.</span>
        </label>
      </div>`,
    onSave: () => {
      const raw  = document.getElementById('io-text').value;
      const mode = document.querySelector('input[name="io-mode"]:checked').value;
      const { roots, errors } = parseObjectives(raw);
      if (!roots.length) {
        toast(errors.length ? errors[0].reason : 'Rien à importer', 'error');
        return;
      }
      closeModal();
      _openPreview(roots, errors, mode, onDone);
    },
  });

  setTimeout(() => {
    const file = document.getElementById('io-file');
    file?.addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = ev => {
        document.getElementById('io-text').value = ev.target.result;
        document.getElementById('io-file-name').textContent = f.name;
      };
      reader.readAsText(f);
    });
  }, 0);
}

// Récapitulatif avant écriture : rien n'est appliqué tant qu'il n'est pas validé.
function _openPreview(roots, errors, mode, onDone) {
  const stats = analyzeImport(roots, mode);
  const kids  = roots.reduce((s, r) => s + r.children.length, 0);

  openModal({
    title: 'Récapitulatif de l\'import',
    saveLabel: mode === 'replace' ? 'Remplacer tout' : 'Confirmer l\'import',
    bodyHTML: `
      <div class="io-summary">
        <span class="io-stat io-stat-new">${stats.created} nouveau${stats.created > 1 ? 'x' : ''}</span>
        <span class="io-stat io-stat-upd">${stats.updated} mis à jour</span>
        <span class="io-stat ${errors.length ? 'io-stat-err' : ''}">${errors.length} ligne${errors.length > 1 ? 's' : ''} en erreur</span>
      </div>
      <div class="form-hint" style="margin-bottom:14px">
        ${roots.length} objectif${roots.length > 1 ? 's' : ''} racine${roots.length > 1 ? 's' : ''}
        ${kids ? `· ${kids} sous-objectif${kids > 1 ? 's' : ''}` : ''}
        ${mode === 'replace'
          ? `<br><strong style="color:var(--q1)">La roadmap actuelle (${stats.replaced} entrées) et sa progression seront effacées.</strong>`
          : '<br>La progression déjà acquise sera conservée.'}
      </div>
      ${errors.length ? `
        <div class="section-title">Lignes ignorées</div>
        <div class="io-errors">
          ${errors.map(e => `<div class="io-error"><span class="io-error-line">L.${e.line}</span> ${e.reason}</div>`).join('')}
        </div>` : ''}
      <div class="section-title" style="margin-top:14px">Aperçu</div>
      <div class="io-preview">
        ${roots.slice(0, 12).map(r => `
          <div class="io-prev-item">
            <span class="io-prev-dim">${(DIMENSIONS.find(d => d.key === r.category) || {}).short || r.category}</span>
            ${r.title}${r.children.length ? ` <span class="io-prev-kids">+${r.children.length}</span>` : ''}
          </div>`).join('')}
        ${roots.length > 12 ? `<div class="io-prev-more">… et ${roots.length - 12} de plus</div>` : ''}
      </div>`,
    onSave: () => {
      const run = () => {
        applyImport(roots, mode);
        closeModal();
        toast(`${stats.created} créé${stats.created > 1 ? 's' : ''} · ${stats.updated} mis à jour`, 'success');
        if (onDone) onDone();
      };
      if (mode === 'replace') {
        closeModal();
        confirmModal(
          `Remplacer toute la roadmap ? Les ${stats.replaced} entrées actuelles et leur progression seront perdues.`,
          run, 'Remplacer',
        );
      } else run();
    },
  });
}

function _placeholder() {
  return [
    'juridique | Déposer la marque à l\'INPI | Classes 9 et 42 | 1',
    'vente | Interviews prospects | Clients cibles du marché visé | 20',
    '  - Écrire le guide d\'entretien',
    '  - Recruter 20 prospects sur LinkedIn',
    'produit | Prototype fonctionnel',
  ].join('\n');
}
