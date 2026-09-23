/* ============================================================
   FOUNDER OS — Core : Storage Layer + State Global + Helpers
   ============================================================ */

import {
  initBackup, getBackupStatus, loadFromLinkedFile, backupNow, flushBackup,
} from './backup.js';

const DB_KEY = 'founder_os_db';

// Version du schéma de données — incrémentée à chaque changement de structure.
// La migration correspondante est jouée dans _migrate(), qui est idempotente.
const SCHEMA_VERSION = 5;

// ── Référentiel des 8 dimensions ────────────────────────────
// Source de vérité unique : aucun module ne redéfinit cette liste.
export const DIMENSIONS = [
  { key: 'strategie', short: 'Stratégie', label: 'Stratégie & Vision',       color: '#378ADD' },
  { key: 'marketing', short: 'Marketing', label: 'Marketing & Communication', color: '#9B59B6' },
  { key: 'vente',     short: 'Vente',     label: 'Vente & Business Dev',      color: '#1D9E75' },
  { key: 'finance',   short: 'Finance',   label: 'Finance',                   color: '#F39C12' },
  { key: 'rse',       short: 'RSE',       label: 'RSE & Impact',              color: '#16A085' },
  { key: 'produit',   short: 'Produit',   label: 'R&D & Produit',             color: '#E74C3C' },
  { key: 'equipe',    short: 'Équipe',    label: 'Management & Équipe',       color: '#E67E22' },
  { key: 'juridique', short: 'Juridique', label: 'Juridique',                 color: '#34495E' },
];

export const DIMENSION_KEYS = DIMENSIONS.map(d => d.key);

export function getDimension(key) {
  return DIMENSIONS.find(d => d.key === key) || DIMENSIONS[0];
}

export function dimensionLabel(key) { return getDimension(key).label; }
export function dimensionColor(key) { return getDimension(key).color; }

// Minuscules, sans accents : base de toutes les comparaisons et recherches texte
export function normalizeText(str) {
  return (str ?? '').toString()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim();
}

const _slug = normalizeText;

// Accepte une clé (`juridique`) ou un label (`Juridique`, `Vente & Business Dev`),
// sans tenir compte de la casse ni des accents. Retourne null si inconnue.
export function normalizeDimension(input) {
  const n = _slug(input);
  if (!n) return null;
  const match = DIMENSIONS.find(d =>
    _slug(d.key) === n ||
    _slug(d.label) === n ||
    _slug(d.label.split(/[&(]/)[0]) === n
  );
  return match ? match.key : null;
}

// ── État global (réactif via callback) ──────────────────────
let _state = null;
const _listeners = [];

export function subscribe(fn) { _listeners.push(fn); }
function _notify() { _listeners.forEach(fn => fn(_state)); }

// ── Chargement initial ──────────────────────────────────────
// Ordre de la source de vérité : fichier de sauvegarde lié, puis localStorage,
// puis la graine, puis une base vide. Le fichier passe devant parce que c'est
// lui qui survit à un vidage du cache — c'est tout l'intérêt de la sauvegarde.
export async function initDB() {
  const fileState  = await _loadFromBackup();
  const localState = _loadFromLocal();

  let chosen;
  if (fileState && localState) chosen = _arbitrate(fileState, localState);
  else chosen = fileState || localState || (await _fetchSeed()) || _emptyDB();

  _state = chosen;
  _migrate(_state);
  _persist();
  return _state;
}

async function _loadFromBackup() {
  try {
    await initBackup();
    if (getBackupStatus().state !== 'linked') return null;
    return await loadFromLinkedFile();
  } catch {
    return null;   // la sauvegarde ne doit jamais empêcher l'app de démarrer
  }
}

function _loadFromLocal() {
  try {
    const saved = localStorage.getItem(DB_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

// Fichier et localStorage divergent : le plus récent gagne, d'après meta.updated.
// À égalité c'est le fichier, puisqu'il est la copie durable de référence.
function _arbitrate(fileState, localState) {
  const fileDate  = fileState?.meta?.updated  || '';
  const localDate = localState?.meta?.updated || '';
  if (localDate > fileDate) {
    toast('Données locales plus récentes que la sauvegarde — le fichier va être mis à jour');
    return localState;
  }
  if (fileDate > localDate) toast('Données restaurées depuis le fichier de sauvegarde', 'success');
  return fileState;
}

async function _fetchSeed() {
  for (const url of ['./data/db.json', './data/db.example.json']) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {}
  }
  return null;
}

// ── Migration de schéma ─────────────────────────────────────
// Idempotente : rejouable sans effet de bord sur une base déjà à jour.
// Aucune donnée n'est supprimée, uniquement complétée ou convertie.
function _migrate(s) {
  if (!s.meta) s.meta = { phase: 'Discovery', week: 1, focus_today: '', quote: '', quote_author: '', updated: todayStr() };
  if (!s.tasks)           s.tasks = [];
  if (!s.contacts)        s.contacts = [];
  if (!s.interviews)      s.interviews = [];
  if (!s.ideas)           s.ideas = [];
  if (!s.habits)          s.habits = [];
  if (!s.insights)        s.insights = [];
  if (!s.calendar_events) s.calendar_events = [];
  if (!s.roadmap)         s.roadmap = [];
  if (!s.finance)         s.finance = { scenarios: [], activeScenarioId: null, activeAssumptions: null, actuals: {} };
  if (!s.finance.actuals) s.finance.actuals = {};
  // v5 — livrables (slides markdown) et pitch deck assemblé par référence
  if (!Array.isArray(s.deliverables))  s.deliverables = [];
  if (!s.pitch)                        s.pitch = { slides: [] };
  if (!Array.isArray(s.pitch.slides))  s.pitch.slides = [];

  // v1 — champs contacts
  s.contacts.forEach(c => {
    if (c.secteur  === undefined) c.secteur = '';
    if (!c.interactions)          c.interactions = [];
    if (c.email    === undefined) c.email = '';
    if (c.phone    === undefined) c.phone = '';
    if (c.linkedin === undefined) c.linkedin = '';
    // v4 — l'engagement devient la pertinence : à quel point le contact
    // est précieux pour le projet. Rôle et idée liée n'ont plus de sens
    // depuis le recentrage sur un projet unique.
    if (c.pertinence === undefined) c.pertinence = c.engagement ?? 3;
    delete c.engagement;
    delete c.role;
    delete c.idea_id;
  });

  // v1 — champs idées (workspace)
  s.ideas.forEach(idea => {
    if (idea.type     === undefined) idea.type = '';
    if (idea.oneLiner === undefined) idea.oneLiner = '';
    if (!idea.documents)             idea.documents = [];
    if (!idea.sections) {
      idea.sections = {
        probleme:    idea.problem        || '',
        marche:      '',
        cible:       idea.segment        || '',
        concurrence: '',
        insight:     idea.unique_insight || '',
        valeur:      '',
        bm:          '',
        gtm:         '',
        validation:  (idea.traction_signals || []).length
                       ? '- ' + (idea.traction_signals || []).join('\n- ')
                       : '',
        risques:      '',
        personal_fit: '',
        legal:        '',
      };
    }
  });

  // v2 — tâches : récurrence, historique de complétion, quick win
  s.tasks.forEach(t => {
    if (t.recurrence === undefined) t.recurrence = 'none';
    if (!Array.isArray(t.weekdays))    t.weekdays = [];
    if (!Array.isArray(t.completions)) t.completions = [];
    if (t.quickwin === undefined)   t.quickwin = false;
  });

  // v2 — les 4 habitudes codées en dur deviennent des tâches récurrentes.
  // L'historique de complétion est reconstitué depuis les entrées `habits`.
  if (!s.meta.habits_migrated && s.habits.length) {
    HABIT_SEEDS.forEach(seed => {
      const dates = s.habits.filter(h => h[seed.key]).map(h => h.date).filter(Boolean).sort();
      const already = s.tasks.find(t => t.habit_key === seed.key);
      if (already) return;
      s.tasks.push({
        id: uid('t'), title: seed.title, quadrant: 'Q2', done: false,
        recurrence: 'daily', weekdays: [], completions: dates,
        quickwin: false, linked_subgoal_id: null, habit_key: seed.key,
      });
    });
  }
  s.meta.habits_migrated = true;

  // v2 — roadmap : anciennes catégories → dimensions, et arborescence à un niveau
  s.roadmap.forEach(item => {
    if (item.parent_id === undefined) item.parent_id = null;
    const mapped = LEGACY_CATEGORY_MAP[item.category] || normalizeDimension(item.category);
    item.category = mapped || 'strategie';
  });
  // Les enfants héritent toujours de la dimension de leur parent
  s.roadmap.forEach(item => {
    if (!item.parent_id) return;
    const parent = s.roadmap.find(r => r.id === item.parent_id);
    if (parent) item.category = parent.category;
    else item.parent_id = null;   // parent disparu : l'orphelin redevient racine
  });

  // v3 — formulaire de tâche épuré : énergie, semaine et deep work disparaissent.
  // Les tâches concernées gardent leur titre et redeviennent de simples tâches.
  s.tasks.forEach(t => {
    delete t.energy;
    delete t.week;
    delete t.deep_work;
    if (t.linked_subgoal_id === undefined) t.linked_subgoal_id = null;
    // Un sous-objectif disparu ne doit pas emporter sa tâche : elle perd juste son lien
    if (t.linked_subgoal_id && !s.roadmap.some(r => r.id === t.linked_subgoal_id)) {
      t.linked_subgoal_id = null;
    }
  });

  if (s.meta.eval_date === undefined) s.meta.eval_date = '';
  s.meta.schema_version = SCHEMA_VERSION;
}

// Les 4 habitudes historiques, converties en tâches récurrentes quotidiennes
const HABIT_SEEDS = [
  { key: 'journaling', title: '📔 Journaling' },
  { key: 'deep_work',  title: '🧠 Deep Work'  },
  { key: 'interview',  title: '🎙️ Interview'  },
  { key: 'sport',      title: '🏃 Sport'      },
];

const LEGACY_CATEGORY_MAP = {
  Discovery:  'strategie',
  Validation: 'strategie',
  MVP:        'produit',
  Traction:   'vente',
  Business:   'finance',
};

// ── Lecture ─────────────────────────────────────────────────
export function getDB() { return _state; }

export function getMeta()       { return _state.meta; }
export function getTasks()      { return _state.tasks || []; }
export function getContacts()   { return _state.contacts || []; }
export function getInterviews() { return _state.interviews || []; }
export function getIdeas()      { return _state.ideas || []; }
export function getHabits()     { return _state.habits || []; }
export function getInsights()   { return _state.insights || []; }

export function getContactById(id)   { return getContacts().find(c => c.id === id); }
export function getIdeaById(id)      { return getIdeas().find(i => i.id === id); }
export function getInterviewById(id) { return getInterviews().find(i => i.id === id); }
export function getTaskById(id)      { return getTasks().find(t => t.id === id); }

export function getTodayHabit() {
  const today = todayStr();
  return getHabits().find(h => h.date === today) || null;
}

// ── Écriture générique ──────────────────────────────────────
export function updateMeta(patch) {
  _state.meta = { ..._state.meta, ...patch, updated: todayStr() };
  _persist(); _notify();
}

export function saveTask(task) {
  const idx = _state.tasks.findIndex(t => t.id === task.id);
  if (idx >= 0) _state.tasks[idx] = task;
  else _state.tasks.push({ ...task, id: uid('t') });
  _persist(); _notify();
}

export function deleteTask(id) {
  _state.tasks = _state.tasks.filter(t => t.id !== id);
  _persist(); _notify();
}

export function saveContact(contact) {
  const idx = _state.contacts.findIndex(c => c.id === contact.id);
  if (idx >= 0) _state.contacts[idx] = contact;
  else _state.contacts.push({ ...contact, id: uid('c') });
  _persist(); _notify();
}

export function deleteContact(id) {
  _state.contacts = _state.contacts.filter(c => c.id !== id);
  _persist(); _notify();
}

// Liste des entreprises distinctes, dérivée des contacts : pas de table
// parallèle à maintenir. Regroupe les variantes de casse/accents sous le
// premier libellé rencontré. Retourne [{ name, count }] trié par nom.
export function getCompanies() {
  const byKey = new Map();
  getContacts().forEach(c => {
    const name = (c.company || '').trim();
    if (!name) return;
    const key = normalizeText(name);
    if (byKey.has(key)) byKey.get(key).count++;
    else byKey.set(key, { name, count: 1 });
  });
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export function saveInterview(interview) {
  const idx = _state.interviews.findIndex(i => i.id === interview.id);
  if (idx >= 0) _state.interviews[idx] = interview;
  else _state.interviews.push({ ...interview, id: uid('int') });
  _persist(); _notify();
}

export function deleteInterview(id) {
  _state.interviews = _state.interviews.filter(i => i.id !== id);
  _persist(); _notify();
}

export function saveIdea(idea) {
  const idx = _state.ideas.findIndex(i => i.id === idea.id);
  if (idx >= 0) _state.ideas[idx] = idea;
  else _state.ideas.push({ ...idea, id: uid('i') });
  _persist(); _notify();
}

export function deleteIdea(id) {
  _state.ideas = _state.ideas.filter(i => i.id !== id);
  _persist(); _notify();
}

export function getFinanceData() {
  if (!_state.finance) _state.finance = { scenarios: [], activeScenarioId: null, activeAssumptions: null, actuals: {} };
  if (!_state.finance.actuals) _state.finance.actuals = {};
  return _state.finance;
}

export function saveFinanceData(data) {
  _state.finance = data;
  _persist(); _notify();
}

export function getRoadmap()              { return _state.roadmap || []; }
export function getRoadmapRoots()         { return getRoadmap().filter(r => !r.parent_id).sort((a, b) => a.order - b.order); }
export function getRoadmapChildren(parentId) {
  return getRoadmap().filter(r => r.parent_id === parentId).sort((a, b) => a.order - b.order);
}
export function getRoadmapItemById(id)    { return getRoadmap().find(r => r.id === id); }

export function saveRoadmapItem(item) {
  if (!_state.roadmap) _state.roadmap = [];
  // Un seul niveau d'imbrication : un enfant ne peut pas devenir parent
  if (item.parent_id) {
    const parent = _state.roadmap.find(r => r.id === item.parent_id);
    if (!parent || parent.parent_id) item = { ...item, parent_id: null };
    else item = { ...item, category: parent.category };
  }
  const idx = _state.roadmap.findIndex(r => r.id === item.id);
  if (idx >= 0) _state.roadmap[idx] = item;
  else _state.roadmap.push({ ...item, id: item.id || uid('rm') });
  _syncFromChildren(item.parent_id);
  if (!item.parent_id) _syncChildrenCategory(item.id);
  _persist(); _notify();
}

export function deleteRoadmapItem(id) {
  const item = getRoadmapItemById(id);
  const parentId = item ? item.parent_id : null;
  const removed = getRoadmap().filter(r => r.id === id || r.parent_id === id).map(r => r.id);
  // Supprimer un parent emporte ses enfants
  _state.roadmap = (_state.roadmap || []).filter(r => r.id !== id && r.parent_id !== id);
  // …mais jamais les tâches liées : réorganiser sa roadmap ne doit pas faire
  // disparaître du travail déjà planifié. Elles perdent seulement leur lien.
  getTasks().forEach(t => {
    if (removed.includes(t.linked_subgoal_id)) t.linked_subgoal_id = null;
  });
  // Idem pour les livrables : ils documentent un résultat produit, le perdre
  // parce qu'on réorganise la roadmap n'aurait aucun sens.
  getDeliverables().forEach(d => {
    if (removed.includes(d.linked_objective_id)) d.linked_objective_id = null;
  });
  _syncFromChildren(parentId);
  _persist(); _notify();
}

// Réécrit la roadmap en bloc (import) puis resynchronise tous les parents
export function replaceRoadmap(items) {
  _state.roadmap = items;
  [...new Set(items.filter(i => i.parent_id).map(i => i.parent_id))].forEach(_syncFromChildren);
  // Un import qui remplace tout peut faire disparaître des sous-objectifs liés
  getTasks().forEach(t => {
    if (t.linked_subgoal_id && !items.some(i => i.id === t.linked_subgoal_id)) t.linked_subgoal_id = null;
  });
  getDeliverables().forEach(d => {
    if (d.linked_objective_id && !items.some(i => i.id === d.linked_objective_id)) d.linked_objective_id = null;
  });
  _persist(); _notify();
}

// ── Pont Roadmap ↔ Tâches ───────────────────────────────────
// Source de vérité unique pour la validation d'un sous-objectif, quel que soit
// le point d'entrée (carte Roadmap ou tâche liée). Met à jour le sous-objectif,
// son parent, et la tâche liée s'il y en a une.
export function setSubgoalDone(subgoalId, done) {
  const child = getRoadmapItemById(subgoalId);
  if (!child || !child.parent_id) return;
  child.completed = done;
  child.progress  = done ? Math.max(child.target || 1, 1) : 0;
  _syncFromChildren(child.parent_id);
  const task = getTaskBySubgoalId(subgoalId);
  if (task) task.done = done;
  _persist(); _notify();
}

export function toggleRoadmapChild(id) {
  const child = getRoadmapItemById(id);
  if (child) setSubgoalDone(id, !child.completed);
}

// Pendant côté tâche : cocher une tâche liée valide son sous-objectif.
export function setTaskDone(taskId, done) {
  const task = getTaskById(taskId);
  if (!task) return;
  task.done = done;
  if (task.linked_subgoal_id) {
    setSubgoalDone(task.linked_subgoal_id, done);   // persiste et notifie
    return;
  }
  _persist(); _notify();
}

export function getTaskBySubgoalId(subgoalId) {
  return getTasks().find(t => t.linked_subgoal_id === subgoalId);
}

// Dès qu'un objectif a des enfants, sa progression est dérivée : progress = enfants
// validés, target = nombre d'enfants, et il se valide/dévalide automatiquement.
function _syncFromChildren(parentId) {
  if (!parentId) return;
  const parent = getRoadmapItemById(parentId);
  if (!parent) return;
  const children = getRoadmap().filter(r => r.parent_id === parentId);
  if (!children.length) return;   // plus d'enfant : l'objectif redevient manuel
  parent.target    = children.length;
  parent.progress  = children.filter(c => c.completed).length;
  parent.completed = parent.progress === children.length;
}

function _syncChildrenCategory(parentId) {
  const parent = getRoadmapItemById(parentId);
  if (!parent) return;
  getRoadmap().forEach(r => { if (r.parent_id === parentId) r.category = parent.category; });
}

// ── Statistiques de prospection ─────────────────────────────
// Fonction pure : seule source de vérité de l'entonnoir, la vue ne fait
// qu'afficher. On compte par CONTACT atteint et non par événement brut — un
// contact relancé trois fois ne vaut qu'une demande — sinon les taux de
// conversion seraient mécaniquement faussés par l'effort de relance.
// Exception assumée : `relances` compte les événements, c'est un volume d'effort.
export const RDV_TYPES = ['rdv_fixe', 'rdv_passe', 'rdv_annule', 'appel_passe'];

export function getProspectionStats(contacts = [], { sinceDays } = {}) {
  let cutoff = null;
  if (Number.isFinite(sinceDays) && sinceDays > 0) {
    const d = new Date();
    d.setDate(d.getDate() - (sinceDays - 1));   // fenêtre incluant aujourd'hui
    cutoff = ymd(d);
  }
  // Une interaction sans date ne peut pas être située : elle sort de la fenêtre
  const inWindow = i => (cutoff ? typeof i?.date === 'string' && i.date >= cutoff : true);

  let demandes = 0, acceptations = 0, rdv = 0;
  let messagesEnvoyes = 0, emailsEnvoyes = 0, relances = 0;

  (contacts || []).forEach(c => {
    const inter = (c?.interactions || []).filter(inWindow);
    if (!inter.length) return;
    const has = (...types) => inter.some(i => types.includes(i.type));

    if (has('li_demande'))              demandes++;
    if (has('li_accepte'))              acceptations++;
    // Décrocher l'échange est ce qui compte : qu'il soit fixé, tenu, annulé ou
    // remplacé par un appel, le prospect a accepté de parler.
    if (has(...RDV_TYPES))              rdv++;
    if (has('li_msg_envoye'))           messagesEnvoyes++;
    if (has('email_envoye'))            emailsEnvoyes++;
    relances += inter.filter(i => i.type === 'relance').length;
  });

  // null plutôt que NaN quand le dénominateur est nul : la vue affiche « — »
  const rate = (num, den) => (den > 0 ? Math.round((num / den) * 100) : null);

  return {
    demandes, acceptations, rdv,
    tauxAcceptation: rate(acceptations, demandes),
    tauxRdv:         rate(rdv, acceptations),
    tauxGlobal:      rate(rdv, demandes),
    messagesEnvoyes, emailsEnvoyes, relances,
  };
}

// ── Livrables (slides markdown) ─────────────────────────────
// Une slide = un bloc du markdown découpé sur les lignes ne contenant que `---`.
// Seule source de vérité du découpage : tout le reste de l'app passe par ici.
export function splitSlides(markdown) {
  return (markdown || '')
    .split(/^[ \t]*---[ \t]*$/m)
    .map(block => block.trim())
    .filter(Boolean);
}

export function getDeliverables()      { return _state.deliverables || []; }
export function getDeliverableById(id) { return getDeliverables().find(d => d.id === id); }

// Résolution objectif → livrable, partagée par la Roadmap et la vue Livrables
export function getDeliverableForObjective(objId) {
  if (!objId) return null;
  return getDeliverables().find(d => d.linked_objective_id === objId) || null;
}

export function saveDeliverable(dlv) {
  if (!_state.deliverables) _state.deliverables = [];
  const item = { ...dlv, id: dlv.id || uid('dlv'), updated: todayStr() };
  // La dimension est toujours héritée de l'objectif lié, s'il y en a un
  const obj = item.linked_objective_id ? getRoadmapItemById(item.linked_objective_id) : null;
  if (obj) item.dimension = obj.category;
  else item.linked_objective_id = null;
  const idx = _state.deliverables.findIndex(d => d.id === item.id);
  if (idx >= 0) _state.deliverables[idx] = item;
  else {
    item.order = _state.deliverables.length
      ? Math.max(..._state.deliverables.map(d => d.order || 0)) + 1 : 1;
    _state.deliverables.push(item);
  }
  _persist(); _notify();
  return item;
}

export function deleteDeliverable(id) {
  _state.deliverables = getDeliverables().filter(d => d.id !== id);
  // Le pitch référence des slides : retirer celles du livrable disparu
  _state.pitch.slides = getPitchSlides().filter(s => s.deliverable_id !== id);
  _persist(); _notify();
}

// ── Pitch deck ──────────────────────────────────────────────
// Une playlist de références { deliverable_id, slide_index } : jamais une copie,
// le pitch rend donc toujours la version courante de la slide dans son livrable.
export function getPitchSlides() {
  if (!_state.pitch) _state.pitch = { slides: [] };
  if (!Array.isArray(_state.pitch.slides)) _state.pitch.slides = [];
  return _state.pitch.slides;
}

export function isSlideInPitch(deliverableId, slideIndex) {
  return getPitchSlides().some(s => s.deliverable_id === deliverableId && s.slide_index === slideIndex);
}

export function addPitchSlide(deliverableId, slideIndex) {
  if (isSlideInPitch(deliverableId, slideIndex)) return false;
  getPitchSlides().push({ deliverable_id: deliverableId, slide_index: slideIndex });
  _persist(); _notify();
  return true;
}

export function removePitchSlide(position) {
  const slides = getPitchSlides();
  if (position < 0 || position >= slides.length) return;
  slides.splice(position, 1);
  _persist(); _notify();
}

export function removePitchSlideRef(deliverableId, slideIndex) {
  const pos = getPitchSlides().findIndex(s => s.deliverable_id === deliverableId && s.slide_index === slideIndex);
  if (pos >= 0) removePitchSlide(pos);
}

export function movePitchSlide(position, dir) {
  const slides = getPitchSlides();
  const target = position + dir;
  if (position < 0 || position >= slides.length || target < 0 || target >= slides.length) return;
  [slides[position], slides[target]] = [slides[target], slides[position]];
  _persist(); _notify();
}

// Résout les références en slides concrètes. Une référence orpheline (livrable
// supprimé, ou index devenu hors borne après édition) est marquée `missing`
// plutôt que de faire planter l'assembleur.
export function resolvePitchSlides() {
  return getPitchSlides().map(ref => {
    const dlv = getDeliverableById(ref.deliverable_id);
    if (!dlv) return { ...ref, missing: true, deliverable: null, markdown: '' };
    const blocks = splitSlides(dlv.markdown);
    if (ref.slide_index >= blocks.length) return { ...ref, missing: true, deliverable: dlv, markdown: '' };
    return { ...ref, missing: false, deliverable: dlv, markdown: blocks[ref.slide_index] };
  });
}

// ── Scores des 8 dimensions ─────────────────────────────────
// Toujours dérivé de la roadmap, jamais stocké : le score d'une dimension est le
// nombre d'objectifs RACINES validés qui la portent, plafonné à 10. Les sous-objectifs
// ne comptent pas — sinon découper un objectif ferait monter l'axe sans travail réel.
export function getDimensionScores() {
  const scores = {};
  DIMENSION_KEYS.forEach(k => { scores[k] = 0; });
  getRoadmap().forEach(item => {
    if (item.parent_id) return;
    if (!item.completed) return;
    if (scores[item.category] === undefined) return;
    scores[item.category] = Math.min(scores[item.category] + 1, 10);
  });
  return scores;
}

export function getWeakestDimensions() {
  const scores = getDimensionScores();
  const min = Math.min(...DIMENSION_KEYS.map(k => scores[k]));
  return DIMENSION_KEYS.filter(k => scores[k] === min).map(k => ({ ...getDimension(k), score: min }));
}

// ── Tâches récurrentes ──────────────────────────────────────
export function isRecurring(task)      { return !!task && task.recurrence && task.recurrence !== 'none'; }
export function getRecurringTasks()    { return getTasks().filter(isRecurring); }
export function getOneShotTasks()      { return getTasks().filter(t => !isRecurring(t)); }

export function isDueOn(task, dateStr = todayStr()) {
  if (!isRecurring(task)) return false;
  if (task.recurrence === 'daily') return true;
  if (task.recurrence === 'weekly') {
    const dow = new Date(dateStr + 'T00:00:00').getDay();
    return (task.weekdays || []).includes(dow);
  }
  return false;
}

export function isDoneOn(task, dateStr = todayStr()) {
  return (task.completions || []).includes(dateStr);
}

// Cocher ajoute la date du jour à l'historique, décocher la retire : une tâche
// récurrente n'est jamais « terminée » définitivement.
export function toggleTaskDay(id, dateStr = todayStr()) {
  const task = getTaskById(id);
  if (!task) return;
  if (!Array.isArray(task.completions)) task.completions = [];
  const idx = task.completions.indexOf(dateStr);
  if (idx >= 0) task.completions.splice(idx, 1);
  else task.completions.push(dateStr);
  _persist(); _notify();
}

// Nombre de jours dus consécutifs respectés. La journée en cours ne casse pas le
// streak tant qu'elle n'est pas terminée.
export function getStreak(task, fromDate = todayStr()) {
  if (!isRecurring(task)) return 0;
  const done = new Set(task.completions || []);
  let streak = 0;
  const cursor = new Date(fromDate + 'T00:00:00');
  for (let i = 0; i < 365; i++) {
    const ds = ymd(cursor);
    if (isDueOn(task, ds)) {
      if (done.has(ds)) streak++;
      else if (i > 0) break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Frise des N derniers jours : { date, due, done }
export function getRecentDays(task, n = 7, fromDate = todayStr()) {
  const out = [];
  const cursor = new Date(fromDate + 'T00:00:00');
  cursor.setDate(cursor.getDate() - (n - 1));
  for (let i = 0; i < n; i++) {
    const ds = ymd(cursor);
    out.push({ date: ds, due: isDueOn(task, ds), done: isDoneOn(task, ds) });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function getDueToday(dateStr = todayStr()) {
  return getRecurringTasks().filter(t => isDueOn(t, dateStr));
}

// ── Quick wins (file « temps mort ») ────────────────────────
export function getQuickWins() {
  return getTasks().filter(t => t.quickwin && !isRecurring(t) && !t.done);
}

// Tire une tâche courte : priorité aux quadrants Q1/Q2, aléatoire à priorité égale.
export function pickQuickWin(excludeId = null) {
  const pool = getQuickWins().filter(t => t.id !== excludeId);
  if (!pool.length) return null;
  const priority = pool.filter(t => t.quadrant === 'Q1' || t.quadrant === 'Q2');
  const from = priority.length ? priority : pool;
  return from[Math.floor(Math.random() * from.length)];
}

export function getCalendarEvents()       { return _state.calendar_events || []; }
export function getCalendarEventById(id)  { return getCalendarEvents().find(e => e.id === id); }
export function getEventByTaskId(taskId)  { return getCalendarEvents().find(e => e.task_id === taskId); }

export function saveCalendarEvent(event) {
  if (!_state.calendar_events) _state.calendar_events = [];
  const idx = _state.calendar_events.findIndex(e => e.id === event.id);
  if (idx >= 0) _state.calendar_events[idx] = event;
  else _state.calendar_events.push({ ...event, id: uid('ev') });
  _persist(); _notify();
}

export function deleteCalendarEvent(id) {
  _state.calendar_events = (_state.calendar_events || []).filter(e => e.id !== id);
  _persist(); _notify();
}

export function saveHabit(habit) {
  const today = todayStr();
  const idx = _state.habits.findIndex(h => h.date === today);
  if (idx >= 0) _state.habits[idx] = { ..._state.habits[idx], ...habit };
  // Les 4 booléens d'habitude sont devenus des tâches récurrentes : il ne reste
  // ici que l'énergie du jour.
  else _state.habits.unshift({ id: uid('h'), date: today, energy_score: 0, ...habit });
  _persist(); _notify();
}

// ── Export / Import ─────────────────────────────────────────
export function exportDB() {
  const blob = new Blob([JSON.stringify(_state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `founder-os-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importDB(jsonStr) {
  try {
    const data = JSON.parse(jsonStr);
    if (!data || typeof data !== 'object') return false;
    _state = data;
    _migrate(_state);           // un backup d'une version antérieure est migré à l'import
    _persist(); _notify();
    return true;
  } catch {
    return false;
  }
}

// ── Reset ────────────────────────────────────────────────────
// La remise à zéro doit aussi toucher le fichier lié : sinon celui-ci
// restaurerait tout au rechargement et le bouton semblerait sans effet.
export async function resetDB() {
  localStorage.removeItem(DB_KEY);
  const seed = (await _fetchSeed()) || _emptyDB();
  _migrate(seed);
  try { await flushBackup(seed); } catch {}
  location.reload();
}

// ── Privé ────────────────────────────────────────────────────
// Point d'accroche unique de la sauvegarde : toute mutation passe par ici,
// donc rien n'a besoin d'appeler backupNow() ailleurs — et rien ne le déclenche
// deux fois. L'écriture fichier est débouncée et ne bloque jamais le runtime.
function _persist() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(_state)); } catch {}
  try { backupNow(_state); } catch {}
}

function _emptyDB() {
  return {
    meta: {
      phase: 'Discovery', week: 1, focus_today: '', quote: '', quote_author: '',
      eval_date: '', schema_version: SCHEMA_VERSION, habits_migrated: true, updated: todayStr(),
    },
    tasks: [], contacts: [], interviews: [], ideas: [], habits: [], insights: [], calendar_events: [], roadmap: [],
    deliverables: [], pitch: { slides: [] },
    finance: { scenarios: [], activeScenarioId: null, activeAssumptions: null, actuals: {} }
  };
}

// ── Helpers DOM ──────────────────────────────────────────────
export function qs(sel, ctx = document)  { return ctx.querySelector(sel); }
export function qsa(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const child of children) {
    if (child == null) continue;
    e.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return e;
}

export function setHTML(node, html) { node.innerHTML = html; }

// ── Helpers data ─────────────────────────────────────────────
export function uid(prefix = 'x') {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

// Date locale au format AAAA-MM-JJ. Surtout pas toISOString() : il convertit en UTC,
// donc à l'est de Greenwich minuit local retombe sur la veille et décale tous les jours.
export function ymd(date) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function todayStr() {
  return ymd(new Date());
}

export function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  const diff = Date.now() - new Date(dateStr + 'T00:00:00').getTime();
  return Math.floor(diff / 86400000);
}

export function starsHTML(n, max = 5, clickable = false, prefix = '') {
  return Array.from({ length: max }, (_, i) =>
    `<span class="star ${i < n ? 'filled' : ''}" ${clickable ? `data-star="${i + 1}" data-prefix="${prefix}"` : ''}>★</span>`
  ).join('');
}

export function badgeStatus(status) {
  const map = {
    'Actif': 'badge-actif',
    'À nurture': 'badge-nurture',
    'Discussion': 'badge-discussion',
    'Froid': 'badge-froid',
  };
  return `<span class="badge ${map[status] || 'badge-q3'}">${status}</span>`;
}

export function badgeQuadrant(q) {
  return `<span class="badge badge-${q.toLowerCase()}">${q}</span>`;
}

// ── Toast ────────────────────────────────────────────────────
let _toastContainer = null;

export function toast(msg, type = 'default') {
  if (!_toastContainer) {
    _toastContainer = el('div', { class: 'toast-container' });
    document.body.appendChild(_toastContainer);
  }
  const t = el('div', { class: `toast ${type}` }, msg);
  _toastContainer.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ── Modal de confirmation (remplace confirm() natif) ─────────
export function confirmModal(message, onConfirm, confirmLabel = 'Supprimer') {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '2000';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:400px">
      <div class="modal-body" style="padding:28px 24px 20px">
        <div style="font-weight:700;font-size:1rem;margin-bottom:8px">Confirmation</div>
        <div style="font-size:.9rem;color:var(--text-2)">${message}</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="conf-cancel">Annuler</button>
        <button class="btn btn-danger" id="conf-ok">${confirmLabel}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#conf-cancel').onclick = close;
  overlay.querySelector('#conf-ok').onclick = () => { close(); onConfirm(); };
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
}

// ── Modal générique ──────────────────────────────────────────
export function openModal({ title, bodyHTML, onSave, onDelete, saveLabel = 'Enregistrer', showDelete = false }) {
  closeModal();
  const overlay = el('div', {
    class: 'modal-overlay',
    onclick: e => { if (e.target === overlay) closeModal(); }
  });

  const deleteBtn = showDelete
    ? `<button class="btn btn-danger btn-sm" id="modal-delete-btn">Supprimer</button>`
    : '';

  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <div class="modal-title">${title}</div>
        <button class="btn-close" id="modal-close-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">${bodyHTML}</div>
      <div class="modal-footer">
        ${deleteBtn}
        <button class="btn btn-secondary" id="modal-cancel-btn">Annuler</button>
        <button class="btn btn-primary" id="modal-save-btn">${saveLabel}</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  document.getElementById('modal-close-btn').onclick = closeModal;
  document.getElementById('modal-cancel-btn').onclick = closeModal;
  if (onSave) document.getElementById('modal-save-btn').onclick = () => onSave(overlay);
  if (showDelete && onDelete) document.getElementById('modal-delete-btn').onclick = onDelete;

  // Trap focus
  document.addEventListener('keydown', _escHandler);
}

export function closeModal() {
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();
  document.removeEventListener('keydown', _escHandler);
}

function _escHandler(e) { if (e.key === 'Escape') closeModal(); }

// ── Helpers texte ────────────────────────────────────────────
export function truncate(str, n = 80) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n) + '…' : str;
}

export function parseTagsInput(str) {
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

export function tagsToInput(arr) {
  return (arr || []).join(', ');
}
