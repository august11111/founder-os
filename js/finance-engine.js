/* ============================================================
   FOUNDER OS — Finance Engine
   Fonction pure : computeProjections(Assumptions) → Projections
   ============================================================ */

export const DEFAULT_ASSUMPTIONS = {
  horizonMonths: 36,
  startDate: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })(),
  currency: '€',
  revenueModel: 'saas',

  saas: {
    initialMRR: 0,
    initialCustomers: 0,
    newCustomersPerMonth: 5,
    newCustomersGrowthRate: 0.05,
    arpu: 99,
    churnRate: 0.03,
    expansionRate: 0.01,
  },

  transactional: {
    volumeBase: 1000,
    volumeGrowthRate: 0.08,
    unitPrice: 30,
    takeRate: 0.15,
  },

  services: {
    projectsPerMonth: 3,
    avgTicket: 8000,
    deliveryRate: 0.80,
  },

  // Modèle reefer : revenue-share sur le gain arbitrage énergie.
  // Gain calé sur Tang et al. 2025 (IJPR) — parc réel Rotterdam/Anvers.
  reefer: {
    gainTheoriqueParReeferAn: 1300, // €/reefer/an — Tang et al. 2025, IJPR
    tauxCaptureReel: 0.50,          // décote de réalisme vs optimum académique (contexte FR)
    revenueSharePct: 0.40,          // part captée par Avelya
    // Jalons de déploiement (fin mois 12 / 24 / 36) — la trajectoire intermédiaire est dérivée
    reefersFin12: 80,
    reefersFin24: 350,
    reefersFin36: 900,
    // Trajectoire complète (référence) — utilisée en fallback si les jalons sont absents
    trajectoireReefers: [
      { mois: 0,  reefers: 0 },
      { mois: 6,  reefers: 0 },
      { mois: 9,  reefers: 30 },
      { mois: 12, reefers: 80 },
      { mois: 18, reefers: 180 },
      { mois: 24, reefers: 350 },
      { mois: 30, reefers: 600 },
      { mois: 36, reefers: 900 },
    ],
  },

  topDown: {
    enabled: true,
    tam: 1000000000,
    sam: 50000000,
    som: 5000000,
    targetMarketShare: 0.005,
    rampMonths: 36,
  },

  cogs: {
    variableRate: 0.10,
    fixedMonthly: 0,
  },

  hiringPlan: [
    // ── Founders : salaire progressif par phases ───────────────────────────────
    // mois 0-2 : 0€ (non modélisé — aucune ligne active avant startMonth 4)
    // mois 3-11 : 1 250 €/mois net ≈ 21 000 €/an brut
    { id: 'p1a', role: 'Pierre (CEO) · amorçage',    salary: 21000, category: 'management', startMonth: 4,  endMonth: 12 },
    { id: 'p1b', role: 'Pierre (CEO) · post-levée',  salary: 40000, category: 'management', startMonth: 13, endMonth: 24 },
    { id: 'p1c', role: 'Pierre (CEO) · an 3',        salary: 55000, category: 'management', startMonth: 25 },
    { id: 'p2a', role: 'CTO (cofond.) · amorçage',   salary: 21000, category: 'tech',       startMonth: 4,  endMonth: 12 },
    { id: 'p2b', role: 'CTO (cofond.) · post-levée', salary: 40000, category: 'tech',       startMonth: 13, endMonth: 24 },
    { id: 'p2c', role: 'CTO (cofond.) · an 3',       salary: 55000, category: 'tech',       startMonth: 25 },
    // ── Stagiaires : gratification non chargée (rotation 6 mois) ──────────────
    { id: 's1', role: 'Stagiaire A (rotation 6m)', salary: 14400, category: 'intern', startMonth: 13, gratification: true },
    { id: 's2', role: 'Stagiaire B (rotation 6m)', salary: 14400, category: 'intern', startMonth: 19, gratification: true },
    // ── CDI tech post-levée ────────────────────────────────────────────────────
    { id: 'e1', role: 'Ingé tech #1 (lead, GE)', salary: 55000, category: 'tech', startMonth: 15 },
    { id: 'e2', role: 'Ingé tech #2 (GE)',        salary: 50000, category: 'tech', startMonth: 21 },
  ],

  socialChargesRate: 0.45,
  jeiEnabled: false,
  jeiEligibleCategories: ['tech', 'rd'],

  opex: {
    tools: 300,
    rent: 0,
    accounting: 300,
    legal: 200,
    marketing: 500,
    other: 200,
    inflationRate: 0.02,
  },

  cir: {
    enabled: false,
    rate: 0.30,
    eligibleCategories: ['tech', 'rd'],
    paymentMonthOfYear: 9,
    delayYears: 1,
  },

  is: {
    enabled: true,
    rate: 0.25,
  },

  vat: {
    enabled: false,
    salesRate: 0.20,
    purchaseRate: 0.20,
    reverseDelayMonths: 1,
  },

  dso: 30,
  dpo: 30,
  initialCash: 150000,

  financing: [
    // Subventions non dilutives
    { id: 'fi1', name: 'Bourse French Tech (tr. 1)',     type: 'grant',    amount: 20000,  month: 3  },
    { id: 'fi2', name: 'Bourse French Tech (tr. 2)',     type: 'grant',    amount: 20000,  month: 9  },
    // Prêt d'honneur taux 0 — remboursement différé mois 30
    { id: 'fi3', name: "Prêt d'honneur (Réseau Entrep.)", type: 'loan',   amount: 30000,  month: 5,  repaymentStart: 31, repaymentDuration: 36, interestRate: 0    },
    // Equity
    { id: 'fi4', name: 'Levée Business Angels',           type: 'equity',  amount: 300000, month: 13 },
    // BPI Prêt Amorçage — différé 3 ans, remboursement hors horizon 36 mois
    { id: 'fi5', name: 'BPI Prêt Amorçage (Invest EU)',   type: 'bpi_loan', amount: 150000, month: 14, repaymentStart: 50, repaymentDuration: 96, interestRate: 0.05 },
  ],
};

// ─── Moteur principal ────────────────────────────────────────────────────────

export function computeProjections(a) {
  const n = Math.max(1, Math.min(+(a.horizonMonths) || 36, 60));
  const months = [];

  let mrr = +(a.saas?.initialMRR || 0);
  let customers = +(a.saas?.initialCustomers || 0);
  let cumulativeCash = +(a.initialCash || 0);
  let deficitCarry = 0;
  let yearlyEBT = 0;
  const loanSchedule = _buildLoanSchedule(a.financing || [], n);
  const cirByYear = {};

  for (let i = 0; i < n; i++) {
    const yearIdx = Math.floor(i / 12);

    // ── Revenue ──────────────────────────────────────────────
    const rev = _calcRevenue(a, i, mrr, customers);
    mrr = rev.mrr;
    customers = rev.customers;

    // ── COGS ─────────────────────────────────────────────────
    const cogs = rev.revenue * (+(a.cogs?.variableRate) || 0) + (+(a.cogs?.fixedMonthly) || 0);
    const grossMargin = rev.revenue - cogs;

    // ── HR ───────────────────────────────────────────────────
    const hr = _calcHR(a, i, months);

    // Accumulate CIR-eligible R&D salaries per year
    if (a.cir?.enabled) {
      const eligCats = a.cir.eligibleCategories || ['tech', 'rd'];
      const rdSalary = (a.hiringPlan || [])
        .filter(h => eligCats.includes(h.category) && _isHireActive(h, i, months))
        .reduce((s, h) => s + (+(h.salary) || 0) / 12, 0);
      cirByYear[yearIdx] = (cirByYear[yearIdx] || 0) + rdSalary;
    }

    // ── OPEX ─────────────────────────────────────────────────
    const opex = _calcOPEX(a, i);

    // ── Top-down ─────────────────────────────────────────────
    const topDownRevenue = _calcTopDown(a, i);

    // ── CIR reçu ce mois ─────────────────────────────────────
    const cirReceived = _calcCIRReceived(a, i, cirByYear);

    // ── Financements ─────────────────────────────────────────
    const financingInflow = _calcFinancingInflow(a.financing || [], i);
    const loanRepayment = loanSchedule[i] || 0;
    const interestExpense = _calcInterestExpense(a.financing || [], i);

    // ── P&L ──────────────────────────────────────────────────
    const ebitda = grossMargin - hr.totalCost - opex;
    const ebt = ebitda - interestExpense;
    yearlyEBT += ebt;

    let isAmount = 0;
    const isYearEnd = (i + 1) % 12 === 0 || i === n - 1;
    if (isYearEnd && a.is?.enabled) {
      const taxable = yearlyEBT + deficitCarry;
      if (taxable > 0) {
        isAmount = taxable * (+(a.is?.rate) || 0.25);
        deficitCarry = 0;
      } else {
        deficitCarry = Math.min(0, taxable);
      }
      yearlyEBT = 0;
    }

    const netResult = ebt - isAmount + cirReceived;

    // ── Cash flow ─────────────────────────────────────────────
    const dsoM = Math.round((+(a.dso) || 0) / 30);
    const dpoM = Math.round((+(a.dpo) || 0) / 30);
    const opCosts = hr.totalCost + opex + cogs;

    const cashReceipts = i >= dsoM ? months[i - dsoM].revenue : 0;
    const cashDisbursements = i >= dpoM ? months[i - dpoM]._opCosts : opCosts;

    let vatCash = 0;
    if (a.vat?.enabled) {
      const delay = Math.max(0, +(a.vat?.reverseDelayMonths) || 1);
      if (i >= delay) vatCash = -(months[i - delay]._vatBalance || 0);
    }
    const vatBalance = a.vat?.enabled
      ? rev.revenue * (+(a.vat?.salesRate) || 0.20) - (cogs + opex) * (+(a.vat?.purchaseRate) || 0.20)
      : 0;

    const netCashFlow = cashReceipts - cashDisbursements + financingInflow - loanRepayment + vatCash + cirReceived - isAmount;
    cumulativeCash += netCashFlow;

    // BFR
    const bfr = (rev.revenue * (+(a.dso) || 0) / 30) - (opCosts * (+(a.dpo) || 0) / 30);

    months.push({
      monthIndex: i,
      date: _addMonths(a.startDate, i),
      year: yearIdx,

      revenue: rev.revenue,
      mrr: rev.mrr,
      arr: rev.mrr * 12,
      newCustomers: rev.newCustomers || 0,
      totalCustomers: rev.customers,
      churnedCustomers: rev.churned || 0,
      topDownRevenue,

      cogs,
      grossMargin,
      grossMarginRate: rev.revenue > 0 ? grossMargin / rev.revenue : 0,

      headcount: hr.headcount,
      salaryGross: hr.salaryGross,
      socialCharges: hr.socialCharges,
      jeiExemption: hr.jeiExemption,
      personnelCost: hr.totalCost,
      opex,
      cirReceived,

      ebitda,
      interestExpense,
      ebt,
      isAmount,
      netResult,

      cashReceipts,
      cashDisbursements,
      vatCash,
      loanRepayment,
      financingInflow,
      netCashFlow,
      cumulativeCash,
      bfr,

      _opCosts: opCosts,
      _vatBalance: vatBalance,
    });
  }

  return {
    months,
    years: _aggregateYears(months),
    summary: _buildSummary(months, a),
  };
}

// ─── Revenue ─────────────────────────────────────────────────────────────────

function _calcRevenue(a, i, prevMRR, prevCustomers) {
  const model = a.revenueModel || 'saas';

  if (model === 'saas') {
    const s = a.saas || {};
    const growth = +(s.newCustomersGrowthRate) || 0;
    const newCust = Math.max(0, (+(s.newCustomersPerMonth) || 0) * Math.pow(1 + growth, i));
    const churn = +(s.churnRate) || 0;
    const expansion = +(s.expansionRate) || 0;
    const arpu = +(s.arpu) || 0;
    const churned = prevCustomers * churn;
    const customers = Math.max(0, prevCustomers - churned + newCust);
    const mrr = Math.max(0, prevMRR * (1 - churn) * (1 + expansion) + newCust * arpu);
    return { revenue: mrr, mrr, newCustomers: newCust, customers, churned };
  }

  if (model === 'transactional') {
    const t = a.transactional || {};
    const volume = (+(t.volumeBase) || 0) * Math.pow(1 + (+(t.volumeGrowthRate) || 0), i);
    const revenue = volume * (+(t.unitPrice) || 0) * (+(t.takeRate) || 0);
    return { revenue, mrr: revenue, newCustomers: volume, customers: prevCustomers + volume, churned: 0 };
  }

  if (model === 'services') {
    const sv = a.services || {};
    const revenue = (+(sv.projectsPerMonth) || 0) * (+(sv.avgTicket) || 0) * (+(sv.deliveryRate) || 0);
    return { revenue, mrr: revenue, newCustomers: +(sv.projectsPerMonth) || 0, customers: prevCustomers, churned: 0 };
  }

  if (model === 'reefer') {
    const r = a.reefer || {};
    const traj = r.reefersFin36 !== undefined ? _trajFromFinHelpers(r) : (r.trajectoireReefers || []);
    const reefersActifs = reefersActifsAuMois(traj, i);
    const gainEffectif  = gainEffectifParReeferAn(r);
    const revenue = reefersActifs * gainEffectif / 12 * (+(r.revenueSharePct) || 0);
    return {
      revenue, mrr: revenue,
      newCustomers: 0, customers: reefersActifs, churned: 0,
      _reefersActifs: reefersActifs, _gainEffectif: gainEffectif,
    };
  }

  return { revenue: 0, mrr: 0, newCustomers: 0, customers: prevCustomers, churned: 0 };
}

// Interpolation linéaire entre points de contrôle de la trajectoire.
// traj : tableau de { mois, reefers } trié par mois. i : mois 0-indexé.
export function reefersActifsAuMois(traj, i) {
  if (!traj || traj.length === 0) return 0;
  const pts = [...traj].sort((a, b) => a.mois - b.mois);
  if (i <= pts[0].mois) return pts[0].reefers;
  if (i >= pts[pts.length - 1].mois) return pts[pts.length - 1].reefers;
  for (let k = 0; k < pts.length - 1; k++) {
    if (i >= pts[k].mois && i < pts[k + 1].mois) {
      const t = (i - pts[k].mois) / (pts[k + 1].mois - pts[k].mois);
      return pts[k].reefers + t * (pts[k + 1].reefers - pts[k].reefers);
    }
  }
  return 0;
}

// Gain effectif par reefer par an = théorique × taux de capture.
export function gainEffectifParReeferAn(r) {
  return (+(r.gainTheoriqueParReeferAn) || 1300) * (+(r.tauxCaptureReel) || 0.50);
}

// Dérive une trajectoire 8 points à partir des 3 jalons annuels.
function _trajFromFinHelpers(r) {
  const an1 = Math.max(0, +(r.reefersFin12) || 0);
  const an2 = Math.max(0, +(r.reefersFin24) || 0);
  const an3 = Math.max(0, +(r.reefersFin36) || 0);
  return [
    { mois: 0,  reefers: 0 },
    { mois: 6,  reefers: 0 },
    { mois: 9,  reefers: Math.round(an1 * 0.375) },
    { mois: 12, reefers: an1 },
    { mois: 18, reefers: Math.round(an1 + (an2 - an1) * 0.37) },
    { mois: 24, reefers: an2 },
    { mois: 30, reefers: Math.round(an2 + (an3 - an2) * 0.45) },
    { mois: 36, reefers: an3 },
  ];
}

// ─── HR ──────────────────────────────────────────────────────────────────────

function _isHireActive(hire, monthIndex, prevMonths) {
  // endMonth (1-indexed, inclusif) : le hire devient inactif à partir de ce mois
  if (hire.endMonth !== undefined && monthIndex >= hire.endMonth) return false;
  if (hire.startMonth !== undefined) return monthIndex >= hire.startMonth - 1;
  if (hire.condition) {
    const prev = prevMonths.length > 0 ? prevMonths[prevMonths.length - 1] : null;
    if (hire.condition.type === 'mrr')   return (prev?.mrr || 0) >= hire.condition.value;
    if (hire.condition.type === 'month') return monthIndex >= hire.condition.value - 1;
  }
  return false;
}

function _calcHR(a, i, prevMonths) {
  const charges = +(a.socialChargesRate) || 0;
  const jei = a.jeiEnabled;
  const jeiCats = a.jeiEligibleCategories || ['tech', 'rd'];
  let salaryGross = 0, socialCharges = 0, jeiExemption = 0, headcount = 0;

  for (const hire of (a.hiringPlan || [])) {
    if (!_isHireActive(hire, i, prevMonths)) continue;
    const monthly = (+(hire.salary) || 0) / 12;
    let sc = 0, jeiEx = 0;
    if (!hire.gratification) {
      const isJEI = jei && jeiCats.includes(hire.category);
      sc    = isJEI ? 0 : monthly * charges;
      jeiEx = isJEI ? monthly * charges : 0;
    }
    salaryGross    += monthly;
    socialCharges  += sc;
    jeiExemption   += jeiEx;
    headcount++;
  }
  return { salaryGross, socialCharges, jeiExemption, totalCost: salaryGross + socialCharges, headcount };
}

// ─── OPEX ─────────────────────────────────────────────────────────────────────

function _calcOPEX(a, i) {
  const o = a.opex || {};
  const base = (+(o.tools)||0) + (+(o.rent)||0) + (+(o.accounting)||0) +
               (+(o.legal)||0) + (+(o.marketing)||0) + (+(o.other)||0);
  const inflation = Math.pow(1 + (+(o.inflationRate) || 0), Math.floor(i / 12));
  return base * inflation;
}

// ─── CIR ─────────────────────────────────────────────────────────────────────

function _calcCIRReceived(a, i, cirByYear) {
  if (!a.cir?.enabled) return 0;
  const delay = +(a.cir.delayYears) || 1;
  const payMonth = (+(a.cir.paymentMonthOfYear) || 9) - 1; // 0-indexed month in year
  // CIR for year y received in month (y + delay)*12 + payMonth
  const targetYear = Object.keys(cirByYear).map(Number).find(
    y => (y + delay) * 12 + payMonth === i
  );
  if (targetYear === undefined) return 0;
  return (cirByYear[targetYear] || 0) * (+(a.cir.rate) || 0.30);
}

// ─── Top-Down ────────────────────────────────────────────────────────────────

function _calcTopDown(a, i) {
  if (!a.topDown?.enabled) return 0;
  const td = a.topDown;
  const annualTarget = (+(td.som) || 0) * (+(td.targetMarketShare) || 0);
  const monthlyTarget = annualTarget / 12;
  const ramp = +(td.rampMonths) || 36;
  return monthlyTarget * Math.min(1, (i + 1) / ramp);
}

// ─── Financing ───────────────────────────────────────────────────────────────

function _calcFinancingInflow(financing, i) {
  return financing
    .filter(f => (+(f.month) || 1) - 1 === i)
    .reduce((s, f) => s + (+(f.amount) || 0), 0);
}

function _buildLoanSchedule(financing, n) {
  const schedule = new Array(n).fill(0);
  for (const f of financing) {
    if (f.type !== 'loan' && f.type !== 'bpi_loan') continue;
    const start = (+(f.repaymentStart) || 1) - 1;
    const dur = +(f.repaymentDuration) || 24;
    const monthly = (+(f.amount) || 0) / dur;
    for (let m = start; m < Math.min(start + dur, n); m++) schedule[m] += monthly;
  }
  return schedule;
}

function _calcInterestExpense(financing, i) {
  let total = 0;
  for (const f of financing) {
    if ((f.type !== 'loan' && f.type !== 'bpi_loan') || !f.interestRate) continue;
    const start = (+(f.repaymentStart) || 1) - 1;
    const dur = +(f.repaymentDuration) || 24;
    if (i < start || i >= start + dur) continue;
    const monthsLeft = dur - (i - start);
    const remaining = (+(f.amount) || 0) * (monthsLeft / dur);
    total += remaining * (+(f.interestRate) || 0) / 12;
  }
  return total;
}

// ─── Agrégation annuelle ─────────────────────────────────────────────────────

function _aggregateYears(months) {
  const byYear = {};
  for (const m of months) {
    const y = m.year;
    if (!byYear[y]) byYear[y] = { yearIndex: y, months: [] };
    byYear[y].months.push(m);
  }
  return Object.values(byYear).map(({ yearIndex, months: ms }) => {
    const sum = k => ms.reduce((s, m) => s + (m[k] || 0), 0);
    const last = ms[ms.length - 1];
    return {
      yearIndex,
      label: `Année ${yearIndex + 1}`,
      revenue: sum('revenue'),
      cogs: sum('cogs'),
      grossMargin: sum('grossMargin'),
      personnelCost: sum('personnelCost'),
      opex: sum('opex'),
      ebitda: sum('ebitda'),
      isAmount: sum('isAmount'),
      cirReceived: sum('cirReceived'),
      netResult: sum('netResult'),
      cashReceipts: sum('cashReceipts'),
      cashDisbursements: sum('cashDisbursements'),
      netCashFlow: sum('netCashFlow'),
      financingInflow: sum('financingInflow'),
      endCash: last.cumulativeCash,
      endMRR: last.mrr,
      endARR: last.arr,
      endHeadcount: last.headcount,
      grossMarginRate: sum('revenue') > 0 ? sum('grossMargin') / sum('revenue') : 0,
    };
  });
}

// ─── Summary ─────────────────────────────────────────────────────────────────

function _buildSummary(months, a) {
  const last = months[months.length - 1];
  const lastCash = last.cumulativeCash;

  // Burn rate: average monthly cash burn (negative net cash flow)
  const burningMonths = months.filter(m => m.netCashFlow < 0);
  const burnRate = burningMonths.length > 0
    ? -burningMonths.reduce((s, m) => s + m.netCashFlow, 0) / burningMonths.length
    : 0;

  // Runway
  const cashAtRisk = months.find(m => m.cumulativeCash <= 0);
  const runway = cashAtRisk
    ? cashAtRisk.monthIndex
    : burnRate > 0 ? Math.floor(lastCash / burnRate) : Infinity;
  const cashZeroDate = cashAtRisk
    ? cashAtRisk.date
    : burnRate > 0 ? _addMonths(last.date, Math.floor(lastCash / burnRate)) : null;

  // Break-even: first month where netResult > 0 sustained
  const breakEven = months.find((m, i) =>
    m.netResult > 0 && months.slice(i, i + 3).every(x => x.netResult > 0)
  );

  // SaaS metrics
  const lastMRR = last.mrr;
  const avgChurn = +(a.saas?.churnRate) || 0.03;
  const arpu = +(a.saas?.arpu) || 0;
  const ltv = avgChurn > 0 && arpu > 0 ? arpu / avgChurn : 0;

  // CAC: total sales & marketing opex / total new customers
  const totalNewCust = months.reduce((s, m) => s + m.newCustomers, 0);
  const totalMarketing = months.reduce((s, m) => s + m.opex * 0.3, 0); // rough estimate
  const cac = totalNewCust > 0 ? totalMarketing / totalNewCust : 0;

  const totalRevenue = months.reduce((s, m) => s + m.revenue, 0);
  const totalGrossMargin = months.reduce((s, m) => s + m.grossMargin, 0);
  const avgGrossMarginRate = totalRevenue > 0 ? totalGrossMargin / totalRevenue : 0;
  const peakCashLow = Math.min(...months.map(m => m.cumulativeCash));

  return {
    burnRate,
    runway: isFinite(runway) ? runway : null,
    cashZeroDate,
    breakEvenMonth: breakEven?.monthIndex ?? null,
    breakEvenDate: breakEven?.date ?? null,
    ltv,
    cac,
    ltvCac: cac > 0 ? ltv / cac : null,
    mrr: lastMRR,
    arr: lastMRR * 12,
    avgGrossMarginRate,
    peakCashLow,
    totalRevenue,
    endCash: lastCash,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _addMonths(baseDate, n) {
  const [y, m] = (baseDate || '2024-01').split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Analyse de sensibilité ───────────────────────────────────────────────────

export function computeSensitivity(a, driver1Key, driver1Values, driver2Key, driver2Values, metric = 'runway') {
  return driver1Values.map(v1 =>
    driver2Values.map(v2 => {
      const modified = JSON.parse(JSON.stringify(a)); // deep clone — évite mutation de a
      _setNestedKey(modified, driver1Key, v1);
      _setNestedKey(modified, driver2Key, v2);
      const { summary } = computeProjections(modified);
      return metric === 'runway' ? summary.runway :
             metric === 'breakeven' ? summary.breakEvenMonth :
             summary[metric];
    })
  );
}

function _setNestedKey(obj, dotPath, value) {
  const parts = dotPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]]) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
  return obj;
}
