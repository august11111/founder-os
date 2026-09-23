/* ============================================================
   FOUNDER OS — Sauvegarde automatique dans un fichier du PC
   Seul module à connaître la File System Access API et IndexedDB.
   Le localStorage reste le moteur runtime ; ce fichier est la copie
   durable, tenue à jour en continu.
   ============================================================ */

const IDB_NAME  = 'founder_os_backup';
const IDB_STORE = 'handles';
const IDB_KEY   = 'file';
const DEBOUNCE_MS = 1500;
const DEFAULT_NAME = 'founder-os-db.json';

// ── États possibles ─────────────────────────────────────────
// unlinked   : aucun fichier lié
// linked     : fichier lié, permission accordée
// pending    : écriture programmée (débounce en cours)
// writing    : écriture en cours
// permission : fichier lié mais permission à re-confirmer (un clic)
// missing    : fichier introuvable ou déplacé
// error      : échec d'écriture
let _handle = null;
let _status = { state: 'unlinked', fileName: null, lastWrite: null, error: null };

const _listeners = new Set();

export function onBackupStatus(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function getBackupStatus() { return { ..._status, supported: isBackupSupported() }; }

function _setStatus(patch) {
  _status = { ..._status, ...patch };
  _listeners.forEach(fn => { try { fn(getBackupStatus()); } catch {} });
}

export function isBackupSupported() {
  return typeof window !== 'undefined'
    && typeof window.showSaveFilePicker === 'function'
    && typeof window.indexedDB !== 'undefined';
}

// ── IndexedDB : persistance du handle entre les rechargements ──
// Les FileSystemFileHandle sont sérialisables par le navigateur : on peut les
// stocker tels quels, ce qui évite de redemander le fichier à chaque visite.
function _openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function _idb(mode, fn) {
  return _openIDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, mode);
    const req = fn(tx.objectStore(IDB_STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  }));
}

const _idbGet = () => _idb('readonly',  store => store.get(IDB_KEY));
const _idbSet = v => _idb('readwrite', store => store.put(v, IDB_KEY));
const _idbDel = () => _idb('readwrite', store => store.delete(IDB_KEY));

// ── Permissions ─────────────────────────────────────────────
async function _hasPermission(interactive = false) {
  if (!_handle) return false;
  const opts = { mode: 'readwrite' };
  try {
    if (_handle.queryPermission && (await _handle.queryPermission(opts)) === 'granted') return true;
    // requestPermission exige un geste utilisateur : réservé aux actions de l'UI
    if (interactive && _handle.requestPermission) {
      return (await _handle.requestPermission(opts)) === 'granted';
    }
  } catch {}
  return false;
}

// ── Cycle de vie ────────────────────────────────────────────
// Restaure le handle au démarrage. Ne demande jamais de permission ici :
// sans geste utilisateur le navigateur refuserait de toute façon.
export async function initBackup() {
  if (!isBackupSupported()) { _setStatus({ state: 'unlinked' }); return null; }
  try {
    const saved = await _idbGet();
    if (!saved) { _setStatus({ state: 'unlinked', fileName: null }); return null; }
    _handle = saved;
    const granted = await _hasPermission(false);
    _setStatus({ state: granted ? 'linked' : 'permission', fileName: saved.name || DEFAULT_NAME, error: null });
    return _handle;
  } catch (e) {
    _setStatus({ state: 'error', error: e.message });
    return null;
  }
}

export async function linkBackupFile(state) {
  if (!isBackupSupported()) throw new Error('File System Access API indisponible');
  const handle = await window.showSaveFilePicker({
    suggestedName: DEFAULT_NAME,
    types: [{ description: 'Sauvegarde Founder OS', accept: { 'application/json': ['.json'] } }],
  });
  _handle = handle;
  await _idbSet(handle);
  _setStatus({ state: 'linked', fileName: handle.name || DEFAULT_NAME, error: null });
  await flushBackup(state);          // le fichier reflète l'état dès la liaison
  return getBackupStatus();
}

export async function unlinkBackupFile() {
  _handle = null;
  clearTimeout(_timer);
  _pending = null;
  try { await _idbDel(); } catch {}
  _setStatus({ state: 'unlinked', fileName: null, lastWrite: null, error: null });
  return getBackupStatus();
}

// Reconnexion après perte de permission — appelée depuis un clic de l'UI
export async function reconnectBackup(state) {
  if (!_handle) return getBackupStatus();
  const granted = await _hasPermission(true);
  if (!granted) { _setStatus({ state: 'permission' }); return getBackupStatus(); }
  _setStatus({ state: 'linked', error: null });
  if (state) await flushBackup(state);
  return getBackupStatus();
}

// ── Lecture ─────────────────────────────────────────────────
// Retourne le contenu JSON du fichier lié, ou null si rien d'exploitable.
// Ne jette jamais : l'amorçage doit pouvoir continuer sur le localStorage.
export async function loadFromLinkedFile() {
  if (!_handle) return null;
  try {
    if (!(await _hasPermission(false))) { _setStatus({ state: 'permission' }); return null; }
    const file = await _handle.getFile();
    const text = await file.text();
    if (!text.trim()) return null;               // fichier fraîchement créé, encore vide
    const data = JSON.parse(text);
    return data && typeof data === 'object' ? data : null;
  } catch (e) {
    // Fichier déplacé ou supprimé : on signale, on ne perd rien
    _setStatus({ state: e.name === 'NotFoundError' ? 'missing' : 'error', error: e.message });
    return null;
  }
}

// ── Écriture : débounce + file d'attente ────────────────────
let _timer   = null;
let _pending = null;    // dernier instantané sérialisé en attente
let _writing = false;   // une écriture est en vol

// Programme une écriture. Les appels rapprochés sont fusionnés, et deux
// createWritable ne peuvent jamais être ouverts en même temps sur le handle.
export function backupNow(state) {
  if (!_handle) return;
  try { _pending = JSON.stringify(state, null, 2); } catch { return; }
  if (!_writing) _setStatus({ state: 'pending' });
  clearTimeout(_timer);
  _timer = setTimeout(() => { _flush(); }, DEBOUNCE_MS);
}

// Écrit immédiatement, sans attendre le débounce.
export async function flushBackup(state) {
  if (!_handle) return getBackupStatus();
  if (state !== undefined) {
    try { _pending = JSON.stringify(state, null, 2); } catch { return getBackupStatus(); }
  }
  clearTimeout(_timer);
  await _flush();
  return getBackupStatus();
}

async function _flush() {
  // Sérialisation : si une écriture est en cours, celle-ci reprendra la main
  // dans le `finally` ci-dessous avec le dernier instantané en attente.
  if (_writing || _pending === null || !_handle) return;
  _writing = true;
  const data = _pending;
  _pending = null;

  try {
    if (!(await _hasPermission(false))) { _setStatus({ state: 'permission' }); return; }
    _setStatus({ state: 'writing' });
    const writable = await _handle.createWritable();
    await writable.write(data);
    await writable.close();
    _setStatus({ state: 'linked', lastWrite: Date.now(), error: null });
  } catch (e) {
    _setStatus({ state: e.name === 'NotFoundError' ? 'missing' : 'error', error: e.message });
  } finally {
    _writing = false;
    if (_pending !== null) await _flush();   // une mutation est arrivée pendant l'écriture
  }
}
