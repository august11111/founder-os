/* ============================================================
   FOUNDER OS — Import d'une base marché (CSV ou JSON)
   Générique par construction : les colonnes du socle sont reconnues par
   alias FR/EN, et TOUTE colonne inconnue est conservée dans `custom`.
   Aucun schéma métier n'est codé en dur.
   ============================================================ */

import {
  COMPANY_FIELDS, normalizeText, newCompany, findCompanyByName, findCompanyByRef,
  getCompaniesList, getContacts, uid, todayStr,
} from './core.js';

// ── Reconnaissance des colonnes ─────────────────────────────
// Chaque entrée : champ du socle → alias acceptés. La comparaison est faite
// sur le libellé normalisé (minuscules, sans accents, ponctuation réduite).
export const COLUMN_ALIASES = {
  ref:          ['ref', 'reference', 'id', 'identifiant', 'code'],
  name:         ['name', 'nom', 'societe', 'société', 'company', 'entreprise', 'raison sociale'],
  group:        ['group', 'groupe', 'reseau', 'réseau', 'groupe / reseau', 'groupe reseau', 'holding'],
  parent:       ['parent', 'rattache a', 'rattaché à', 'maison mere', 'maison mère', 'societe mere', 'société mère'],
  website:      ['website', 'site', 'site web', 'url', 'web'],
  city:         ['city', 'ville', 'ville / implantation', 'ville implantation', 'localisation', 'implantation'],
  region:       ['region', 'région', 'departement', 'département'],
  sector:       ['sector', 'secteur', 'segment', 'segment principal', 'industrie', 'industry'],
  activities:   ['activities', 'activites', 'activités', 'metiers', 'métiers', 'activites / metiers', 'activités / métiers'],
  priority:     ['priority', 'priorite', 'priorité', 'prio'],
  score:        ['score', 'note', 'scoring', 'notation'],
  status:       ['status', 'statut', 'statut discovery', 'etape', 'étape', 'stage'],
  target_role:  ['target role', 'role cible', 'rôle cible', 'contact cible', 'role / contact cible', 'rôle / contact cible'],
  email:        ['email', 'mail', 'e-mail', 'email public', 'courriel'],
  phone:        ['phone', 'telephone', 'téléphone', 'tel', 'tél'],
  size:         ['size', 'taille', 'multi-sites', 'multi sites', 'effectif'],
  note:         ['note', 'notes', 'commentaire', 'comment', 'remarque'],
};

// Fusionnées en liste : source, sources, source 1, source 2…
const SOURCE_RE = /^sources?( ?\d+)?$/;

// Colonnes décrivant une personne, portée par la même ligne que l'entreprise
export const CONTACT_ALIASES = {
  contact_name:     ['contact name', 'contact nominatif', 'contact', 'nom du contact', 'interlocuteur'],
  contact_role:     ['contact role', 'role', 'rôle', 'fonction', 'poste'],
  contact_email:    ['contact email', 'contact mail', 'email contact'],
  contact_phone:    ['contact phone', 'contact telephone', 'telephone contact'],
  contact_linkedin: ['contact linkedin', 'linkedin', 'linkedin contact', 'profil linkedin'],
};

const _key = s => normalizeText(s).replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();

const _LOOKUP = (() => {
  const map = new Map();
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    aliases.forEach(a => map.set(_key(a), field));
  }
  for (const [field, aliases] of Object.entries(CONTACT_ALIASES)) {
    aliases.forEach(a => map.set(_key(a), field));
  }
  return map;
})();

// Retourne le champ du socle correspondant à un en-tête, ou null si inconnu.
export function matchColumn(header) {
  const k = _key(header);
  if (!k) return null;
  if (SOURCE_RE.test(k)) return 'sources';
  return _LOOKUP.get(k) || null;
}

// ── Lecture CSV ─────────────────────────────────────────────
// Analyseur minimal mais correct : guillemets, séparateurs échappés, sauts de
// ligne dans les cellules. Détecte automatiquement `,` `;` ou tabulation.
export function parseCSV(text) {
  const src = (text || '').replace(/^﻿/, '');
  if (!src.trim()) return [];
  const delim = _detectDelimiter(src);
  const rows = [];
  let row = [], cell = '', inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === delim) { row.push(cell); cell = ''; continue; }
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    if (ch === '\r') continue;
    cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

function _detectDelimiter(src) {
  const line = src.split('\n')[0];
  const counts = [[';', 0], [',', 0], ['\t', 0]].map(([d]) => {
    let n = 0, q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === d && !q) n++;
    }
    return [d, n];
  });
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

// ── Analyse d'une source (CSV ou JSON) ──────────────────────
// Retourne { companies, contacts, errors, unmapped } sans rien écrire.
export function parseMarketBase(raw) {
  const text = (raw || '').trim();
  if (!text) return { companies: [], contacts: [], errors: [{ line: 0, reason: 'Contenu vide' }], unmapped: [] };
  return (text[0] === '{' || text[0] === '[') ? _parseJSON(text) : _parseRows(parseCSV(text));
}

function _parseJSON(text) {
  let data;
  try { data = JSON.parse(text); }
  catch (e) { return { companies: [], contacts: [], errors: [{ line: 0, reason: 'JSON invalide : ' + e.message }], unmapped: [] }; }

  const list = Array.isArray(data) ? data : Array.isArray(data.companies) ? data.companies : null;
  if (!list) {
    return { companies: [], contacts: [], errors: [{ line: 0, reason: 'Format attendu : un tableau, ou { "companies": [...] }' }], unmapped: [] };
  }

  // Les clés JSON passent par la même reconnaissance d'alias que les colonnes
  // CSV : un export brut d'Excel (« Société », « Groupe / réseau »…) est donc
  // accepté tel quel, au même titre que le format socle.
  const companies = [], errors = [], unmapped = new Set();
  const inlineContacts = [];

  list.forEach((item, i) => {
    const co = { name: '', custom: {}, sources: [] };
    const person = {};

    for (const [k, v] of Object.entries(item)) {
      if (v === null || v === undefined || v === '') continue;
      if (k === 'custom' && typeof v === 'object') { Object.assign(co.custom, v); continue; }
      if (k === 'parent') { co.parent = String(v).trim(); continue; }
      if (k === 'sources') {
        co.sources.push(...(Array.isArray(v) ? v.map(String) : [String(v)]));
        continue;
      }
      const field = COMPANY_FIELDS.includes(k) ? k : matchColumn(k);
      if (field === 'sources') { co.sources.push(String(v)); continue; }
      if (field === 'parent')  { co.parent = String(v).trim(); continue; }
      if (field && field.startsWith('contact_')) { person[field] = String(v).trim(); continue; }
      if (field) { co[field] = typeof v === 'string' ? v.trim() : v; continue; }
      co.custom[k] = v;            // rien n'est perdu
      unmapped.add(k);
    }

    if (!co.name) { errors.push({ line: i + 1, reason: 'Nom d’entreprise manquant' }); return; }
    companies.push(co);

    if (person.contact_name) {
      inlineContacts.push({
        name: person.contact_name, company: co.name,
        role: person.contact_role || '', email: person.contact_email || co.email || '',
        phone: person.contact_phone || '', linkedin: person.contact_linkedin || '',
      });
    }
  });

  // Contacts fournis dans un tableau à part, en plus de ceux portés par les lignes
  const listed = (Array.isArray(data.contacts) ? data.contacts : []).map(c => ({
    name: (c.name ?? c.nom ?? '').toString().trim(),
    company: (c.company ?? c.entreprise ?? c.societe ?? '').toString().trim(),
    role: (c.role ?? '').toString().trim(),
    email: (c.email ?? '').toString().trim(),
    phone: (c.phone ?? '').toString().trim(),
    linkedin: (c.linkedin ?? '').toString().trim(),
  })).filter(c => c.name);

  // Dédoublonnage : une même personne peut figurer dans la ligne et dans la liste
  const seen = new Set();
  const contacts = [...listed, ...inlineContacts].filter(c => {
    const k = normalizeText(c.name) + '|' + normalizeText(c.company);
    return seen.has(k) ? false : seen.add(k);
  });

  return { companies, contacts, errors, unmapped: [...unmapped] };
}

function _parseRows(rows) {
  if (!rows.length) return { companies: [], contacts: [], errors: [{ line: 0, reason: 'Aucune ligne' }], unmapped: [] };
  const headers = rows[0].map(h => h.trim());
  const fields = headers.map(matchColumn);

  if (!fields.includes('name')) {
    return {
      companies: [], contacts: [], unmapped: [],
      errors: [{ line: 1, reason: 'Aucune colonne de nom reconnue. Attendu : ' + COLUMN_ALIASES.name.slice(0, 5).join(', ') }],
    };
  }

  const companies = [], contacts = [], errors = [], unmapped = new Set();
  headers.forEach((h, i) => { if (!fields[i] && h) unmapped.add(h); });

  rows.slice(1).forEach((cells, r) => {
    const line = r + 2;                       // +1 en-tête, +1 base 1
    const co = { name: '', custom: {}, sources: [] };
    const person = {};

    headers.forEach((header, i) => {
      const value = (cells[i] ?? '').trim();
      if (!value) return;
      const field = fields[i];
      if (!field) { co.custom[header] = value; return; }
      if (field === 'sources') { co.sources.push(value); return; }
      if (field.startsWith('contact_')) { person[field] = value; return; }
      co[field] = value;
    });

    if (!co.name) { errors.push({ line, reason: 'Nom d’entreprise manquant' }); return; }
    companies.push(co);

    if (person.contact_name) {
      contacts.push({
        name: person.contact_name, company: co.name,
        role: person.contact_role || '', email: person.contact_email || co.email || '',
        phone: person.contact_phone || '', linkedin: person.contact_linkedin || '',
      });
    }
  });

  return { companies, contacts, errors, unmapped: [...unmapped] };
}

// ── Récapitulatif avant écriture ────────────────────────────
export function analyzeMarketImport(parsed) {
  const pool = getCompaniesList();
  let created = 0, updated = 0;
  const seen = new Set();
  parsed.companies.forEach(co => {
    const match = findCompanyByRef(co.ref, pool) || findCompanyByName(co.name, pool);
    if (match && !seen.has(match.id)) { updated++; seen.add(match.id); }
    else created++;
  });

  // Parents que l'on ne saura pas résoudre : ni fiche existante, ni ligne entrante
  const names = new Set([...pool, ...parsed.companies].map(c => normalizeText(c.name)));
  const unresolved = parsed.companies
    .filter(co => co.parent && !names.has(normalizeText(co.parent)))
    .map(co => `${co.name} → ${co.parent}`);

  return { created, updated, contacts: parsed.contacts.length, unresolved, errors: parsed.errors.length };
}

// ── Application ─────────────────────────────────────────────
// Fusion, jamais écrasement : les champs descriptifs sont mis à jour, mais le
// `status` suivi à la main et les interactions des contacts sont conservés.
export function applyMarketImport(parsed, { saveCompany, saveContact }) {
  const result = { created: 0, updated: 0, contacts: 0, unresolved: [] };
  const byName = new Map();

  // Passe 1 — créer ou compléter les entreprises
  parsed.companies.forEach(row => {
    const pool = getCompaniesList();
    const existing = findCompanyByRef(row.ref, pool) || findCompanyByName(row.name, pool);
    const base = existing ? { ...existing } : newCompany({ name: row.name });

    COMPANY_FIELDS.forEach(f => {
      if (f === 'status' && existing) return;          // statut : suivi manuel, on n'y touche pas
      if (row[f] !== undefined && row[f] !== '') base[f] = row[f];
    });
    base.sources = [...new Set([...(base.sources || []), ...(row.sources || [])])];
    base.custom  = { ...(base.custom || {}), ...(row.custom || {}) };
    if (!existing && !base.status) base.status = 'À contacter';

    const saved = saveCompany(base);
    if (existing) result.updated++; else result.created++;
    byName.set(normalizeText(saved.name), saved);
    if (row.parent) saved._wantedParent = row.parent;
  });

  // Passe 2 — résoudre les parents une fois toutes les fiches créées
  parsed.companies.forEach(row => {
    if (!row.parent) return;
    const self = byName.get(normalizeText(row.name)) || findCompanyByName(row.name);
    if (!self) return;
    let parent = byName.get(normalizeText(row.parent)) || findCompanyByName(row.parent);
    // À défaut, rattacher à la fiche qui porte le même libellé de groupe
    if (!parent && row.group) parent = byName.get(normalizeText(row.group)) || findCompanyByName(row.group);
    if (!parent || parent.id === self.id) { result.unresolved.push(`${row.name} → ${row.parent}`); return; }
    saveCompany({ ...findCompanyByName(row.name), parent_id: parent.id });
  });

  // Passe 3 — contacts rattachés à leur entreprise
  parsed.contacts.forEach(p => {
    const co = findCompanyByName(p.company);
    const already = getContacts().find(c =>
      normalizeText(c.name) === normalizeText(p.name) && c.company_id === (co ? co.id : null));
    if (already) return;
    saveContact({
      id: uid('c'), name: p.name, company: co ? co.name : p.company, company_id: co ? co.id : null,
      poste: p.role || '', pertinence: 3, notes: '',
      interactions: [], email: p.email || '', phone: p.phone || '', linkedin: p.linkedin || '',
    });
    result.contacts++;
  });

  return result;
}

// ── Gabarit générique ───────────────────────────────────────
// Volontairement neutre : c'est ce que voit quelqu'un qui découvre l'outil.
export const TEMPLATE_CSV = [
  'Nom;Groupe;Rattaché à;Site web;Ville;Région;Secteur;Activités;Priorité;Score;Statut;Rôle cible;Email;Téléphone;Taille;Note;Source 1;Contact nominatif;Rôle;LinkedIn',
  'Société Exemple;Groupe Exemple;;https://exemple.fr;Lyon;Auvergne-Rhône-Alpes;Services;Conseil, formation;Haute;8;À contacter;Responsable achats;contact@exemple.fr;01 23 45 67 89;grande;Rencontrés au salon;Annuaire pro;Camille Durand;Responsable achats;https://linkedin.com/in/exemple',
  'Autre Exemple;;;https://autre-exemple.fr;Nantes;Pays de la Loire;Industrie;Fabrication;Moyenne;5;À contacter;Directeur technique;;;petite;;Site web;;;',
  '',
].join('\n');

export function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'base-marche-gabarit.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCompanies(companies) {
  const blob = new Blob([JSON.stringify({ companies }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `base-marche-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
