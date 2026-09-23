/* ============================================================
   FOUNDER OS — Finance UI
   renderFinance(container) — consomme le moteur, sans logique financière
   ============================================================ */

import { DEFAULT_ASSUMPTIONS, computeProjections, computeSensitivity, reefersActifsAuMois, gainEffectifParReeferAn } from './finance-engine.js';
import { getFinanceData, saveFinanceData, toast, uid } from './core.js';

// ─── État du module ───────────────────────────────────────────────────────────
let _a   = null;  // assumptions actives
let _p   = null;  // projections calculées
let _charts = {};
let _activeTab   = 'overview';
let _drawerTab   = 'revenue';
let _drawerOpen  = false;
let _investorMode = false;
let _container   = null;

// ─── Point d'entrée ───────────────────────────────────────────────────────────
export function renderFinance(container) {
  _container = container;
  const data = getFinanceData();
  const activeSc = (data.scenarios||[]).find(s => s.id === data.activeScenarioId) || (data.scenarios||[])[0];
  _a = _clone(activeSc?.assumptions || DEFAULT_ASSUMPTIONS);
  _p = computeProjections(_a);

  container.innerHTML = _buildPage();
  _updateKPIs();
  _switchTab('overview');
  _attachEvents();
}

// ─── Layout principal ─────────────────────────────────────────────────────────
function _buildPage() {
  const data = getFinanceData();
  const scenarios = data.scenarios || [];
  const activeId  = data.activeScenarioId || '';

  return `
    <div class="page-header">
      <div>
        <div class="page-title">Finance</div>
        <div class="page-subtitle" id="fin-subtitle">Modélisation · ${_a.horizonMonths || 36} mois · ${_revenueModelLabel(_a.revenueModel)}</div>
      </div>
      <div class="page-actions" style="flex-wrap:wrap;row-gap:8px">
        <div style="display:flex;gap:6px;align-items:center">
          <select class="form-select" id="fin-scenario-sel" style="height:34px;font-size:.82rem;padding:4px 10px">
            ${scenarios.map(s => `<option value="${s.id}" ${s.id === activeId ? 'selected' : ''}>${s.name}</option>`).join('')}
            ${scenarios.length === 0 ? '<option value="">Base</option>' : ''}
          </select>
          <button class="btn btn-secondary btn-sm" id="fin-scenario-save">Enregistrer</button>
          <button class="btn btn-ghost btn-sm" id="fin-scenario-new">+ Scénario</button>
          <button class="btn btn-ghost btn-sm fin-scenario-del ${scenarios.length <= 1 ? 'hidden' : ''}" id="fin-scenario-del">Supprimer</button>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" id="fin-investor-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Investisseur
          </button>
          <button class="btn btn-ghost btn-sm" id="fin-csv-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            CSV
          </button>
          <button class="btn btn-primary btn-sm" id="fin-drawer-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/></svg>
            Hypothèses
          </button>
        </div>
      </div>
    </div>

    <!-- Mode investisseur banner -->
    <div id="fin-investor-banner" class="fin-investor-banner hidden">
      <div class="fin-investor-label">Mode Présentation Investisseurs</div>
      <textarea id="fin-investor-note" class="fin-investor-note" placeholder="Ajoutez ici votre narrative investisseurs (thèse, traction, use of funds…)"></textarea>
    </div>

    <!-- KPI bar -->
    <div class="fin-kpi-grid" id="fin-kpis"></div>

    <!-- Tabs -->
    <div class="fin-tabs" id="fin-tabs">
      <button class="fin-tab active" data-tab="overview">Vue d'ensemble</button>
      <button class="fin-tab" data-tab="pl">Compte de résultat</button>
      <button class="fin-tab" data-tab="cash">Trésorerie</button>
      <button class="fin-tab" data-tab="hr">Plan RH</button>
      <button class="fin-tab" data-tab="topdown">Top-Down</button>
      <button class="fin-tab" data-tab="sensitivity">Sensibilité</button>
      <button class="fin-tab" data-tab="actual">Réel vs Prévu</button>
    </div>

    <div id="fin-tab-content" class="fin-tab-content"></div>

    <!-- Drawer overlay -->
    <div id="fin-overlay" class="fin-overlay hidden"></div>

    <!-- Hypothèses drawer -->
    <div id="fin-drawer" class="fin-drawer">
      <div class="fin-drawer-hd">
        <div class="fin-drawer-title">Hypothèses</div>
        <button class="btn-close" id="fin-drawer-close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="fin-drawer-tabs">
        ${['revenue','team','opex','cash','tax'].map(t => `
          <button class="fin-dtab ${t === _drawerTab ? 'active' : ''}" data-dtab="${t}">${_drawerTabLabel(t)}</button>
        `).join('')}
      </div>
      <div class="fin-drawer-body" id="fin-drawer-body">
        ${_buildDrawerSection(_drawerTab)}
      </div>
    </div>
  `;
}

// ─── KPI Cards ────────────────────────────────────────────────────────────────
function _updateKPIs() {
  const s = _p.summary;
  const lastM = _p.months[_p.months.length - 1];
  const runwayAlert = (s.runway !== null && s.runway < 6) ? 'fin-kpi-danger' : '';
  const beText = s.breakEvenMonth !== null
    ? `M${s.breakEvenMonth + 1} · ${_fmtMonth(s.breakEvenDate)}`
    : 'Non atteint';

  const kpis = [
    { label: 'Burn Rate', value: _fmtK(-s.burnRate), delta: '/ mois', cls: 'fin-kpi-warn' },
    { label: 'Runway', value: s.runway !== null ? `${s.runway}m` : '∞', delta: s.cashZeroDate ? `Tréso zéro ${_fmtMonth(s.cashZeroDate)}` : 'Cash positif', cls: runwayAlert },
    { label: 'Break-even', value: beText, delta: 'premier mois rentable', cls: '' },
    { label: 'MRR', value: _fmtK(lastM.mrr), delta: `ARR ${_fmtK(lastM.arr)}`, cls: 'fin-kpi-good' },
    { label: 'Marge brute', value: _fmtPct(lastM.grossMarginRate), delta: `${_fmtK(lastM.grossMargin)} / mois`, cls: '' },
    { label: 'CAC', value: _fmtK(s.cac), delta: 'coût acquisition', cls: '' },
    { label: 'LTV', value: _fmtK(s.ltv), delta: s.ltvCac !== null ? `LTV/CAC ${s.ltvCac.toFixed(1)}×` : '', cls: '' },
    { label: 'Trésorerie', value: _fmtK(lastM.cumulativeCash), delta: `point bas ${_fmtK(s.peakCashLow)}`, cls: lastM.cumulativeCash < 0 ? 'fin-kpi-danger' : '' },
  ];

  const el = document.getElementById('fin-kpis');
  if (!el) return;
  el.innerHTML = kpis.map(k => `
    <div class="fin-kpi-card ${k.cls}">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value fin-kpi-val">${k.value}</div>
      <div class="kpi-delta">${k.delta}</div>
    </div>
  `).join('');
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function _switchTab(tab) {
  _destroyCharts();
  _activeTab = tab;
  _pageOffset = 0;

  document.querySelectorAll('.fin-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

  const el = document.getElementById('fin-tab-content');
  if (!el) return;
  el.innerHTML = _buildTabContent(tab);

  requestAnimationFrame(() => _initTabCharts(tab));
}

function _buildTabContent(tab) {
  if (tab === 'overview')     return _buildOverview();
  if (tab === 'pl')           return _buildPL();
  if (tab === 'cash')         return _buildCash();
  if (tab === 'hr')           return _buildHR();
  if (tab === 'topdown')      return _buildTopDown();
  if (tab === 'sensitivity')  return _buildSensitivity();
  if (tab === 'actual')       return _buildActualVsPlanned();
  return '';
}

// ─── Overview ─────────────────────────────────────────────────────────────────
function _buildOverview() {
  const years = _p.years;
  return `
    <div class="fin-chart-wrap">
      <div class="fin-chart-toolbar">
        <span class="fin-chart-title">Projections sur ${_a.horizonMonths || 36} mois</span>
        <div style="display:flex;gap:6px">
          <button class="filter-chip active" data-series="all" id="fin-series-all">Tout</button>
          <button class="filter-chip" data-series="cash" id="fin-series-cash">Trésorerie</button>
          <button class="filter-chip" data-series="pl" id="fin-series-pl">CA / Charges</button>
        </div>
      </div>
      <div style="height:320px"><canvas id="fin-chart-main"></canvas></div>
    </div>

    <div class="fin-section-title" style="margin-top:28px">Résultats annuels</div>
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>
          <th>Année</th><th class="num">CA</th><th class="num">Marge brute</th>
          <th class="num">Masse sal.</th><th class="num">OPEX</th>
          <th class="num">EBITDA</th><th class="num">Résultat net</th>
          <th class="num">Trésorerie fin</th>
        </tr></thead>
        <tbody>
          ${years.map(y => `
            <tr>
              <td><strong>${y.label}</strong></td>
              <td class="num">${_fmtK(y.revenue)}</td>
              <td class="num ${y.grossMarginRate > 0.5 ? 'num-good' : ''}">${_fmtK(y.grossMargin)} <small>(${_fmtPct(y.grossMarginRate)})</small></td>
              <td class="num">${_fmtK(y.personnelCost)}</td>
              <td class="num">${_fmtK(y.opex)}</td>
              <td class="num ${y.ebitda >= 0 ? 'num-good' : 'num-bad'}">${_fmtK(y.ebitda)}</td>
              <td class="num ${y.netResult >= 0 ? 'num-good' : 'num-bad'}">${_fmtK(y.netResult)}</td>
              <td class="num ${y.endCash >= 0 ? '' : 'num-bad'}">${_fmtK(y.endCash)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ─── P&L ──────────────────────────────────────────────────────────────────────
function _buildPL() {
  const ms = _p.months;
  const cols = _visibleMonths();
  return `
    <div class="fin-table-scroll">
      <table class="fin-table fin-table-wide">
        <thead><tr>
          <th class="fin-row-lbl">Ligne P&L</th>
          ${cols.map(i => `<th class="num">${_fmtMonthShort(ms[i].date)}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${_plRow('CA', cols, ms, m => m.revenue, 'fin-row-ca')}
          ${_plRow('COGS', cols, ms, m => -m.cogs, 'fin-row-sub')}
          ${_plRow('Marge brute', cols, ms, m => m.grossMargin, 'fin-row-sub-total')}
          ${_plRow('Masse salariale', cols, ms, m => -m.personnelCost, 'fin-row-sub')}
          ${_plRow('OPEX', cols, ms, m => -m.opex, 'fin-row-sub')}
          ${_plRow('EBITDA', cols, ms, m => m.ebitda, 'fin-row-total')}
          ${_plRow('Intérêts', cols, ms, m => -m.interestExpense, 'fin-row-sub')}
          ${_plRow('Résultat avant IS', cols, ms, m => m.ebt, 'fin-row-sub-total')}
          ${_plRow('IS', cols, ms, m => -m.isAmount, 'fin-row-sub')}
          ${_plRow('CIR reçu', cols, ms, m => m.cirReceived, 'fin-row-sub')}
          ${_plRow('Résultat net', cols, ms, m => m.netResult, 'fin-row-total fin-row-net')}
        </tbody>
      </table>
    </div>
    ${_monthPager()}
  `;
}

function _plRow(label, cols, ms, fn, cls = '') {
  return `<tr class="${cls}">
    <td class="fin-row-lbl">${label}</td>
    ${cols.map(i => { const v = fn(ms[i]); return `<td class="num ${v > 0 ? 'num-good' : v < 0 ? 'num-bad' : ''}">${_fmtK(v)}</td>`; }).join('')}
  </tr>`;
}

// ─── Cash flow ────────────────────────────────────────────────────────────────
function _buildCash() {
  const ms = _p.months;
  const cols = _visibleMonths();
  return `
    <div class="fin-chart-wrap">
      <div class="fin-chart-toolbar"><span class="fin-chart-title">Trésorerie cumulée</span></div>
      <div style="height:200px"><canvas id="fin-chart-cash"></canvas></div>
    </div>
    <div class="fin-table-scroll" style="margin-top:20px">
      <table class="fin-table fin-table-wide">
        <thead><tr>
          <th class="fin-row-lbl">Flux trésorerie</th>
          ${cols.map(i => `<th class="num">${_fmtMonthShort(ms[i].date)}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${_plRow('Encaissements (clients)', cols, ms, m => m.cashReceipts, '')}
          ${_plRow('Décaissements (charges)', cols, ms, m => -m.cashDisbursements, '')}
          ${_plRow('Financement entrant', cols, ms, m => m.financingInflow, '')}
          ${_plRow('Remb. emprunts', cols, ms, m => -m.loanRepayment, '')}
          ${_plRow('TVA nette', cols, ms, m => m.vatCash, '')}
          ${_plRow('IS décaissé', cols, ms, m => -m.isAmount, '')}
          ${_plRow('CIR reçu', cols, ms, m => m.cirReceived, '')}
          ${_plRow('Flux net', cols, ms, m => m.netCashFlow, 'fin-row-total')}
          ${_plRow('Trésorerie cumulée', cols, ms, m => m.cumulativeCash, 'fin-row-net')}
          ${_plRow('BFR', cols, ms, m => m.bfr, 'fin-row-sub')}
        </tbody>
      </table>
    </div>
    ${_monthPager()}
  `;
}

// ─── HR ──────────────────────────────────────────────────────────────────────
function _buildHR() {
  const ms = _p.months;
  const plan = _a.hiringPlan || [];
  const cols = _visibleMonths();
  const charges = +((_a.socialChargesRate) || 0);

  return `
    <div class="fin-chart-wrap">
      <div class="fin-chart-toolbar"><span class="fin-chart-title">Évolution des effectifs & coûts RH</span></div>
      <div style="height:200px"><canvas id="fin-chart-hr"></canvas></div>
    </div>
    <div class="fin-section-title" style="margin-top:28px">Détail par rôle</div>
    <div class="fin-table-scroll">
      <table class="fin-table fin-table-wide">
        <thead><tr>
          <th class="fin-row-lbl">Rôle</th>
          <th>Catégorie</th>
          <th class="num">Salaire brut/an</th>
          <th class="num">Coût total chargé</th>
          ${cols.map(i => `<th class="num">${_fmtMonthShort(ms[i].date)}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${plan.map(h => {
            const monthly = (+(h.salary)||0) / 12;
            const jei = _a.jeiEnabled && (_a.jeiEligibleCategories||[]).includes(h.category);
            const full = monthly * (1 + (jei ? 0 : charges));
            return `<tr>
              <td class="fin-row-lbl"><strong>${h.role}</strong></td>
              <td><span class="badge badge-q3" style="font-size:.7rem">${h.category}</span></td>
              <td class="num">${_fmtK(+(h.salary)||0)}</td>
              <td class="num">${_fmtK(full * 12)} ${jei ? '<span class="badge badge-q2" style="font-size:.65rem">JEI</span>' : ''}</td>
              ${cols.map(i => {
                const active = _isHireActiveSimple(h, i);
                return `<td class="num">${active ? _fmtK(full) : '<span style="color:var(--border-2)">—</span>'}</td>`;
              }).join('')}
            </tr>`;
          }).join('')}
          <tr class="fin-row-total">
            <td class="fin-row-lbl" colspan="2"><strong>Total RH</strong></td>
            <td class="num"><strong>${_fmtK(plan.reduce((s,h) => s+(+(h.salary)||0), 0))}</strong></td>
            <td class="num"><strong>${_fmtK(plan.reduce((s,h) => { const m=(+(h.salary)||0)/12; const jei=_a.jeiEnabled&&(_a.jeiEligibleCategories||[]).includes(h.category); return s+m*(1+(jei?0:charges))*12; }, 0))}</strong></td>
            ${cols.map(i => `<td class="num"><strong>${_fmtK(ms[i].personnelCost)}</strong></td>`).join('')}
          </tr>
        </tbody>
      </table>
    </div>
    ${_monthPager()}
  `;
}

// ─── Top-Down ────────────────────────────────────────────────────────────────
function _buildTopDown() {
  const td = _a.topDown || {};
  const ms = _p.months;
  const annualTarget = (+(td.som)||0) * (+(td.targetMarketShare)||0);

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:24px">
      <div class="card">
        <div class="kpi-label">TAM</div>
        <div class="kpi-value" style="font-size:1.6rem">${_fmtK(+(td.tam)||0)}</div>
        <div class="kpi-delta">Total Addressable Market</div>
      </div>
      <div class="card">
        <div class="kpi-label">SAM</div>
        <div class="kpi-value" style="font-size:1.6rem">${_fmtK(+(td.sam)||0)}</div>
        <div class="kpi-delta">${+(td.tam)?_fmtPct((+(td.sam)||0)/(+(td.tam)||1)):''} du TAM</div>
      </div>
      <div class="card">
        <div class="kpi-label">SOM × Part visée</div>
        <div class="kpi-value" style="font-size:1.6rem">${_fmtK(annualTarget)}</div>
        <div class="kpi-delta">${_fmtPct(+(td.targetMarketShare)||0)} du SOM · objectif annuel</div>
      </div>
    </div>

    <div class="fin-chart-wrap">
      <div class="fin-chart-toolbar"><span class="fin-chart-title">Bottom-up vs Objectif Top-down</span></div>
      <div style="height:260px"><canvas id="fin-chart-td"></canvas></div>
    </div>

    <div class="fin-section-title" style="margin-top:28px">Écart mensuel</div>
    <div class="fin-table-scroll">
      <table class="fin-table fin-table-wide">
        <thead><tr>
          <th class="fin-row-lbl">Mois</th>
          ${_visibleMonths().map(i => `<th class="num">${_fmtMonthShort(ms[i].date)}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${_plRow('CA Bottom-up', _visibleMonths(), ms, m => m.revenue)}
          ${_plRow('Objectif Top-down', _visibleMonths(), ms, m => m.topDownRevenue)}
          ${_plRow('Écart', _visibleMonths(), ms, m => m.revenue - m.topDownRevenue)}
        </tbody>
      </table>
    </div>
    ${_monthPager()}
  `;
}

// ─── Sensitivity ─────────────────────────────────────────────────────────────
function _buildSensitivity() {
  const model = _a.revenueModel || 'saas';
  let d1key, d1label, d1base, d2key, d2label, d2base;

  if (model === 'saas') {
    d1key = 'saas.newCustomersPerMonth'; d1label = 'Nouveaux clients/mois'; d1base = +((_a.saas?.newCustomersPerMonth)||5);
    d2key = 'saas.arpu';                d2label = 'ARPU (€)';               d2base = +((_a.saas?.arpu)||99);
  } else if (model === 'transactional') {
    d1key = 'transactional.volumeBase'; d1label = 'Volume de base';          d1base = +((_a.transactional?.volumeBase)||1000);
    d2key = 'transactional.unitPrice';  d2label = 'Prix unitaire (€)';       d2base = +((_a.transactional?.unitPrice)||30);
  } else if (model === 'reefer') {
    d1key = 'reefer.reefersFin36';    d1label = 'Reefers actifs fin An 3'; d1base = +((_a.reefer?.reefersFin36)||900);
    d2key = 'reefer.revenueSharePct'; d2label = 'Revenue-share';            d2base = +((_a.reefer?.revenueSharePct)||0.40);
  } else {
    d1key = 'services.projectsPerMonth'; d1label = 'Projets/mois';  d1base = +((_a.services?.projectsPerMonth)||3);
    d2key = 'services.avgTicket';        d2label = 'Ticket moyen (€)'; d2base = +((_a.services?.avgTicket)||8000);
  }

  const steps = [-0.40, -0.20, 0, 0.20, 0.40];
  const d1vals = steps.map(s => Math.max(0.01, d1base * (1 + s)));
  const d2vals = steps.map(s => Math.max(0.01, d2base * (1 + s)));

  const grid = computeSensitivity(_a, d1key, d1vals, d2key, d2vals, 'runway');
  const be   = computeSensitivity(_a, d1key, d1vals, d2key, d2vals, 'breakEvenMonth');

  const cellBg = (v) => {
    if (v === null || v === undefined) return '#fdf0ee';
    if (v >= 24) return 'rgba(45,155,111,.18)';
    if (v >= 12) return 'rgba(233,146,58,.18)';
    return 'rgba(232,80,58,.18)';
  };

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
      <div>
        <div class="fin-section-title">Runway (mois) selon ${d1label} × ${d2label}</div>
        <div class="fin-table-scroll">
          <table class="fin-table">
            <thead><tr>
              <th>${d1label} ↓ / ${d2label} →</th>
              ${d2vals.map((v,i) => `<th class="num">${steps[i]>0?'+':''}${(steps[i]*100).toFixed(0)}%</th>`).join('')}
            </tr></thead>
            <tbody>
              ${grid.map((row, ri) => `
                <tr>
                  <td><strong>${steps[ri]>0?'+':''}${(steps[ri]*100).toFixed(0)}%</strong></td>
                  ${row.map(v => `<td class="num" style="background:${cellBg(v)}">${v !== null ? v+'m' : '—'}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <div class="fin-section-title">Break-even (mois) selon ${d1label} × ${d2label}</div>
        <div class="fin-table-scroll">
          <table class="fin-table">
            <thead><tr>
              <th>${d1label} ↓ / ${d2label} →</th>
              ${d2vals.map((v,i) => `<th class="num">${steps[i]>0?'+':''}${(steps[i]*100).toFixed(0)}%</th>`).join('')}
            </tr></thead>
            <tbody>
              ${be.map((row, ri) => `
                <tr>
                  <td><strong>${steps[ri]>0?'+':''}${(steps[ri]*100).toFixed(0)}%</strong></td>
                  ${row.map(v => `<td class="num" style="background:${cellBg(v !== null ? 36 - v : null)}">${v !== null ? 'M'+(v+1) : '—'}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <div class="form-hint" style="margin-top:12px">Légende : <span style="background:rgba(45,155,111,.18);padding:2px 8px;border-radius:4px">≥ 24m</span> <span style="background:rgba(233,146,58,.18);padding:2px 8px;border-radius:4px">12–24m</span> <span style="background:rgba(232,80,58,.18);padding:2px 8px;border-radius:4px">&lt; 12m</span></div>
  `;
}

// ─── Réel vs Prévu ────────────────────────────────────────────────────────────

function _isPastOrCurrentMonth(dateStr) {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
  return dateStr <= todayKey;
}

function _buildActualVsPlanned() {
  const ms = _p.months;
  const actuals = getFinanceData().actuals || {};
  const pastMonths = ms.filter(m => _isPastOrCurrentMonth(m.date));

  if (pastMonths.length === 0) {
    return `
      <div style="text-align:center;padding:48px;color:var(--text-3)">
        <div style="font-size:2rem;margin-bottom:12px">📅</div>
        <p>La projection commence dans le futur — aucun mois passé à comparer.</p>
        <p style="font-size:.82rem;margin-top:6px">Ajustez la date de début dans les Hypothèses.</p>
      </div>`;
  }

  const rows = pastMonths.map(m => {
    const act = actuals[m.date] || {};
    const planExp = m.personnelCost + m.opex + m.cogs;

    const revVar  = act.revenue  !== undefined ? act.revenue  - m.revenue        : null;
    const expVar  = act.expenses !== undefined ? planExp - act.expenses           : null;
    const cashVar = act.cash     !== undefined ? act.cash     - m.cumulativeCash  : null;

    const vc = (v, inv = false) => v === null ? '' : (inv ? v > 0 : v >= 0) ? 'num-good' : 'num-bad';
    const fmt = v => v !== null ? _fmtK(v) : '—';
    const fmtPct = (v, base) => v !== null && base > 0 ? _fmtPct(v / base) : '—';
    const inp = (field, val) =>
      `<input class="fin-actual-input" type="number" step="any" data-month="${m.date}" data-field="${field}" value="${val !== undefined ? val : ''}" placeholder="—">`;

    return `<tr data-actual-month="${m.date}">
      <td class="fin-row-lbl"><strong>${_fmtMonth(m.date)}</strong></td>

      <td class="num">${_fmtK(m.revenue)}</td>
      <td class="num fin-actual-inp-cell">${inp('revenue', act.revenue)}</td>
      <td class="num fin-actual-var-cell ${vc(revVar)}" data-var="revenue">${fmt(revVar)}</td>
      <td class="num fin-actual-var-cell ${vc(revVar)}" data-var="revenue-pct">${fmtPct(revVar, m.revenue)}</td>

      <td class="num">${_fmtK(planExp)}</td>
      <td class="num fin-actual-inp-cell">${inp('expenses', act.expenses)}</td>
      <td class="num fin-actual-var-cell ${vc(expVar, true)}" data-var="expenses">${expVar !== null ? _fmtK(expVar) : '—'}</td>

      <td class="num">${_fmtK(m.cumulativeCash)}</td>
      <td class="num fin-actual-inp-cell">${inp('cash', act.cash)}</td>
      <td class="num fin-actual-var-cell ${vc(cashVar)}" data-var="cash">${fmt(cashVar)}</td>

      <td class="num">${m.headcount}</td>
      <td class="num fin-actual-inp-cell">${inp('employees', act.employees)}</td>

      <td class="num">${Math.round(m.newCustomers)}</td>
      <td class="num fin-actual-inp-cell">${inp('newCustomers', act.newCustomers)}</td>
    </tr>`;
  }).join('');

  return `
    <div class="fin-chart-wrap">
      <div class="fin-chart-toolbar">
        <span class="fin-chart-title">Réel vs Prévu — Chiffre d'affaires mensuel</span>
      </div>
      <div style="height:220px"><canvas id="fin-chart-actual"></canvas></div>
    </div>

    <div class="form-hint" style="margin:16px 0 8px">
      Saisissez les chiffres réels dans les colonnes <strong>Réel</strong> (appuyez sur Entrée ou cliquez ailleurs pour valider). Videz un champ pour supprimer la saisie.
    </div>

    <div class="fin-table-scroll">
      <table class="fin-table fin-table-wide fin-table-actual">
        <thead>
          <tr>
            <th rowspan="2" class="fin-row-lbl">Mois</th>
            <th colspan="4" class="num fin-actual-grp" style="background:rgba(45,155,111,.07)">CA</th>
            <th colspan="3" class="num fin-actual-grp" style="background:rgba(232,80,58,.07)">Charges totales</th>
            <th colspan="3" class="num fin-actual-grp" style="background:rgba(58,123,232,.07)">Trésorerie</th>
            <th colspan="2" class="num fin-actual-grp" style="background:rgba(122,122,114,.06)">Effectif</th>
            <th colspan="2" class="num fin-actual-grp" style="background:rgba(122,122,114,.06)">Clients</th>
          </tr>
          <tr>
            <th class="num">Prévu</th>
            <th class="num fin-actual-inp-hd">Réel</th>
            <th class="num">Écart €</th>
            <th class="num">Écart %</th>
            <th class="num">Prévu</th>
            <th class="num fin-actual-inp-hd">Réel</th>
            <th class="num">Écart</th>
            <th class="num">Prévu</th>
            <th class="num fin-actual-inp-hd">Réel</th>
            <th class="num">Écart</th>
            <th class="num">Prévu</th>
            <th class="num fin-actual-inp-hd">Réel</th>
            <th class="num">Prévu</th>
            <th class="num fin-actual-inp-hd">Réel</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div id="fin-actual-summary">
      ${_buildActualSummary(pastMonths, actuals)}
    </div>
  `;
}

function _buildActualSummary(pastMonths, actuals) {
  const withRev  = pastMonths.filter(m => actuals[m.date]?.revenue  !== undefined);
  const withExp  = pastMonths.filter(m => actuals[m.date]?.expenses !== undefined);
  const withCash = pastMonths.filter(m => actuals[m.date]?.cash     !== undefined);
  if (withRev.length === 0 && withExp.length === 0 && withCash.length === 0) return '';

  const planRev = withRev.reduce((s, m) => s + m.revenue, 0);
  const actRev  = withRev.reduce((s, m) => s + (actuals[m.date].revenue || 0), 0);
  const revVar  = actRev - planRev;

  const planExp = withExp.reduce((s, m) => s + m.personnelCost + m.opex + m.cogs, 0);
  const actExp  = withExp.reduce((s, m) => s + (actuals[m.date].expenses || 0), 0);
  const expVar  = planExp - actExp;

  const lastCash = withCash.length > 0 ? withCash[withCash.length - 1] : null;
  const cashVar  = lastCash ? actuals[lastCash.date].cash - lastCash.cumulativeCash : null;

  const cards = [];
  if (withRev.length > 0) cards.push({
    label: `CA cumulé (${withRev.length} mois)`,
    value: _fmtK(actRev),
    delta: `Plan: ${_fmtK(planRev)} · Écart: ${_fmtK(revVar)}`,
    cls: revVar >= 0 ? 'fin-kpi-good' : 'fin-kpi-danger',
  });
  if (withExp.length > 0) cards.push({
    label: `Charges cumulées (${withExp.length} mois)`,
    value: _fmtK(actExp),
    delta: `Plan: ${_fmtK(planExp)} · Économie: ${_fmtK(expVar)}`,
    cls: expVar >= 0 ? 'fin-kpi-good' : 'fin-kpi-danger',
  });
  if (lastCash) cards.push({
    label: `Trésorerie réelle (${_fmtMonth(lastCash.date)})`,
    value: _fmtK(actuals[lastCash.date].cash),
    delta: `Plan: ${_fmtK(lastCash.cumulativeCash)} · Écart: ${_fmtK(cashVar)}`,
    cls: cashVar >= 0 ? 'fin-kpi-good' : 'fin-kpi-danger',
  });

  return `
    <div class="fin-section-title" style="margin-top:28px">Synthèse cumulée</div>
    <div class="fin-kpi-grid">
      ${cards.map(k => `
        <div class="fin-kpi-card ${k.cls}">
          <div class="kpi-label">${k.label}</div>
          <div class="kpi-value fin-kpi-val">${k.value}</div>
          <div class="kpi-delta">${k.delta}</div>
        </div>`).join('')}
    </div>`;
}

function _saveAndUpdateActual(monthDate, field, value) {
  const data = getFinanceData();
  const actuals = { ...(data.actuals || {}) };
  if (!actuals[monthDate]) actuals[monthDate] = {};
  if (value === undefined) {
    delete actuals[monthDate][field];
    if (Object.keys(actuals[monthDate]).length === 0) delete actuals[monthDate];
  } else {
    actuals[monthDate][field] = value;
  }
  saveFinanceData({ ...data, actuals });
  _refreshActualRow(monthDate);
  _refreshActualSummary();
  // Mise à jour du graphe sans détruire les inputs
  const C = window.Chart;
  if (C) {
    const chartId = 'fin-chart-actual';
    if (_charts[chartId]) { _charts[chartId].destroy(); delete _charts[chartId]; }
    _initActualChart(C);
  }
}

function _refreshActualRow(monthDate) {
  const m = _p.months.find(pm => pm.date === monthDate);
  if (!m) return;
  const act = (getFinanceData().actuals || {})[monthDate] || {};
  const planExp = m.personnelCost + m.opex + m.cogs;

  const revVar  = act.revenue  !== undefined ? act.revenue  - m.revenue        : null;
  const expVar  = act.expenses !== undefined ? planExp - act.expenses           : null;
  const cashVar = act.cash     !== undefined ? act.cash     - m.cumulativeCash  : null;

  const row = document.querySelector(`[data-actual-month="${monthDate}"]`);
  if (!row) return;

  const setVar = (varName, val, inverted = false) => {
    const cell = row.querySelector(`[data-var="${varName}"]`);
    if (!cell) return;
    cell.className = `num fin-actual-var-cell ${val === null ? '' : (inverted ? val > 0 : val >= 0) ? 'num-good' : 'num-bad'}`;
    cell.textContent = val !== null ? _fmtK(val) : '—';
  };
  const setVarPct = (varName, val, base) => {
    const cell = row.querySelector(`[data-var="${varName}"]`);
    if (!cell) return;
    cell.className = `num fin-actual-var-cell ${val === null ? '' : val >= 0 ? 'num-good' : 'num-bad'}`;
    cell.textContent = val !== null && base > 0 ? _fmtPct(val / base) : '—';
  };

  setVar('revenue', revVar);
  setVarPct('revenue-pct', revVar, m.revenue);
  setVar('expenses', expVar, true);
  setVar('cash', cashVar);
}

function _refreshActualSummary() {
  const el = document.getElementById('fin-actual-summary');
  if (!el) return;
  const actuals = getFinanceData().actuals || {};
  const pastMonths = _p.months.filter(m => _isPastOrCurrentMonth(m.date));
  el.innerHTML = _buildActualSummary(pastMonths, actuals);
}

// ─── Charts ───────────────────────────────────────────────────────────────────
function _initTabCharts(tab) {
  const C = window.Chart;
  if (!C) return;
  if (tab === 'overview') _initMainChart(C);
  if (tab === 'cash')     _initCashChart(C);
  if (tab === 'hr')       _initHRChart(C);
  if (tab === 'topdown')  _initTopDownChart(C);
  if (tab === 'actual')   _initActualChart(C);
}

const _dark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
const _gridColor = () => _dark() ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)';
const _textColor = () => _dark() ? '#B0B0A6' : '#4A4A4A';

const _chartDefaults = (C) => {
  C.defaults.font.family = "'DM Sans', system-ui, sans-serif";
  C.defaults.font.size = 11;
  C.defaults.color = _textColor();
};

function _makeChart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  const chart = new window.Chart(canvas, config);
  _charts[id] = chart;
  return chart;
}

function _initMainChart(C) {
  _chartDefaults(C);
  const ms = _p.months;
  const labels = ms.map(m => _fmtMonthShort(m.date));
  const revenue = ms.map(m => m.revenue);
  const totalCosts = ms.map(m => m.cogs + m.personnelCost + m.opex);
  const cash = ms.map(m => m.cumulativeCash);

  _makeChart('fin-chart-main', {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'CA', data: revenue, borderColor: '#2D9B6F', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.3, yAxisID: 'y' },
        { label: 'Charges totales', data: totalCosts, borderColor: '#E8503A', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.3, yAxisID: 'y' },
        { label: 'Trésorerie cumulée', data: cash, borderColor: '#3A7BE8', backgroundColor: 'rgba(58,123,232,.08)', borderWidth: 2, pointRadius: 0, tension: 0.3, fill: true, yAxisID: 'y2', borderDash: [4,3] },
      ],
    },
    options: _lineOptions(true),
  });
}

function _initCashChart(C) {
  _chartDefaults(C);
  const ms = _p.months;
  _makeChart('fin-chart-cash', {
    type: 'line',
    data: {
      labels: ms.map(m => _fmtMonthShort(m.date)),
      datasets: [
        { label: 'Trésorerie cumulée', data: ms.map(m => m.cumulativeCash), borderColor: '#3A7BE8', backgroundColor: 'rgba(58,123,232,.10)', borderWidth: 2, fill: true, pointRadius: 0, tension: 0.3 },
        { label: 'Flux net mensuel', data: ms.map(m => m.netCashFlow), borderColor: '#E8923A', backgroundColor: 'transparent', borderWidth: 1.5, pointRadius: 0, tension: 0.3, borderDash: [4,3] },
      ],
    },
    options: _lineOptions(false),
  });
}

function _initHRChart(C) {
  _chartDefaults(C);
  const ms = _p.months;
  _makeChart('fin-chart-hr', {
    type: 'line',
    data: {
      labels: ms.map(m => _fmtMonthShort(m.date)),
      datasets: [
        { label: 'Effectif', data: ms.map(m => m.headcount), borderColor: '#7A7A72', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0, yAxisID: 'y' },
        { label: 'Coût RH mensuel', data: ms.map(m => m.personnelCost), borderColor: '#E8503A', backgroundColor: 'rgba(232,80,58,.08)', borderWidth: 2, fill: true, pointRadius: 0, tension: 0.3, yAxisID: 'y2' },
      ],
    },
    options: _lineOptions(true),
  });
}

function _initTopDownChart(C) {
  _chartDefaults(C);
  const ms = _p.months;
  _makeChart('fin-chart-td', {
    type: 'line',
    data: {
      labels: ms.map(m => _fmtMonthShort(m.date)),
      datasets: [
        { label: 'CA Bottom-up', data: ms.map(m => m.revenue), borderColor: '#2D9B6F', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.3 },
        { label: 'Objectif Top-down', data: ms.map(m => m.topDownRevenue), borderColor: '#3A7BE8', backgroundColor: 'transparent', borderWidth: 1.5, borderDash: [5,4], pointRadius: 0, tension: 0.3 },
      ],
    },
    options: _lineOptions(false),
  });
}

function _lineOptions(dual = false) {
  const grid = { color: _gridColor(), drawBorder: false };
  const base = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: true, position: 'bottom', labels: { boxWidth: 12, padding: 16, color: _textColor() } },
      tooltip: {
        backgroundColor: _dark() ? '#1C1C1A' : '#fff',
        borderColor: _dark() ? '#2C2C28' : '#E0E0D8',
        borderWidth: 1,
        titleColor: _textColor(),
        bodyColor: _textColor(),
        callbacks: { label: ctx => ` ${ctx.dataset.label}: ${_fmtK(ctx.raw)}` },
      },
    },
    scales: {
      x: { grid, ticks: { maxTicksLimit: 12, color: _textColor() } },
      y: { grid, ticks: { color: _textColor(), callback: v => _fmtCompact(v) }, position: 'left' },
    },
  };
  if (dual) {
    base.scales.y2 = { grid: { drawOnChartArea: false }, ticks: { color: _textColor(), callback: v => _fmtCompact(v) }, position: 'right' };
  }
  return base;
}

function _initActualChart(C) {
  _chartDefaults(C);
  const ms = _p.months;
  const actuals = getFinanceData().actuals || {};
  const pastMonths = ms.filter(m => _isPastOrCurrentMonth(m.date));
  if (pastMonths.length === 0) return;

  const labels   = pastMonths.map(m => _fmtMonthShort(m.date));
  const planned  = pastMonths.map(m => m.revenue);
  const actual   = pastMonths.map(m => actuals[m.date]?.revenue ?? null);
  const hasAny   = actual.some(v => v !== null);

  _makeChart('fin-chart-actual', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'line',
          label: 'CA Prévu',
          data: planned,
          borderColor: '#3A7BE8',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.3,
          order: 0,
        },
        {
          type: 'bar',
          label: 'CA Réel',
          data: actual,
          backgroundColor: actual.map(v => v === null ? 'transparent' : 'rgba(45,155,111,.65)'),
          borderColor: '#2D9B6F',
          borderWidth: 1,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'bottom', labels: { boxWidth: 12, padding: 16, color: _textColor() } },
        tooltip: {
          backgroundColor: _dark() ? '#1C1C1A' : '#fff',
          borderColor: _dark() ? '#2C2C28' : '#E0E0D8',
          borderWidth: 1,
          titleColor: _textColor(),
          bodyColor: _textColor(),
          callbacks: {
            label: ctx => ctx.raw !== null ? ` ${ctx.dataset.label}: ${_fmtK(ctx.raw)}` : ` ${ctx.dataset.label}: —`,
          },
        },
      },
      scales: {
        x: { grid: { color: _gridColor() }, ticks: { color: _textColor() } },
        y: { grid: { color: _gridColor() }, ticks: { color: _textColor(), callback: v => _fmtCompact(v) } },
      },
    },
  });
}

function _destroyCharts() {
  for (const c of Object.values(_charts)) { try { c.destroy(); } catch {} }
  _charts = {};
}

// ─── Drawer ───────────────────────────────────────────────────────────────────
function _buildDrawerSection(dtab) {
  if (dtab === 'revenue')  return _drawerRevenue();
  if (dtab === 'team')     return _drawerTeam();
  if (dtab === 'opex')     return _drawerOPEX();
  if (dtab === 'cash')     return _drawerCash();
  if (dtab === 'tax')      return _drawerTax();
  return '';
}

function _drawerRevenue() {
  const s = _a.saas || {};
  const t = _a.transactional || {};
  const sv = _a.services || {};
  const rf = _a.reefer || {};
  const td = _a.topDown || {};
  return `
    <div class="fin-form-section">
      <div class="fin-form-title">Général</div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Horizon (mois)</label>
          <input class="form-input" id="fi-horizon" type="number" min="12" max="60" value="${_a.horizonMonths || 36}">
        </div>
        <div class="form-group">
          <label class="form-label">Début projection</label>
          <input class="form-input" id="fi-startdate" type="month" value="${_a.startDate || ''}">
        </div>
      </div>
    </div>

    <div class="fin-form-section">
      <div class="fin-form-title">Modèle de revenus</div>
      <div class="form-group">
        <select class="form-select" id="fi-revmodel">
          <option value="saas" ${_a.revenueModel === 'saas' ? 'selected' : ''}>SaaS / Abonnement</option>
          <option value="transactional" ${_a.revenueModel === 'transactional' ? 'selected' : ''}>Transactionnel</option>
          <option value="services" ${_a.revenueModel === 'services' ? 'selected' : ''}>Services / Projet</option>
          <option value="reefer" ${_a.revenueModel === 'reefer' ? 'selected' : ''}>Reefer · Revenue-share énergie</option>
        </select>
      </div>

      <div id="fi-saas-params" class="${_a.revenueModel !== 'saas' ? 'hidden' : ''}">
        <div class="form-row">
          <div class="form-group"><label class="form-label">MRR initial (€)</label><input class="form-input" id="fi-saas-mrr" type="number" min="0" value="${s.initialMRR||0}"></div>
          <div class="form-group"><label class="form-label">Clients initiaux</label><input class="form-input" id="fi-saas-initcust" type="number" min="0" value="${s.initialCustomers||0}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Nouveaux clients/mois</label><input class="form-input" id="fi-saas-newcpm" type="number" min="0" step="0.1" value="${s.newCustomersPerMonth||5}"></div>
          <div class="form-group"><label class="form-label">Croissance mensuelle</label><input class="form-input" id="fi-saas-growth" type="number" min="0" max="1" step="0.01" value="${s.newCustomersGrowthRate||0.05}"><div class="form-hint">ex: 0.05 = +5%/mois</div></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">ARPU mensuel (€)</label><input class="form-input" id="fi-saas-arpu" type="number" min="0" value="${s.arpu||99}"></div>
          <div class="form-group"><label class="form-label">Churn mensuel</label><input class="form-input" id="fi-saas-churn" type="number" min="0" max="1" step="0.005" value="${s.churnRate||0.03}"><div class="form-hint">ex: 0.03 = 3%/mois</div></div>
        </div>
        <div class="form-group"><label class="form-label">Expansion revenue (net churn)</label><input class="form-input" id="fi-saas-exp" type="number" min="0" max="0.5" step="0.005" value="${s.expansionRate||0.01}"></div>
      </div>

      <div id="fi-tr-params" class="${_a.revenueModel !== 'transactional' ? 'hidden' : ''}">
        <div class="form-row">
          <div class="form-group"><label class="form-label">Volume de base/mois</label><input class="form-input" id="fi-tr-vol" type="number" min="0" value="${t.volumeBase||1000}"></div>
          <div class="form-group"><label class="form-label">Croissance mensuelle</label><input class="form-input" id="fi-tr-growth" type="number" min="0" step="0.01" value="${t.volumeGrowthRate||0.08}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Prix unitaire (€)</label><input class="form-input" id="fi-tr-price" type="number" min="0" value="${t.unitPrice||30}"></div>
          <div class="form-group"><label class="form-label">Take rate</label><input class="form-input" id="fi-tr-take" type="number" min="0" max="1" step="0.01" value="${t.takeRate||0.15}"></div>
        </div>
      </div>

      <div id="fi-sv-params" class="${_a.revenueModel !== 'services' ? 'hidden' : ''}">
        <div class="form-row">
          <div class="form-group"><label class="form-label">Projets/mois</label><input class="form-input" id="fi-sv-projects" type="number" min="0" step="0.5" value="${sv.projectsPerMonth||3}"></div>
          <div class="form-group"><label class="form-label">Ticket moyen (€)</label><input class="form-input" id="fi-sv-ticket" type="number" min="0" value="${sv.avgTicket||8000}"></div>
        </div>
        <div class="form-group"><label class="form-label">Taux de livraison</label><input class="form-input" id="fi-sv-delivery" type="number" min="0" max="1" step="0.05" value="${sv.deliveryRate||0.8}"></div>
      </div>

      <div id="fi-reefer-params" class="${_a.revenueModel !== 'reefer' ? 'hidden' : ''}">
        <div style="font-size:.73rem;color:var(--text-2);margin:4px 0 12px;line-height:1.5;padding:8px 10px;background:rgba(58,123,232,.06);border-radius:6px;border:1px solid rgba(58,123,232,.15)">
          Gain basé sur <strong>Tang et al. (2025)</strong>, IJPR — peak shaving + demand response, parc réel Rotterdam/Anvers.
          Décoté à <strong>${Math.round((+(rf.tauxCaptureReel)??0.5)*100)}%</strong> pour le contexte français.
          Revenu = gain × capture × revenue-share.
        </div>

        <div style="font-size:.78rem;font-weight:700;color:var(--text-2);margin:4px 0 8px">💶 Valeur unitaire</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Gain théorique €/reefer/an</label>
            <input class="form-input fi-reefer-in" id="fi-rf-gain" type="number" min="0" step="50" value="${rf.gainTheoriqueParReeferAn??1300}">
            <div class="form-hint">Tang et al. 2025 — parc réel Rotterdam/Anvers</div>
          </div>
          <div class="form-group">
            <label class="form-label">Taux de capture réel</label>
            <input class="form-input fi-reefer-in" id="fi-rf-capture" type="number" min="0" max="1" step="0.05" value="${rf.tauxCaptureReel??0.50}">
            <div class="form-hint">décote vs optimum académique (0.50 = 50%)</div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Revenue-share Avelya</label>
          <input class="form-input fi-reefer-in" id="fi-rf-share" type="number" min="0" max="1" step="0.05" value="${rf.revenueSharePct??0.40}">
          <div class="form-hint">part du gain effectif captée (0.40 = 40%)</div>
        </div>

        <div style="font-size:.78rem;font-weight:700;color:var(--text-2);margin:14px 0 8px">📈 Trajectoire de déploiement</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Reefers actifs fin An 1</label>
            <input class="form-input fi-reefer-in" id="fi-rf-an1" type="number" min="0" step="10" value="${rf.reefersFin12??80}">
            <div class="form-hint">fin mois 12</div>
          </div>
          <div class="form-group">
            <label class="form-label">Reefers actifs fin An 2</label>
            <input class="form-input fi-reefer-in" id="fi-rf-an2" type="number" min="0" step="10" value="${rf.reefersFin24??350}">
            <div class="form-hint">fin mois 24</div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Reefers actifs fin An 3</label>
          <input class="form-input fi-reefer-in" id="fi-rf-an3" type="number" min="0" step="50" value="${rf.reefersFin36??900}">
          <div class="form-hint">fin mois 36 · ramp-up automatique entre les 3 jalons</div>
        </div>

        <div id="fi-rf-calc" class="fin-reefer-calc" style="margin-top:16px"></div>
      </div>
    </div>

    <div class="fin-form-section">
      <div class="fin-form-title">COGS</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Part variable (% CA)</label><input class="form-input" id="fi-cogs-var" type="number" min="0" max="1" step="0.01" value="${_a.cogs?.variableRate||0}"></div>
        <div class="form-group"><label class="form-label">Part fixe mensuelle (€)</label><input class="form-input" id="fi-cogs-fixed" type="number" min="0" value="${_a.cogs?.fixedMonthly||0}"></div>
      </div>
    </div>

    <div class="fin-form-section">
      <div class="fin-form-title">Objectif Top-Down</div>
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:.88rem;cursor:pointer">
        <input type="checkbox" id="fi-td-enabled" ${td.enabled ? 'checked' : ''}> Activer le top-down
      </label>
      <div id="fi-td-fields" class="${!td.enabled ? 'hidden' : ''}">
        <div class="form-row">
          <div class="form-group"><label class="form-label">TAM (€)</label><input class="form-input" id="fi-td-tam" type="number" min="0" value="${td.tam||1000000000}"></div>
          <div class="form-group"><label class="form-label">SAM (€)</label><input class="form-input" id="fi-td-sam" type="number" min="0" value="${td.sam||50000000}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">SOM (€)</label><input class="form-input" id="fi-td-som" type="number" min="0" value="${td.som||5000000}"></div>
          <div class="form-group"><label class="form-label">Part de marché cible</label><input class="form-input" id="fi-td-share" type="number" min="0" max="1" step="0.001" value="${td.targetMarketShare||0.005}"></div>
        </div>
        <div class="form-group"><label class="form-label">Rampe (mois pour atteindre l'objectif)</label><input class="form-input" id="fi-td-ramp" type="number" min="1" max="60" value="${td.rampMonths||36}"></div>
      </div>
    </div>
  `;
}

function _drawerTeam() {
  const plan = _a.hiringPlan || [];
  return `
    <div class="fin-form-section">
      <div class="fin-form-title" style="display:flex;justify-content:space-between;align-items:center">
        Plan d'embauche
        <button class="btn btn-secondary btn-sm" id="fi-hire-add">+ Ajouter</button>
      </div>
      <div id="fi-hire-list">
        ${plan.map((h, idx) => _hireRow(h, idx)).join('')}
      </div>
      <div class="form-hint" style="margin-top:8px">Pour déclenchement conditionnel, utilisez "Condition" (ex: MRR > 10000).</div>
    </div>
    <div class="fin-form-section">
      <div class="fin-form-title">Charges sociales</div>
      <div class="form-group"><label class="form-label">Taux charges patronales</label><input class="form-input" id="fi-social" type="number" min="0" max="1" step="0.01" value="${_a.socialChargesRate||0.42}"><div class="form-hint">France : ~42% pour PME hors JEI</div></div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:.88rem;cursor:pointer">
        <input type="checkbox" id="fi-jei" ${_a.jeiEnabled ? 'checked' : ''}> Statut JEI (exonération charges sur postes éligibles)
      </label>
    </div>
  `;
}

const _GROSS_TO_NET = 0.78; // cotisations salariales FR ≈ 22 %

function _hireRow(h, idx) {
  const cond = h.condition ? `${h.condition.type === 'mrr' ? 'MRR>' : 'M'}${h.condition.value}` : '';
  const grossAnnual = +(h.salary) || 0;
  const netMonthly  = h.gratification
    ? Math.round(grossAnnual / 12)                     // gratification = montant net versé
    : Math.round(grossAnnual / 12 * _GROSS_TO_NET);
  return `
    <div class="fin-hire-row" data-hire-idx="${idx}" style="background:var(--bg-2);border-radius:8px;padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:8px">
        <div class="form-group" style="margin:0;flex:1">
          <label class="form-label">Rôle</label>
          <input class="form-input" data-hire-field="role" value="${h.role || ''}" placeholder="ex : CTO, Sales Lead…">
        </div>
        <button class="btn btn-ghost btn-sm fin-hire-del" data-hire-idx="${idx}" style="padding:6px 8px;color:var(--q1);flex-shrink:0">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 66px 66px;gap:8px;margin-bottom:8px">
        <div class="form-group" style="margin:0">
          <label class="form-label">Catégorie</label>
          <select class="form-select" data-hire-field="category">
            ${['tech','rd','sales','marketing','management','ops','intern','other'].map(c => `<option value="${c}" ${h.category===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">${h.condition ? 'Condition' : 'Début'}</label>
          <input class="form-input" data-hire-field="startInfo" value="${h.condition ? cond : (h.startMonth||1)}" placeholder="1…">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Fin (opt.)</label>
          <input class="form-input" data-hire-field="endMonth" type="number" min="1" value="${h.endMonth ?? ''}" placeholder="—">
        </div>
      </div>
      <label style="display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:.8rem;cursor:pointer;color:var(--text-2)">
        <input type="checkbox" data-hire-field="gratification" ${h.gratification?'checked':''}> Gratification de stage (non chargée)
      </label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="form-group" style="margin:0">
          <label class="form-label">${h.gratification ? 'Gratification annualisée (€)' : 'Salaire brut / an'}</label>
          <input class="form-input" data-hire-field="salary" type="number" min="0" value="${grossAnnual || ''}" placeholder="€">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label" title="${h.gratification ? 'Montant net versé au stagiaire' : 'Estimation : brut/12 × 0,78 (cotisations salariales ~22 %)'}">
            ${h.gratification ? 'Gratif. / mois' : 'Net / mois'} <span style="color:var(--text-3);font-size:.75rem">≈</span>
          </label>
          <input class="form-input" data-hire-field="netSalary" type="number" min="0" value="${netMonthly || ''}" placeholder="€">
        </div>
      </div>
    </div>
  `;
}

function _drawerOPEX() {
  const o = _a.opex || {};
  return `
    <div class="fin-form-section">
      <div class="fin-form-title">Charges opérationnelles mensuelles</div>
      ${[['tools','Outils & SaaS'],['rent','Loyer / bureaux'],['accounting','Comptabilité'],['legal','Juridique'],['marketing','Marketing & Growth'],['other','Autres']].map(([k,l]) => `
        <div class="form-group">
          <label class="form-label">${l} (€/mois)</label>
          <input class="form-input" id="fi-opex-${k}" type="number" min="0" value="${o[k]||0}">
        </div>
      `).join('')}
      <div class="form-group"><label class="form-label">Inflation annuelle</label><input class="form-input" id="fi-opex-inflation" type="number" min="0" max="0.5" step="0.005" value="${o.inflationRate||0.02}"></div>
    </div>
  `;
}

function _drawerCash() {
  const fin = _a.financing || [];
  return `
    <div class="fin-form-section">
      <div class="fin-form-title">Paramètres trésorerie</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Trésorerie initiale (€)</label><input class="form-input" id="fi-initcash" type="number" value="${_a.initialCash||150000}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">DSO — délai encaissement (jours)</label><input class="form-input" id="fi-dso" type="number" min="0" max="365" value="${_a.dso||30}"></div>
        <div class="form-group"><label class="form-label">DPO — délai décaissement (jours)</label><input class="form-input" id="fi-dpo" type="number" min="0" max="365" value="${_a.dpo||30}"></div>
      </div>
    </div>
    <div class="fin-form-section">
      <div class="fin-form-title" style="display:flex;justify-content:space-between;align-items:center">
        Financements
        <button class="btn btn-secondary btn-sm" id="fi-fin-add">+ Ajouter</button>
      </div>
      <div id="fi-fin-list">
        ${fin.map((f, idx) => _finRow(f, idx)).join('')}
      </div>
    </div>
  `;
}

function _finRow(f, idx) {
  const isLoan = f.type === 'loan' || f.type === 'bpi_loan';
  return `
    <div class="fin-fin-row" data-fin-idx="${idx}" style="background:var(--bg-2);border-radius:8px;padding:12px;margin-bottom:8px">
      <div style="display:grid;grid-template-columns:1fr 100px 80px 24px;gap:6px;align-items:end">
        <div class="form-group" style="margin:0"><label class="form-label">Nom</label><input class="form-input" data-fin-field="name" value="${f.name||''}"></div>
        <div class="form-group" style="margin:0"><label class="form-label">Type</label>
          <select class="form-select" data-fin-field="type">
            ${['equity','bpi_loan','loan','grant','other'].map(t => `<option value="${t}" ${f.type===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0"><label class="form-label">Mois</label><input class="form-input" data-fin-field="month" type="number" min="1" value="${f.month||1}"></div>
        <button class="btn btn-ghost btn-sm fin-fin-del" data-fin-idx="${idx}" style="padding:4px;color:var(--q1)">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr ${isLoan ? '72px 72px 72px' : ''};gap:6px;margin-top:6px">
        <div class="form-group" style="margin:0"><label class="form-label">Montant (€)</label><input class="form-input" data-fin-field="amount" type="number" min="0" value="${f.amount||0}"></div>
        ${isLoan ? `
          <div class="form-group" style="margin:0"><label class="form-label">Début remb.</label><input class="form-input" data-fin-field="repaymentStart" type="number" min="1" value="${f.repaymentStart||6}"><div class="form-hint" style="font-size:.68rem">mois (1-indexé)</div></div>
          <div class="form-group" style="margin:0"><label class="form-label">Durée (mois)</label><input class="form-input" data-fin-field="repaymentDuration" type="number" min="1" value="${f.repaymentDuration||24}"></div>
          <div class="form-group" style="margin:0"><label class="form-label">Taux intérêt</label><input class="form-input" data-fin-field="interestRate" type="number" min="0" max="0.5" step="0.005" value="${f.interestRate||0}"><div class="form-hint" style="font-size:.68rem">ex: 0.05 = 5%</div></div>
        ` : ''}
      </div>
    </div>
  `;
}

function _drawerTax() {
  const is  = _a.is  || {};
  const cir = _a.cir || {};
  const vat = _a.vat || {};
  return `
    <div class="fin-form-section">
      <div class="fin-form-title">IS — Impôt sur les sociétés</div>
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:.88rem;cursor:pointer">
        <input type="checkbox" id="fi-is-enabled" ${is.enabled ? 'checked' : ''}> Activer l'IS
      </label>
      <div id="fi-is-fields" class="${!is.enabled ? 'hidden' : ''}">
        <div class="form-group"><label class="form-label">Taux IS</label><input class="form-input" id="fi-is-rate" type="number" min="0" max="1" step="0.01" value="${is.rate||0.25}"><div class="form-hint">France : 25% (15% PME jusqu'à 42 500 €)</div></div>
      </div>
    </div>

    <div class="fin-form-section">
      <div class="fin-form-title">CIR — Crédit Impôt Recherche</div>
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:.88rem;cursor:pointer">
        <input type="checkbox" id="fi-cir-enabled" ${cir.enabled ? 'checked' : ''}> Activer le CIR
      </label>
      <div id="fi-cir-fields" class="${!cir.enabled ? 'hidden' : ''}">
        <div class="form-row">
          <div class="form-group"><label class="form-label">Taux CIR</label><input class="form-input" id="fi-cir-rate" type="number" min="0" max="1" step="0.01" value="${cir.rate||0.30}"><div class="form-hint">30% jusqu'à 100M€ de dépenses</div></div>
          <div class="form-group"><label class="form-label">Délai versement (années)</label><input class="form-input" id="fi-cir-delay" type="number" min="0" max="3" value="${cir.delayYears||1}"></div>
        </div>
        <div class="form-group"><label class="form-label">Mois de versement dans l'année (1-12)</label><input class="form-input" id="fi-cir-paymonth" type="number" min="1" max="12" value="${cir.paymentMonthOfYear||9}"></div>
      </div>
    </div>

    <div class="fin-form-section">
      <div class="fin-form-title">TVA</div>
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:.88rem;cursor:pointer">
        <input type="checkbox" id="fi-vat-enabled" ${vat.enabled ? 'checked' : ''}> Modéliser l'impact TVA sur la trésorerie
      </label>
      <div id="fi-vat-fields" class="${!vat.enabled ? 'hidden' : ''}">
        <div class="form-row">
          <div class="form-group"><label class="form-label">TVA collectée (%)</label><input class="form-input" id="fi-vat-sales" type="number" min="0" max="1" step="0.01" value="${vat.salesRate||0.20}"></div>
          <div class="form-group"><label class="form-label">TVA déductible (%)</label><input class="form-input" id="fi-vat-purchase" type="number" min="0" max="1" step="0.01" value="${vat.purchaseRate||0.20}"></div>
        </div>
        <div class="form-group"><label class="form-label">Délai reversement (mois)</label><input class="form-input" id="fi-vat-delay" type="number" min="0" max="3" value="${vat.reverseDelayMonths||1}"></div>
      </div>
    </div>
  `;
}

// ─── Events ───────────────────────────────────────────────────────────────────
function _attachEvents() {
  // Tabs
  _on('#fin-tabs', 'click', '[data-tab]', e => _switchTab(e.target.closest('[data-tab]').dataset.tab));

  // Drawer open/close
  _on('#fin-drawer-btn', 'click', null, _openDrawer);
  _on('#fin-drawer-close', 'click', null, _closeDrawer);
  _on('#fin-overlay', 'click', null, _closeDrawer);

  // Drawer sub-tabs
  _on('#fin-drawer', 'click', '[data-dtab]', e => {
    const dtab = e.target.closest('[data-dtab]').dataset.dtab;
    _drawerTab = dtab;
    document.querySelectorAll('.fin-dtab').forEach(b => b.classList.toggle('active', b.dataset.dtab === dtab));
    const body = document.getElementById('fin-drawer-body');
    if (body) { body.innerHTML = _buildDrawerSection(dtab); _bindDrawerInputs(); }
  });

  // Revenue model switch
  _on('#fin-drawer', 'change', '#fi-revmodel', e => {
    const panels = { saas:'fi-saas-params', transactional:'fi-tr-params', services:'fi-sv-params', reefer:'fi-reefer-params' };
    Object.entries(panels).forEach(([model, id]) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', e.target.value !== model);
    });
    if (e.target.value === 'reefer') _renderReeferCalc();
    _onFieldChange();
  });

  // Reefer — recalcul live du calculateur terminal à chaque saisie
  _on('#fin-drawer', 'input', '.fi-reefer-in', () => {
    _renderReeferCalc();
  });

  // Top-down toggle
  _on('#fin-drawer', 'change', '#fi-td-enabled', e => {
    const el = document.getElementById('fi-td-fields');
    if (el) el.classList.toggle('hidden', !e.target.checked);
    _onFieldChange();
  });

  // IS / CIR / VAT toggles
  ['is','cir','vat'].forEach(k => {
    _on('#fin-drawer', 'change', `#fi-${k}-enabled`, e => {
      const el = document.getElementById(`fi-${k}-fields`);
      if (el) el.classList.toggle('hidden', !e.target.checked);
      _onFieldChange();
    });
  });

  // JEI toggle
  _on('#fin-drawer', 'change', '#fi-jei', _onFieldChange);

  // Hiring plan add
  _on('#fin-drawer', 'click', '#fi-hire-add', () => {
    _a.hiringPlan = [...(_a.hiringPlan||[]), { id: uid('hr'), role: 'Nouveau poste', salary: 50000, category: 'tech', startMonth: 1 }];
    _refreshDrawerTeam();
  });

  // Hiring plan delete
  _on('#fin-drawer', 'click', '.fin-hire-del', e => {
    const idx = +e.target.closest('[data-hire-idx]').dataset.hireIdx;
    _a.hiringPlan = (_a.hiringPlan||[]).filter((_, i) => i !== idx);
    _refreshDrawerTeam();
  });

  // Hiring plan field change
  _on('#fin-drawer', 'input', '[data-hire-field]', e => {
    const row = e.target.closest('[data-hire-idx]');
    if (!row) return;
    const idx = +row.dataset.hireIdx;
    const field = e.target.dataset.hireField;
    const hire = _a.hiringPlan[idx];
    if (!hire) return;
    if (field === 'startInfo') {
      const raw = e.target.value.trim();
      const mrrMatch = raw.match(/^MRR>(\d+)/i);
      if (mrrMatch) { delete hire.startMonth; hire.condition = { type: 'mrr', value: +mrrMatch[1] }; }
      else { delete hire.condition; hire.startMonth = Math.max(1, parseInt(raw)||1); }
    } else if (field === 'endMonth') {
      const raw = e.target.value.trim();
      const val = parseInt(raw);
      if (raw === '' || isNaN(val)) delete hire.endMonth;
      else hire.endMonth = Math.max(1, val);
    } else if (field === 'gratification') {
      hire.gratification = e.target.checked;
      const netEl = row.querySelector('[data-hire-field="netSalary"]');
      if (netEl) {
        const gross = +(hire.salary) || 0;
        netEl.value = hire.gratification ? Math.round(gross / 12) : Math.round(gross / 12 * _GROSS_TO_NET) || '';
      }
    } else if (field === 'salary') {
      hire.salary = +e.target.value;
      const netEl = row.querySelector('[data-hire-field="netSalary"]');
      if (netEl) netEl.value = hire.gratification
        ? Math.round(hire.salary / 12)
        : Math.round(hire.salary / 12 * _GROSS_TO_NET) || '';
    } else if (field === 'netSalary') {
      const net = +e.target.value;
      if (hire.gratification) {
        hire.salary = net > 0 ? net * 12 : 0;
      } else {
        hire.salary = net > 0 ? Math.round(net / _GROSS_TO_NET * 12) : 0;
      }
      const grossEl = row.querySelector('[data-hire-field="salary"]');
      if (grossEl) grossEl.value = hire.salary || '';
    } else {
      hire[field] = e.target.value;
    }
    _scheduleRefresh();
  });

  // Financing add
  _on('#fin-drawer', 'click', '#fi-fin-add', () => {
    _a.financing = [...(_a.financing||[]), { id: uid('fi'), name: 'Financement', type: 'equity', amount: 100000, month: 1 }];
    _refreshDrawerCash();
  });

  // Financing delete
  _on('#fin-drawer', 'click', '.fin-fin-del', e => {
    const idx = +e.target.closest('[data-fin-idx]').dataset.finIdx;
    _a.financing = (_a.financing||[]).filter((_, i) => i !== idx);
    _refreshDrawerCash();
  });

  // Financing field change
  _on('#fin-drawer', 'input', '[data-fin-field]', e => {
    const row = e.target.closest('[data-fin-idx]');
    if (!row) return;
    const idx = +row.dataset.finIdx;
    const field = e.target.dataset.finField;
    const entry = _a.financing[idx];
    if (!entry) return;
    entry[field] = ['amount','month','repaymentStart','repaymentDuration','interestRate'].includes(field) ? +e.target.value : e.target.value;
    _scheduleRefresh();
  });

  // Financing type change (to show/hide loan fields)
  _on('#fin-drawer', 'change', '[data-fin-field="type"]', e => {
    const row = e.target.closest('[data-fin-idx]');
    if (!row) return;
    const idx = +row.dataset.finIdx;
    _a.financing[idx].type = e.target.value;
    _refreshDrawerCash();
  });

  // Generic input change → refresh
  _bindDrawerInputs();

  // Scenarios
  _on('#fin-scenario-sel', 'change', null, e => {
    const data = getFinanceData();
    const sc = (data.scenarios||[]).find(s => s.id === e.target.value);
    if (sc) { _a = _clone(sc.assumptions); _fullRefresh(); }
  });

  _on('#fin-scenario-save', 'click', null, () => {
    const data = getFinanceData();
    const sel = document.getElementById('fin-scenario-sel');
    const activeId = sel?.value;
    let scenarios = data.scenarios || [];
    if (scenarios.length === 0) {
      scenarios = [{ id: uid('sc'), name: 'Base', assumptions: _clone(_a) }];
    } else {
      const idx = scenarios.findIndex(s => s.id === activeId);
      if (idx >= 0) scenarios[idx] = { ...scenarios[idx], assumptions: _clone(_a) };
    }
    saveFinanceData({ ...data, scenarios, activeScenarioId: activeId });
    toast('Scénario enregistré', 'success');
  });

  _on('#fin-scenario-new', 'click', null, () => {
    const name = prompt('Nom du scénario (ex: Optimiste)');
    if (!name?.trim()) return;
    const data = getFinanceData();
    const sc = { id: uid('sc'), name: name.trim(), assumptions: _clone(_a) };
    const scenarios = [...(data.scenarios||[]), sc];
    saveFinanceData({ ...data, scenarios, activeScenarioId: sc.id });
    _refreshScenarioSelect(sc.id);
    toast(`Scénario "${name}" créé`, 'success');
  });

  _on('#fin-scenario-del', 'click', null, () => {
    const data = getFinanceData();
    const sel = document.getElementById('fin-scenario-sel');
    const activeId = sel?.value;
    if ((data.scenarios||[]).length <= 1) return;
    const scenarios = (data.scenarios||[]).filter(s => s.id !== activeId);
    const newActive = scenarios[0]?.id || '';
    saveFinanceData({ ...data, scenarios, activeScenarioId: newActive });
    const sc = scenarios.find(s => s.id === newActive);
    if (sc) { _a = _clone(sc.assumptions); _fullRefresh(); }
    _refreshScenarioSelect(newActive);
  });

  // Pager — delegate from container (re-used safely because _container is replaced on each renderFinance)
  _container.addEventListener('click', e => {
    if (e.target.closest('#fin-page-prev')) { _pageOffset = Math.max(0, _pageOffset - _PAGE_SIZE); _switchTab(_activeTab); }
    if (e.target.closest('#fin-page-next')) { _pageOffset = Math.min(Math.max(0, (_p?.months.length || 0) - _PAGE_SIZE), _pageOffset + _PAGE_SIZE); _switchTab(_activeTab); }
  });

  // Investor mode
  _on('#fin-investor-btn', 'click', null, () => {
    _investorMode = !_investorMode;
    const banner = document.getElementById('fin-investor-banner');
    if (banner) banner.classList.toggle('hidden', !_investorMode);
    const btn = document.getElementById('fin-investor-btn');
    if (btn) btn.classList.toggle('btn-primary', _investorMode);
  });

  // CSV export
  _on('#fin-csv-btn', 'click', null, _exportCSV);

  // Réel vs Prévu — sauvegarde sur change (blur), mise à jour ciblée des cellules d'écart
  _on('#fin-tab-content', 'change', '.fin-actual-input', e => {
    const input = e.target.closest('.fin-actual-input');
    if (!input) return;
    const month = input.dataset.month;
    const field = input.dataset.field;
    const val = input.value.trim();
    _saveAndUpdateActual(month, field, val === '' ? undefined : +val);
  });
}

function _bindDrawerInputs() {
  const ids = ['fi-horizon','fi-startdate','fi-revmodel',
    'fi-saas-mrr','fi-saas-initcust','fi-saas-newcpm','fi-saas-growth','fi-saas-arpu','fi-saas-churn','fi-saas-exp',
    'fi-tr-vol','fi-tr-growth','fi-tr-price','fi-tr-take',
    'fi-sv-projects','fi-sv-ticket','fi-sv-delivery',
    'fi-rf-gain','fi-rf-capture','fi-rf-share',
    'fi-rf-an1','fi-rf-an2','fi-rf-an3',
    'fi-cogs-var','fi-cogs-fixed',
    'fi-td-tam','fi-td-sam','fi-td-som','fi-td-share','fi-td-ramp',
    'fi-social',
    'fi-opex-tools','fi-opex-rent','fi-opex-accounting','fi-opex-legal','fi-opex-marketing','fi-opex-other','fi-opex-inflation',
    'fi-initcash','fi-dso','fi-dpo',
    'fi-is-rate','fi-cir-rate','fi-cir-delay','fi-cir-paymonth',
    'fi-vat-sales','fi-vat-purchase','fi-vat-delay',
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', _onFieldChange);
    if (el) el.addEventListener('change', _onFieldChange);
  });
  // Premier rendu du calculateur reefer si visible
  if (_a.revenueModel === 'reefer') _renderReeferCalc();
}

let _refreshTimer = null;
function _scheduleRefresh() {
  if (_refreshTimer) clearTimeout(_refreshTimer);
  _refreshTimer = setTimeout(_fullRefresh, 150);
}

function _onFieldChange() { _readAssumptions(); _scheduleRefresh(); }

function _readAssumptions() {
  const v = (id, num = true) => {
    const el = document.getElementById(id);
    if (!el) return undefined;
    if (el.type === 'checkbox') return el.checked;
    return num ? +el.value : el.value;
  };

  const h = v('fi-horizon');  if (h) _a.horizonMonths = h;
  const sd = v('fi-startdate', false); if (sd) _a.startDate = sd;
  const rm = v('fi-revmodel', false); if (rm) _a.revenueModel = rm;

  // SaaS
  if (_a.saas) {
    _applyIfDefined(_a.saas, 'initialMRR',             v('fi-saas-mrr'));
    _applyIfDefined(_a.saas, 'initialCustomers',       v('fi-saas-initcust'));
    _applyIfDefined(_a.saas, 'newCustomersPerMonth',   v('fi-saas-newcpm'));
    _applyIfDefined(_a.saas, 'newCustomersGrowthRate', v('fi-saas-growth'));
    _applyIfDefined(_a.saas, 'arpu',        v('fi-saas-arpu'));
    _applyIfDefined(_a.saas, 'churnRate',   v('fi-saas-churn'));
    _applyIfDefined(_a.saas, 'expansionRate', v('fi-saas-exp'));
  }

  // Transactional
  if (_a.transactional) {
    _applyIfDefined(_a.transactional, 'volumeBase',       v('fi-tr-vol'));
    _applyIfDefined(_a.transactional, 'volumeGrowthRate', v('fi-tr-growth'));
    _applyIfDefined(_a.transactional, 'unitPrice',        v('fi-tr-price'));
    _applyIfDefined(_a.transactional, 'takeRate',         v('fi-tr-take'));
  }

  // Services
  if (_a.services) {
    _applyIfDefined(_a.services, 'projectsPerMonth', v('fi-sv-projects'));
    _applyIfDefined(_a.services, 'avgTicket',        v('fi-sv-ticket'));
    _applyIfDefined(_a.services, 'deliveryRate',     v('fi-sv-delivery'));
  }

  // Reefer — gain littérature + trajectoire 3 jalons
  if (!_a.reefer) _a.reefer = { ...DEFAULT_ASSUMPTIONS.reefer };
  _applyIfDefined(_a.reefer, 'gainTheoriqueParReeferAn', v('fi-rf-gain'));
  _applyIfDefined(_a.reefer, 'tauxCaptureReel',          v('fi-rf-capture'));
  _applyIfDefined(_a.reefer, 'revenueSharePct',          v('fi-rf-share'));
  _applyIfDefined(_a.reefer, 'reefersFin12',             v('fi-rf-an1'));
  _applyIfDefined(_a.reefer, 'reefersFin24',             v('fi-rf-an2'));
  _applyIfDefined(_a.reefer, 'reefersFin36',             v('fi-rf-an3'));

  // COGS
  if (!_a.cogs) _a.cogs = {};
  _applyIfDefined(_a.cogs, 'variableRate', v('fi-cogs-var'));
  _applyIfDefined(_a.cogs, 'fixedMonthly', v('fi-cogs-fixed'));

  // Top-down
  if (!_a.topDown) _a.topDown = {};
  const tdEnabled = v('fi-td-enabled');
  if (tdEnabled !== undefined) _a.topDown.enabled = tdEnabled;
  _applyIfDefined(_a.topDown, 'tam',               v('fi-td-tam'));
  _applyIfDefined(_a.topDown, 'sam',               v('fi-td-sam'));
  _applyIfDefined(_a.topDown, 'som',               v('fi-td-som'));
  _applyIfDefined(_a.topDown, 'targetMarketShare', v('fi-td-share'));
  _applyIfDefined(_a.topDown, 'rampMonths',        v('fi-td-ramp'));

  // Social
  _applyIfDefined(_a, 'socialChargesRate', v('fi-social'));
  const jei = v('fi-jei');
  if (jei !== undefined) _a.jeiEnabled = jei;

  // OPEX
  if (!_a.opex) _a.opex = {};
  ['tools','rent','accounting','legal','marketing','other'].forEach(k => _applyIfDefined(_a.opex, k, v(`fi-opex-${k}`)));
  _applyIfDefined(_a.opex, 'inflationRate', v('fi-opex-inflation'));

  // Cash
  _applyIfDefined(_a, 'initialCash', v('fi-initcash'));
  _applyIfDefined(_a, 'dso', v('fi-dso'));
  _applyIfDefined(_a, 'dpo', v('fi-dpo'));

  // IS
  if (!_a.is) _a.is = {};
  const isEnabled = v('fi-is-enabled');
  if (isEnabled !== undefined) _a.is.enabled = isEnabled;
  _applyIfDefined(_a.is, 'rate', v('fi-is-rate'));

  // CIR
  if (!_a.cir) _a.cir = {};
  const cirEnabled = v('fi-cir-enabled');
  if (cirEnabled !== undefined) _a.cir.enabled = cirEnabled;
  _applyIfDefined(_a.cir, 'rate',               v('fi-cir-rate'));
  _applyIfDefined(_a.cir, 'delayYears',         v('fi-cir-delay'));
  _applyIfDefined(_a.cir, 'paymentMonthOfYear', v('fi-cir-paymonth'));

  // VAT
  if (!_a.vat) _a.vat = {};
  const vatEnabled = v('fi-vat-enabled');
  if (vatEnabled !== undefined) _a.vat.enabled = vatEnabled;
  _applyIfDefined(_a.vat, 'salesRate',           v('fi-vat-sales'));
  _applyIfDefined(_a.vat, 'purchaseRate',        v('fi-vat-purchase'));
  _applyIfDefined(_a.vat, 'reverseDelayMonths',  v('fi-vat-delay'));
}

function _applyIfDefined(obj, key, val) {
  if (val !== undefined && !isNaN(val)) obj[key] = val;
}

function _fullRefresh() {
  _p = computeProjections(_a);
  _updateKPIs();
  const subtitle = document.getElementById('fin-subtitle');
  if (subtitle) subtitle.textContent = `Modélisation · ${_a.horizonMonths || 36} mois · ${_revenueModelLabel(_a.revenueModel)}`;
  _switchTab(_activeTab);
  // Persist — create default "Base" scenario on first use
  const data = getFinanceData();
  let scenarios = data.scenarios || [];
  let activeId  = data.activeScenarioId;
  if (scenarios.length === 0) {
    const sc = { id: uid('sc'), name: 'Base', assumptions: _clone(_a) };
    scenarios = [sc];
    activeId = sc.id;
    _refreshScenarioSelect(activeId);
  } else {
    const idx = scenarios.findIndex(s => s.id === activeId);
    if (idx >= 0) scenarios[idx] = { ...scenarios[idx], assumptions: _clone(_a) };
    else { activeId = scenarios[0].id; }
  }
  saveFinanceData({ ...data, scenarios, activeScenarioId: activeId });
}

// ─── Drawer helpers ───────────────────────────────────────────────────────────
function _openDrawer() {
  _drawerOpen = true;
  document.getElementById('fin-drawer')?.classList.add('open');
  document.getElementById('fin-overlay')?.classList.remove('hidden');
  _bindDrawerInputs();
}

function _closeDrawer() {
  _drawerOpen = false;
  document.getElementById('fin-drawer')?.classList.remove('open');
  document.getElementById('fin-overlay')?.classList.add('hidden');
}

function _refreshDrawerTeam() {
  const body = document.getElementById('fin-drawer-body');
  if (body && _drawerTab === 'team') { body.innerHTML = _drawerTeam(); _bindDrawerInputs(); }
  _scheduleRefresh();
}

function _refreshDrawerCash() {
  const body = document.getElementById('fin-drawer-body');
  if (body && _drawerTab === 'cash') { body.innerHTML = _drawerCash(); _bindDrawerInputs(); }
  _scheduleRefresh();
}

// ─── Pager (pour les tableaux larges) ────────────────────────────────────────
let _pageOffset = 0;
const _PAGE_SIZE = 12;

function _visibleMonths() {
  const n = _p.months.length;
  const start = Math.min(_pageOffset, Math.max(0, n - _PAGE_SIZE));
  return Array.from({ length: Math.min(_PAGE_SIZE, n - start) }, (_, i) => start + i);
}

function _monthPager() {
  const n = _p.months.length;
  if (n <= _PAGE_SIZE) return '';
  const pages = Math.ceil(n / _PAGE_SIZE);
  const curPage = Math.floor(_pageOffset / _PAGE_SIZE);
  return `
    <div class="fin-pager">
      <button class="btn btn-ghost btn-sm" id="fin-page-prev" ${curPage === 0 ? 'disabled' : ''}>← Préc.</button>
      <span style="font-size:.82rem;color:var(--text-3)">Mois ${_pageOffset+1}–${Math.min(_pageOffset+_PAGE_SIZE, n)} / ${n}</span>
      <button class="btn btn-ghost btn-sm" id="fin-page-next" ${curPage >= pages-1 ? 'disabled' : ''}>Suiv. →</button>
    </div>
  `;
}

// ─── Export CSV ───────────────────────────────────────────────────────────────
function _exportCSV() {
  const headers = ['Mois','CA','MRR','ARR','COGS','Marge brute','Masse sal.','OPEX','EBITDA','IS','CIR','Résultat net','Flux net','Trésorerie cumulée','BFR','Effectif'];
  const rows = _p.months.map(m => [
    m.date, m.revenue, m.mrr, m.arr, m.cogs, m.grossMargin,
    m.personnelCost, m.opex, m.ebitda, m.isAmount, m.cirReceived, m.netResult,
    m.netCashFlow, m.cumulativeCash, m.bfr, m.headcount,
  ].map(v => typeof v === 'number' ? Math.round(v) : v).join(';'));
  const csv = [headers.join(';'), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `finance-${new Date().toISOString().split('T')[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
  toast('Export CSV téléchargé', 'success');
}

// ─── Scenario select refresh ──────────────────────────────────────────────────
function _refreshScenarioSelect(activeId) {
  const data = getFinanceData();
  const sel = document.getElementById('fin-scenario-sel');
  if (!sel) return;
  sel.innerHTML = (data.scenarios || []).map(s =>
    `<option value="${s.id}" ${s.id === activeId ? 'selected' : ''}>${s.name}</option>`
  ).join('');
  const delBtn = document.getElementById('fin-scenario-del');
  if (delBtn) delBtn.classList.toggle('hidden', (data.scenarios||[]).length <= 1);
}

// ─── Event delegation helper ──────────────────────────────────────────────────
function _on(rootSel, event, childSel, handler) {
  const root = typeof rootSel === 'string' ? document.querySelector(rootSel) : rootSel;
  if (!root) return;
  root.addEventListener(event, e => {
    if (!childSel) { handler(e); return; }
    if (e.target.closest(childSel)) handler(e);
  });
}

// ─── Helpers render ───────────────────────────────────────────────────────────
// Calculateur live reefer — recalcul à chaque saisie dans le panneau.
function _renderReeferCalc() {
  const box = document.getElementById('fi-rf-calc');
  if (!box) return;
  const g = (id, def) => {
    const el = document.getElementById(id);
    if (!el) return def;
    const v = +el.value;
    return isNaN(v) ? def : v;
  };
  const r = {
    gainTheoriqueParReeferAn: g('fi-rf-gain',    1300),
    tauxCaptureReel:          g('fi-rf-capture', 0.50),
    revenueSharePct:          g('fi-rf-share',   0.40),
    reefersFin12:             g('fi-rf-an1',     80),
    reefersFin24:             g('fi-rf-an2',     350),
    reefersFin36:             g('fi-rf-an3',     900),
  };

  const gainEffectif     = gainEffectifParReeferAn(r);           // €/reefer/an
  const revenuReeferAn   = gainEffectif * (+(r.revenueSharePct) || 0); // €/reefer/an pour Avelya
  const revAnnualFin3    = r.reefersFin36 * revenuReeferAn;      // run-rate annuel fin An 3
  const eur = n => isFinite(n) ? Math.round(n).toLocaleString('fr-FR') + ' €' : '—';

  box.innerHTML = `
    <div class="fin-reefer-calc-title">📊 Simulation avec ces hypothèses</div>
    <div class="fin-reefer-row fin-reefer-hl" style="margin-bottom:4px">
      <span>Gain effectif / reefer / an</span><strong>${eur(gainEffectif)}</strong>
    </div>
    <div class="fin-reefer-row">
      <span>dont revenu Avelya / reefer / an</span><strong>${eur(revenuReeferAn)}</strong>
    </div>
    <div style="font-size:.72rem;font-weight:700;color:var(--text-3);margin:10px 0 4px">Trajectoire de déploiement</div>
    <div class="fin-reefer-row"><span>Reefers actifs fin An 1</span><strong>${Math.round(r.reefersFin12).toLocaleString('fr-FR')}</strong></div>
    <div class="fin-reefer-row"><span>Reefers actifs fin An 2</span><strong>${Math.round(r.reefersFin24).toLocaleString('fr-FR')}</strong></div>
    <div class="fin-reefer-row"><span>Reefers actifs fin An 3</span><strong>${Math.round(r.reefersFin36).toLocaleString('fr-FR')}</strong></div>
    <div class="fin-reefer-row fin-reefer-hl" style="margin-top:6px">
      <span>🏆 Revenu annualisé fin An 3</span><strong>${eur(revAnnualFin3)}</strong>
    </div>
  `;
}

function _isHireActiveSimple(hire, monthIndex) {
  if (hire.endMonth !== undefined && monthIndex >= hire.endMonth) return false;
  if (hire.startMonth !== undefined) return monthIndex >= hire.startMonth - 1;
  return false;
}

function _tabLabel(t) {
  return { overview:'Vue d\'ensemble', pl:'Compte de résultat', cash:'Trésorerie', hr:'Plan RH', topdown:'Top-Down', sensitivity:'Sensibilité', actual:'Réel vs Prévu' }[t] || t;
}

function _drawerTabLabel(t) {
  return { revenue:'Revenus', team:'Équipe', opex:'Charges', cash:'Trésorerie', tax:'Fiscalité' }[t] || t;
}

function _revenueModelLabel(m) {
  return { saas:'SaaS', transactional:'Transactionnel', services:'Services', reefer:'Reefer · énergie' }[m] || m;
}

function _buildScenarioOptions() {
  const data = getFinanceData();
  const scenarios = data.scenarios || [];
  const activeId = data.activeScenarioId || '';
  if (scenarios.length === 0) return '<option value="">Base</option>';
  return scenarios.map(s => `<option value="${s.id}" ${s.id === activeId ? 'selected' : ''}>${s.name}</option>`).join('');
}

// ─── Formatters ───────────────────────────────────────────────────────────────
function _fmtK(n) {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  const abs = Math.abs(n), sign = n < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}${(abs/1e6).toFixed(1)}M€`;
  if (abs >= 1e3) return `${sign}${(abs/1e3).toFixed(0)}k€`;
  return `${sign}${Math.round(abs)}€`;
}

function _fmtCompact(n) {
  if (!isFinite(n)) return '';
  const abs = Math.abs(n), sign = n < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}${(abs/1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs/1e3).toFixed(0)}k`;
  return `${sign}${Math.round(abs)}`;
}

function _fmtPct(n) {
  if (!isFinite(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function _fmtMonth(str) {
  if (!str) return '—';
  const [y, m] = str.split('-');
  const names = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
  return `${names[+m-1]} ${y}`;
}

function _fmtMonthShort(str) {
  if (!str) return '';
  const [y, m] = str.split('-');
  const names = ['J','F','M','A','M','J','J','A','S','O','N','D'];
  return `${names[+m-1]}${y.slice(2)}`;
}

function _clone(obj) { return JSON.parse(JSON.stringify(obj)); }
