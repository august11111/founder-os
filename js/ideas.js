/* ============================================================
   FOUNDER OS — Idées : workspace Notion-style + comparateur
   ============================================================ */

import {
  getIdeas, saveIdea, deleteIdea, getIdeaById,
  openModal, closeModal, confirmModal, toast, truncate,
  uid, todayStr, fmtDate
} from './core.js';

// ── Constantes ───────────────────────────────────────────────
const STATUTS   = ['Exploration', 'En validation', 'Actif', 'Validée', 'En pause', 'Abandonnée', 'Archivé'];
const TYPES     = ['', 'B2B', 'B2C', 'Hybride'];
const DOC_KINDS = ['note', 'interview', 'article', 'données', 'autre'];

const SECTIONS = [
  { key: 'probleme', label: 'Problème & douleur', hints: {
    default: ["Qui a ce problème ? Persona précis.", "Vitamine (nice-to-have) ou antidouleur (must-have) ?", "Fréquence : quotidien, hebdo, ponctuel ?", "Solution actuelle (Excel, rien, concurrent) ?", "Coût de l'inaction : argent, temps, risque ?"],
  }},
  { key: 'marche', label: 'Marché & timing', hints: {
    default: ["TAM / SAM / SOM — estimations chiffrées.", "Taux de croissance du marché ?", "Quelles tendances rendent ce moment favorable ?", "Why now ? Fenêtre de 12–18 mois ?"],
  }},
  { key: 'cible', label: 'Cible', hints: {
    default: ["Qui exactement ? Caractéristiques précises de ta cible idéale."],
    B2B: ["Unité de décision : décideur / utilisateur / prescripteur / acheteur / bloqueurs.", "ICP : taille d'entreprise, secteur, stade de croissance.", "Où les trouver ? Canaux qui les touchent ?"],
    B2C: ["Persona : âge, situation, comportements, centres d'intérêt.", "Job-to-be-done : quelle tâche veulent-ils accomplir ?", "Déclencheur d'achat : qu'est-ce qui déclenche la recherche d'une solution ?"],
    Hybride: ["B2B — Unité de décision, ICP, canaux pro.", "B2C — Persona, job-to-be-done, déclencheur."],
  }},
  { key: 'concurrence', label: 'Concurrence & alternatives', hints: {
    default: ["Concurrents directs (font la même chose).", "Concurrents indirects (résolvent le même problème autrement).", "Substituts, dont « ne rien faire » — pourquoi changerait-on ?", "Positionnement vs eux : sur quel axe gagnes-tu ?"],
  }},
  { key: 'insight', label: 'Insight & thèse (Zero to One)', hints: {
    default: ["Ce que tu sais que personne d'autre ne sait encore.", "Pourquoi es-tu bien placé pour le savoir ?", "En quoi cet insight crée un avantage structurel ?"],
  }},
  { key: 'valeur', label: 'Proposition de valeur & différenciation', hints: {
    default: ["Quelle valeur concrète livres-tu ? Gain / soulagement de douleur ?", "Pourquoi toi et pas un autre ?", "Quelles barrières / moat défendables dans le temps ?"],
  }},
  { key: 'bm', label: 'Business model & unit economics', hints: {
    default: ["Comment tu gagnes de l'argent ? Quel modèle ?", "Métriques unitaires cibles."],
    B2B: ["ACV (Annual Contract Value) cible.", "Pricing : par siège / usage / palier ?", "Durée du cycle de vente.", "LTV, CAC, payback period cibles."],
    B2C: ["Freemium / abonnement / transactionnel ?", "Panier moyen, CAC, LTV, marge, churn cible."],
    Hybride: ["B2B — ACV, pricing, cycle, LTV/CAC.", "B2C — Modèle, panier moyen, CAC, LTV, churn."],
  }},
  { key: 'gtm', label: 'Go-to-market & acquisition', hints: {
    default: ["Premier canal d'acquisition. Comment trouver les 10 premiers clients ?"],
    B2B: ["Sales-led ou product-led growth ?", "Pilotes / POC — comment les décrocher ?", "Logos de référence cibles.", "Canaux pro : LinkedIn, événements, partenaires ?"],
    B2C: ["Viralité / effet réseau — mécanisme précis ?", "Contenu, paid, app stores, communauté ?", "Tunnel : awareness → activation → rétention."],
    Hybride: ["B2B — Sales-led/PLG, pilotes, logos.", "B2C — Viralité, contenu, paid, communauté."],
  }},
  { key: 'validation', label: 'Validation & preuves', hints: {
    default: ["Quels signaux de traction as-tu déjà ?", "Quelles hypothèses as-tu testées ? Résultats ?"],
    B2B: ["LOI (Letters of Intent) signées ?", "Pilotes en cours ou terminés ?", "ROI client chiffré.", "NRR / rétention de comptes ?"],
    B2C: ["Préinscriptions / liste d'attente.", "Rétention cohortes J1 / J7 / J30.", "Taux d'activation. Conversion."],
    Hybride: ["B2B — LOI, pilotes, ROI, NRR.", "B2C — Préinscriptions, cohortes, activation."],
  }},
  { key: 'risques', label: 'Risques & hypothèses critiques', hints: {
    default: ["Ce qui DOIT être vrai pour que ça marche.", "Classer par ordre de risque (le plus risqué en premier).", "Que se passe-t-il si chaque hypothèse est fausse ?", "Comment tester chaque hypothèse rapidement ?"],
  }},
  { key: 'personal_fit', label: 'Personal fit', hints: {
    default: ["Pourquoi toi ? Quel avantage déloyal as-tu ?", "Expérience, réseau, expertise du domaine ?", "Motivation profonde — pourquoi cette idée, pourquoi maintenant ?", "Quel prix es-tu prêt à payer ?"],
  }},
  { key: 'legal', label: 'Légal & réglementaire', hints: {
    default: ["Autorisations ou licences nécessaires ?", "Conformité RGPD, secteur financier, santé, etc. ?", "Contraintes sectorielles spécifiques ?", "Propriété intellectuelle ?"],
  }},
];

// ── État module ───────────────────────────────────────────────
let _viewMode            = 'cards';
let _activeDossierIdeaId = null;
let _compareSelection    = [];
let _activeNavKey        = null; // section key ou 'doc:{id}'

// ── Helpers ───────────────────────────────────────────────────
function _esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _md(content) {
  if (!content?.trim()) return '';
  return window.marked
    ? window.marked.parse(content)
    : `<pre style="white-space:pre-wrap;font-size:.82rem">${_esc(content)}</pre>`;
}
function _countFilled(idea) {
  const s = idea.sections || {};
  return SECTIONS.filter(sec => (s[sec.key] || '').trim().length > 0).length;
}
function _hints(section, type) {
  const ph = section.hints;
  return (type && ph[type]) ? ph[type] : (ph.default || []);
}
function _statusBadge(status) {
  const map = { Actif:'badge-actif', Exploration:'badge-nurture', Archivé:'badge-q4', 'En validation':'badge-part', Validée:'badge-actif', Abandonnée:'badge-q3', 'En pause':'badge-discussion' };
  return `<span class="badge ${map[status]||'badge-q3'}">${_esc(status)}</span>`;
}
function _typeBadge(type) {
  if (!type) return '';
  const map = { B2B:'idea-type-b2b', B2C:'idea-type-b2c', Hybride:'idea-type-hybride' };
  return `<span class="idea-type-badge ${map[type]||''}">${type}</span>`;
}
function _convBar(score) {
  return `<div class="conviction-bar"><div class="conviction-fill" style="width:${score*10}%"></div></div>`;
}

// ── renderIdeas — point d'entrée ──────────────────────────────
export function renderIdeas(container) {
  container.classList.remove('no-padding');

  if (_activeDossierIdeaId) {
    const idea = getIdeaById(_activeDossierIdeaId);
    if (idea) { _renderWorkspace(idea, container); return; }
    _activeDossierIdeaId = null;
  }

  const ideas = [...getIdeas()].sort((a,b) => b.conviction_score - a.conviction_score);
  if (_compareSelection.length < 2 && ideas.length >= 2) {
    _compareSelection = [ideas[0].id, ideas[1].id];
  }

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Idées</div>
        <div class="page-subtitle">${ideas.length} idée${ideas.length!==1?'s':''} · ${ideas.filter(i=>i.status==='Actif').length} active${ideas.filter(i=>i.status==='Actif').length!==1?'s':''}</div>
      </div>
      <div class="page-actions">
        <div style="display:flex;border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden">
          <button class="btn btn-ghost btn-sm ${_viewMode==='cards'?'btn-secondary':''}" id="view-cards" style="border-radius:0;border:none">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            Cards
          </button>
          <button class="btn btn-ghost btn-sm ${_viewMode==='compare'?'btn-secondary':''}" id="view-compare" style="border-radius:0;border:none;border-left:1px solid var(--border)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            Comparer
          </button>
        </div>
        <button class="btn btn-primary" id="add-idea-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nouvelle idée
        </button>
      </div>
    </div>
    <div id="ideas-content">
      ${_viewMode==='compare' ? _compareView(ideas) : _cardsView(ideas)}
    </div>`;

  _bindIdeas(container, ideas);
}

// ── Vue cards ─────────────────────────────────────────────────
function _cardsView(ideas) {
  if (!ideas.length) return `<div class="empty-state">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M9 18h6M10 22h4M12 2a7 7 0 017 7c0 2.4-1.2 4.5-3 5.7V17H8v-2.3C6.2 13.5 5 11.4 5 9a7 7 0 017-7z"/>
    </svg>
    <p>Aucune idée encore. Commencez par en créer une !</p>
  </div>`;
  return `<div class="ideas-grid">${ideas.map(_ideaCard).join('')}</div>`;
}

function _ideaCard(idea) {
  const filled      = _countFilled(idea);
  const problemText = idea.sections?.probleme || idea.problem || '';
  const insightText = idea.sections?.insight  || idea.unique_insight || '';
  return `
    <div class="idea-card" data-id="${idea.id}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
        <div class="idea-title">${_esc(idea.title)}</div>
        <div style="display:flex;gap:4px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
          ${_typeBadge(idea.type)}${_statusBadge(idea.status)}
        </div>
      </div>
      ${idea.oneLiner ? `<div class="idea-one-liner-card">${_esc(idea.oneLiner)}</div>` : ''}
      ${problemText   ? `<div class="idea-problem">${_esc(truncate(problemText,120))}</div>` : ''}
      <div>
        <div style="display:flex;justify-content:space-between;font-size:.75rem;color:var(--text-3);margin-bottom:4px">
          <span>Conviction</span><span style="font-weight:700;color:var(--text)">${idea.conviction_score}/10</span>
        </div>
        ${_convBar(idea.conviction_score)}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        ${insightText ? `<div style="font-size:.78rem;color:var(--text-2);font-style:italic;flex:1">"${_esc(truncate(insightText,80))}"</div>` : '<div></div>'}
        <span class="completion-indicator">${filled}/${SECTIONS.length}</span>
      </div>
    </div>`;
}

// ── Vue comparateur (inchangée) ───────────────────────────────
function _compareView(ideas) {
  if (ideas.length < 2) return `<div class="empty-state"><p>Ajoutez au moins 2 idées pour les comparer.</p></div>`;

  const sel = _compareSelection.filter(id => ideas.find(i=>i.id===id)).slice(0,2);
  while (sel.length < 2) { const c = ideas.find(i=>!sel.includes(i.id)); if(c) sel.push(c.id); else break; }
  const cmp = sel.map(id => ideas.find(i=>i.id===id)).filter(Boolean);

  const rows = [
    ['Type',              i => _typeBadge(i.type)||'—'],
    ['Statut',            i => _statusBadge(i.status)],
    ['Conviction',        i => `${_convBar(i.conviction_score)}<span style="font-size:.8rem;font-weight:700;display:block;margin-top:4px">${i.conviction_score}/10</span>`],
    ['Complétion',        i => `<span class="completion-indicator">${_countFilled(i)}/${SECTIONS.length} sections</span>`],
    ['Validation',        i => { const t=(i.sections?.validation||'').trim()||(i.traction_signals||[]).join(' · '); return _esc(truncate(t,200))||'—'; }],
    ['Risques critiques', i => _esc(truncate(i.sections?.risques||'',200))||'—'],
    ['Personal fit',      i => _esc(truncate(i.sections?.personal_fit||'',200))||'—'],
    ['Insight & thèse',   i => _esc(truncate(i.sections?.insight||i.unique_insight||'',200))||'—'],
    ['Marché & timing',   i => _esc(truncate(i.sections?.marche||'',200))||'—'],
    ['Business model',    i => _esc(truncate(i.sections?.bm||'',200))||'—'],
  ];

  return `
    <div class="compare-selector">
      <div class="compare-selector-label">Comparer :</div>
      <div class="compare-selector-chips">
        ${ideas.map(i=>`<button class="btn btn-ghost btn-sm compare-chip ${sel.includes(i.id)?'compare-chip-active':''}" data-idea-id="${i.id}">${_esc(truncate(i.title,28))}</button>`).join('')}
      </div>
    </div>
    <div class="card" style="padding:0;overflow-x:auto;margin-top:16px">
      <table class="compare-table">
        <thead><tr>
          <th style="width:160px">Critère</th>
          ${cmp.map(i=>`<th>${_esc(truncate(i.title,30))}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${rows.map(([label,fn])=>`<tr><td class="row-label">${label}</td>${cmp.map(i=>`<td style="font-size:.83rem">${fn(i)}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// ── Bindings vue liste ────────────────────────────────────────
function _bindIdeas(container, ideas) {
  container.querySelector('#view-cards')?.addEventListener('click',   () => { _viewMode='cards';   renderIdeas(container); });
  container.querySelector('#view-compare')?.addEventListener('click', () => { _viewMode='compare'; renderIdeas(container); });
  container.querySelector('#add-idea-btn').addEventListener('click',  () => _openCreateModal(container));

  container.querySelectorAll('.idea-card').forEach(card => {
    card.addEventListener('click', () => {
      const idea = getIdeaById(card.dataset.id);
      if (idea) { _activeDossierIdeaId = idea.id; _activeNavKey = null; renderIdeas(container); }
    });
  });

  container.querySelectorAll('.compare-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const id = chip.dataset.ideaId;
      if (_compareSelection.includes(id)) return;
      _compareSelection = _compareSelection.length >= 2 ? [_compareSelection[1], id] : [..._compareSelection, id];
      renderIdeas(container);
    });
  });
}

// ═══════════════════════════════════════════════════════════════
//  WORKSPACE
// ═══════════════════════════════════════════════════════════════

function _renderWorkspace(idea, container) {
  container.classList.add('no-padding');
  if (!_activeNavKey) _activeNavKey = SECTIONS[0].key;
  const filled = _countFilled(idea);

  container.innerHTML = `
    <div class="idea-workspace">

      <div class="idea-ws-header">
        <button class="btn btn-ghost btn-sm" id="ws-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:13px;height:13px"><polyline points="15 18 9 12 15 6"/></svg>
          Idées
        </button>
        <div class="ws-header-sep"></div>
        <input type="text" class="ws-title-input" id="ws-title" value="${_esc(idea.title)}" spellcheck="false">
        <div class="ws-header-right">
          <select class="ws-select" id="ws-type">
            ${TYPES.map(t=>`<option value="${t}" ${idea.type===t?'selected':''}>${t||'Type…'}</option>`).join('')}
          </select>
          <select class="ws-select" id="ws-status">
            ${STATUTS.map(s=>`<option value="${s}" ${idea.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
          <div class="ws-conv-group">
            <span class="ws-conv-label">Conv.</span>
            <input type="range" class="ws-conv-range" id="ws-conv" min="1" max="10" value="${idea.conviction_score}">
            <span class="ws-conv-val" id="ws-conv-val">${idea.conviction_score}<span>/10</span></span>
          </div>
          <span class="completion-indicator" id="ws-completion">${filled}/${SECTIONS.length}</span>
          <button class="btn btn-ghost btn-sm ws-danger-btn" id="ws-delete-idea" title="Supprimer l'idée">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
        </div>
      </div>

      <div class="idea-ws-body">
        <aside class="idea-ws-sidebar">
          <div class="ws-nav-label">SECTIONS</div>
          <nav id="ws-nav">
            ${SECTIONS.map((s,idx) => {
              const has = ((idea.sections||{})[s.key]||'').trim().length > 0;
              return `<button class="ws-nav-item${_activeNavKey===s.key?' active':''}" data-nav-key="${s.key}">
                <span class="ws-nav-num">${idx+1}</span>
                <span class="ws-nav-lbl">${_esc(s.label)}</span>
                <span class="ws-nav-dot${has?' filled':''}"></span>
              </button>`;
            }).join('')}
          </nav>
          <div class="ws-nav-divider"></div>
          <div class="ws-nav-label">DOCUMENTS</div>
          <div id="ws-docs-nav">${_docsNavHTML(idea)}</div>
        </aside>

        <div class="idea-ws-main" id="ws-main"></div>
      </div>
    </div>`;

  _bindWorkspace(idea.id, container);
  _loadContent(idea.id, container);
}

// ── Sidebar docs HTML ─────────────────────────────────────────
function _docsNavHTML(idea) {
  const docs = idea.documents || [];
  const icons = { note:'📝', interview:'💬', article:'📄', données:'📊', autre:'📎' };
  return `${docs.map(doc => `
    <button class="ws-nav-item${_activeNavKey==='doc:'+doc.id?' active':''}" data-nav-key="doc:${doc.id}">
      <span class="ws-nav-icon">${icons[doc.kind]||'📎'}</span>
      <span class="ws-nav-lbl">${_esc(truncate(doc.title,22))}</span>
    </button>`).join('')}
    <button class="ws-nav-item ws-nav-add" id="ws-add-doc">
      <span class="ws-nav-icon" style="font-weight:700">+</span>
      <span class="ws-nav-lbl" style="color:var(--text-3)">Ajouter</span>
    </button>`;
}

// ── Chargement du panneau central ─────────────────────────────
function _loadContent(ideaId, container) {
  const idea = getIdeaById(ideaId);
  const main = container.querySelector('#ws-main');
  if (!main) return;

  if (_activeNavKey?.startsWith('doc:')) {
    const docId = _activeNavKey.slice(4);
    const doc   = (idea.documents||[]).find(d => d.id === docId);
    if (doc) { main.innerHTML = _docHTML(doc); _bindDoc(ideaId, docId, container); return; }
    _activeNavKey = SECTIONS[0].key;
  }

  const section = SECTIONS.find(s => s.key === _activeNavKey) || SECTIONS[0];
  _activeNavKey  = section.key;
  const content  = (idea.sections||{})[section.key] || '';
  main.innerHTML = _sectionHTML(section, content, idea.type);
  _bindSection(ideaId, section.key, container);
}

// ── HTML : panneau section ────────────────────────────────────
function _sectionHTML(section, content, type) {
  const isEmpty = !content.trim();
  const hints   = _hints(section, type);
  const body    = isEmpty
    ? `<div class="ws-placeholder">
        ${hints.map(h=>`<div class="ws-ph-line">→ ${_esc(h)}</div>`).join('')}
        <div class="ws-ph-cta">Cliquer pour commencer…</div>
       </div>`
    : `<div class="iv-recap-content ws-rendered">${_md(content)}</div>`;

  return `<div class="ws-section-title">${_esc(section.label)}</div>
          <div class="ws-editor-zone" id="ws-editor-zone">${body}</div>`;
}

// ── HTML : panneau document ───────────────────────────────────
function _docHTML(doc) {
  let src = '';
  if (doc.source) { try { src = new URL(doc.source).hostname; } catch { src = truncate(doc.source,30); } }
  const kinds = { note:'badge-q3', interview:'badge-discussion', article:'badge-nurture', données:'badge-q2', autre:'badge-q4' };
  const body  = (doc.content||'').trim()
    ? `<div class="iv-recap-content ws-rendered">${_md(doc.content)}</div>`
    : `<div class="ws-placeholder"><div class="ws-ph-cta">Cliquer pour rédiger…</div></div>`;

  return `
    <div class="ws-doc-head">
      <input type="text" class="ws-doc-title" id="ws-doc-title" value="${_esc(doc.title)}" spellcheck="false">
      <div class="ws-doc-meta">
        <span class="badge ${kinds[doc.kind]||'badge-q3'}">${_esc(doc.kind)}</span>
        ${doc.date   ? `<span>${fmtDate(doc.date)}</span>` : ''}
        ${doc.source ? `<a href="${_esc(doc.source)}" target="_blank" class="idea-doc-link">${_esc(src||doc.source)}</a>` : ''}
        <button class="btn btn-ghost btn-sm" id="ws-doc-edit" style="font-size:.75rem">Modifier infos</button>
        <button class="btn btn-ghost btn-sm ws-danger-btn" id="ws-doc-delete" style="font-size:.75rem">Supprimer</button>
      </div>
    </div>
    <div class="ws-editor-zone" id="ws-editor-zone">${body}</div>`;
}

// ── Bindings workspace (header + nav) ─────────────────────────
function _bindWorkspace(ideaId, container) {
  // Retour
  container.querySelector('#ws-back').addEventListener('click', () => {
    container.classList.remove('no-padding');
    _activeDossierIdeaId = null;
    _activeNavKey        = null;
    renderIdeas(container);
  });

  // Supprimer idée
  container.querySelector('#ws-delete-idea').addEventListener('click', () => {
    const idea = getIdeaById(ideaId);
    confirmModal(`Supprimer "${idea.title}" ?`, () => {
      deleteIdea(ideaId);
      container.classList.remove('no-padding');
      _activeDossierIdeaId = null;
      _activeNavKey = null;
      toast('Idée supprimée');
      renderIdeas(container);
    });
  });

  // Titre (auto-save 600 ms)
  const titleEl = container.querySelector('#ws-title');
  let _tTimer   = null;
  titleEl.addEventListener('input', () => {
    clearTimeout(_tTimer);
    _tTimer = setTimeout(() => {
      if (titleEl.value.trim()) saveIdea({ ...getIdeaById(ideaId), title: titleEl.value.trim() });
    }, 600);
  });

  // Type
  container.querySelector('#ws-type').addEventListener('change', e => {
    saveIdea({ ...getIdeaById(ideaId), type: e.target.value });
    // Met à jour le placeholder si la section active est vide
    if (_activeNavKey && !_activeNavKey.startsWith('doc:')) {
      const idea    = getIdeaById(ideaId);
      const content = (idea.sections||{})[_activeNavKey] || '';
      if (!content.trim()) {
        const sec  = SECTIONS.find(s => s.key === _activeNavKey);
        const zone = container.querySelector('#ws-editor-zone');
        if (zone && sec) {
          zone.innerHTML = `<div class="ws-placeholder">${_hints(sec, e.target.value).map(h=>`<div class="ws-ph-line">→ ${_esc(h)}</div>`).join('')}<div class="ws-ph-cta">Cliquer pour commencer…</div></div>`;
          _bindSection(ideaId, _activeNavKey, container);
        }
      }
    }
  });

  // Statut
  container.querySelector('#ws-status').addEventListener('change', e => {
    saveIdea({ ...getIdeaById(ideaId), status: e.target.value });
  });

  // Conviction
  const convRange = container.querySelector('#ws-conv');
  const convVal   = container.querySelector('#ws-conv-val');
  convRange.addEventListener('input',  () => { convVal.firstChild.textContent = convRange.value; });
  convRange.addEventListener('change', () => { saveIdea({ ...getIdeaById(ideaId), conviction_score: Number(convRange.value) }); });

  // Nav sections
  container.querySelectorAll('#ws-nav .ws-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      _activeNavKey = item.dataset.navKey;
      _setActive(container, _activeNavKey);
      _loadContent(ideaId, container);
    });
  });

  _bindDocNav(ideaId, container);
}

// ── Binding section : click-to-edit + auto-save ───────────────
function _bindSection(ideaId, sectionKey, container) {
  const zone = container.querySelector('#ws-editor-zone');
  if (!zone) return;
  let _timer = null;

  function _toEdit() {
    const idea    = getIdeaById(ideaId);
    const content = (idea.sections||{})[sectionKey] || '';
    zone.innerHTML = `<textarea class="ws-textarea">${_esc(content)}</textarea>`;
    const ta = zone.querySelector('textarea');
    ta.focus();
    ta.selectionStart = ta.selectionEnd = ta.value.length;

    ta.addEventListener('input', () => {
      clearTimeout(_timer);
      _timer = setTimeout(() => _saveSection(ideaId, sectionKey, ta.value, container), 900);
    });

    ta.addEventListener('blur', () => {
      clearTimeout(_timer);
      _saveSection(ideaId, sectionKey, ta.value, container);
      // Retour au rendu markdown
      const idea2   = getIdeaById(ideaId);
      const sec     = SECTIONS.find(s => s.key === sectionKey);
      const cont    = (idea2.sections||{})[sectionKey] || '';
      zone.innerHTML = cont.trim()
        ? `<div class="iv-recap-content ws-rendered">${_md(cont)}</div>`
        : `<div class="ws-placeholder">${_hints(sec, idea2.type).map(h=>`<div class="ws-ph-line">→ ${_esc(h)}</div>`).join('')}<div class="ws-ph-cta">Cliquer pour commencer…</div></div>`;
      _clickToEdit(zone, _toEdit);
    });
  }

  _clickToEdit(zone, _toEdit);
}

// ── Binding document : click-to-edit + auto-save ──────────────
function _bindDoc(ideaId, docId, container) {
  const zone = container.querySelector('#ws-editor-zone');
  if (!zone) return;
  let _timer = null;

  // Titre doc
  const titleEl = container.querySelector('#ws-doc-title');
  if (titleEl) {
    let _tTimer = null;
    titleEl.addEventListener('input', () => {
      clearTimeout(_tTimer);
      _tTimer = setTimeout(() => {
        if (!titleEl.value.trim()) return;
        const fresh = getIdeaById(ideaId);
        const docs  = [...(fresh.documents||[])];
        const idx   = docs.findIndex(d => d.id === docId);
        if (idx >= 0) {
          docs[idx] = { ...docs[idx], title: titleEl.value.trim() };
          saveIdea({ ...fresh, documents: docs });
          _refreshDocs(ideaId, container);
        }
      }, 600);
    });
  }

  // Modifier infos (modal)
  container.querySelector('#ws-doc-edit')?.addEventListener('click', () => {
    const fresh = getIdeaById(ideaId);
    const doc   = (fresh.documents||[]).find(d => d.id === docId);
    if (!doc) return;
    _openDocModal(doc, fresh, () => {
      _refreshDocs(ideaId, container);
      _bindDocNav(ideaId, container);
      const main  = container.querySelector('#ws-main');
      const doc2  = (getIdeaById(ideaId).documents||[]).find(d => d.id === docId);
      if (main && doc2) { main.innerHTML = _docHTML(doc2); _bindDoc(ideaId, docId, container); }
    });
  });

  // Supprimer doc
  container.querySelector('#ws-doc-delete')?.addEventListener('click', () => {
    const fresh = getIdeaById(ideaId);
    const doc   = (fresh.documents||[]).find(d => d.id === docId);
    if (!doc) return;
    confirmModal(`Supprimer "${doc.title}" ?`, () => {
      saveIdea({ ...fresh, documents: fresh.documents.filter(d => d.id !== docId) });
      _activeNavKey = SECTIONS[0].key;
      _refreshDocs(ideaId, container);
      _bindDocNav(ideaId, container);
      _setActive(container, _activeNavKey);
      _loadContent(ideaId, container);
      toast('Document supprimé');
    });
  });

  function _toEdit() {
    const fresh   = getIdeaById(ideaId);
    const doc     = (fresh.documents||[]).find(d => d.id === docId);
    const content = doc?.content || '';
    zone.innerHTML = `<textarea class="ws-textarea">${_esc(content)}</textarea>`;
    const ta = zone.querySelector('textarea');
    ta.focus();
    ta.selectionStart = ta.selectionEnd = ta.value.length;

    ta.addEventListener('input', () => {
      clearTimeout(_timer);
      _timer = setTimeout(() => _saveDoc(ideaId, docId, ta.value), 900);
    });

    ta.addEventListener('blur', () => {
      clearTimeout(_timer);
      _saveDoc(ideaId, docId, ta.value);
      const fresh2 = getIdeaById(ideaId);
      const cont   = (fresh2.documents||[]).find(d=>d.id===docId)?.content || '';
      zone.innerHTML = cont.trim()
        ? `<div class="iv-recap-content ws-rendered">${_md(cont)}</div>`
        : `<div class="ws-placeholder"><div class="ws-ph-cta">Cliquer pour rédiger…</div></div>`;
      _clickToEdit(zone, _toEdit);
    });
  }

  _clickToEdit(zone, _toEdit);
}

// ── Helpers workspace ─────────────────────────────────────────
function _clickToEdit(zone, fn) {
  const h = e => { if (e.target.closest('a')) return; zone.removeEventListener('click', h); fn(); };
  zone.addEventListener('click', h);
}

function _setActive(container, key) {
  container.querySelectorAll('.ws-nav-item').forEach(i => i.classList.toggle('active', i.dataset.navKey === key));
}

function _refreshDocs(ideaId, container) {
  const el = container.querySelector('#ws-docs-nav');
  if (el) el.innerHTML = _docsNavHTML(getIdeaById(ideaId));
}

function _bindDocNav(ideaId, container) {
  container.querySelectorAll('.ws-nav-item[data-nav-key^="doc:"]').forEach(item => {
    item.addEventListener('click', () => {
      _activeNavKey = item.dataset.navKey;
      _setActive(container, _activeNavKey);
      _loadContent(ideaId, container);
    });
  });
  container.querySelector('#ws-add-doc')?.addEventListener('click', () => {
    _openDocModal(null, getIdeaById(ideaId), () => {
      _refreshDocs(ideaId, container);
      _bindDocNav(ideaId, container);
    });
  });
}

function _saveSection(ideaId, key, value, container) {
  const fresh   = getIdeaById(ideaId);
  saveIdea({ ...fresh, sections: { ...(fresh.sections||{}), [key]: value } });
  // Dot dans la nav
  const item = container.querySelector(`.ws-nav-item[data-nav-key="${key}"]`);
  item?.querySelector('.ws-nav-dot')?.classList.toggle('filled', value.trim().length > 0);
  // Compteur complétion
  const comp = container.querySelector('#ws-completion');
  if (comp) comp.textContent = `${_countFilled(getIdeaById(ideaId))}/${SECTIONS.length}`;
}

function _saveDoc(ideaId, docId, content) {
  const fresh = getIdeaById(ideaId);
  const docs  = [...(fresh.documents||[])];
  const idx   = docs.findIndex(d => d.id === docId);
  if (idx >= 0) { docs[idx] = { ...docs[idx], content }; saveIdea({ ...fresh, documents: docs }); }
}

// ── Modales ───────────────────────────────────────────────────
function _openCreateModal(container) {
  openModal({
    title: 'Nouvelle idée',
    bodyHTML: `
      <div class="form-group">
        <label class="form-label">Titre *</label>
        <input class="form-input" id="id-title" placeholder="Nom court et mémorable">
      </div>
      <div class="form-group">
        <label class="form-label">Pitch en une phrase</label>
        <input class="form-input" id="id-oneliner" placeholder="La valeur en une phrase…">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Type</label>
          <select class="form-select" id="id-type">
            ${TYPES.map(t=>`<option value="${t}">${t||'Non défini'}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Statut</label>
          <select class="form-select" id="id-status">
            ${STATUTS.map(s=>`<option value="${s}" ${s==='Exploration'?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Conviction (1–10)</label>
        <input class="form-input" id="id-conviction" type="range" min="1" max="10" value="5" style="padding:8px 0;accent-color:var(--q2)">
        <div class="form-hint" id="id-conviction-val" style="text-align:center;font-weight:700">5/10</div>
      </div>`,
    onSave: () => {
      const title = document.getElementById('id-title').value.trim();
      if (!title) { toast('Le titre est requis', 'error'); return; }
      saveIdea({ id:null, title,
        oneLiner:         document.getElementById('id-oneliner').value.trim(),
        type:             document.getElementById('id-type').value,
        status:           document.getElementById('id-status').value,
        conviction_score: Number(document.getElementById('id-conviction').value),
        sections:{}, documents:[], problem:'', segment:'', unique_insight:'', traction_signals:[],
      });
      closeModal();
      toast('Idée créée', 'success');
      renderIdeas(container);
    },
  });
  setTimeout(() => {
    const sl = document.getElementById('id-conviction');
    const lb = document.getElementById('id-conviction-val');
    if (sl) sl.addEventListener('input', () => { lb.textContent = `${sl.value}/10`; });
  }, 0);
}

function _openDocModal(doc, idea, onRefresh) {
  const isNew = !doc;
  const d = doc || { id:null, title:'', kind:'note', date:todayStr(), source:'', content:'' };

  openModal({
    title:      isNew ? 'Nouveau document' : 'Modifier le document',
    showDelete: !isNew,
    bodyHTML: `
      <div class="form-group">
        <label class="form-label">Titre *</label>
        <input class="form-input" id="doc-title" value="${_esc(d.title)}" placeholder="Titre du document">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Type</label>
          <select class="form-select" id="doc-kind">
            ${DOC_KINDS.map(k=>`<option value="${k}" ${d.kind===k?'selected':''}>${k}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Date</label>
          <input class="form-input" id="doc-date" type="date" value="${_esc(d.date||'')}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Source / Lien</label>
        <input class="form-input" id="doc-source" value="${_esc(d.source||'')}" placeholder="https://…">
      </div>`,
    onSave: () => {
      const title = document.getElementById('doc-title').value.trim();
      if (!title) { toast('Le titre est requis', 'error'); return; }
      const fresh  = getIdeaById(idea.id);
      const docs   = [...(fresh.documents||[])];
      const docObj = {
        id:      isNew ? uid('doc') : d.id,
        title,
        kind:    document.getElementById('doc-kind').value,
        date:    document.getElementById('doc-date').value,
        source:  document.getElementById('doc-source').value.trim(),
        content: isNew ? '' : (d.content||''),
      };
      if (isNew) { docs.push(docObj); }
      else { const idx = docs.findIndex(x=>x.id===d.id); if (idx>=0) docs[idx] = docObj; }
      saveIdea({ ...fresh, documents: docs });
      closeModal();
      toast(isNew?'Document ajouté':'Document mis à jour', 'success');
      if (isNew) _activeNavKey = 'doc:' + docObj.id;
      onRefresh();
    },
    onDelete: !isNew ? () => {
      closeModal();
      confirmModal(`Supprimer "${d.title}" ?`, () => {
        const fresh = getIdeaById(idea.id);
        saveIdea({ ...fresh, documents: (fresh.documents||[]).filter(x=>x.id!==d.id) });
        toast('Document supprimé');
        onRefresh();
      });
    } : undefined,
  });
}

// ── Compat export ─────────────────────────────────────────────
export function openIdeaModal(idea, container) {
  if (!idea) { _openCreateModal(container); return; }
  _activeDossierIdeaId = idea.id;
  _activeNavKey        = null;
  renderIdeas(container);
}
