/* ============================================================
   FOUNDER OS — Radar des 8 dimensions
   Composant partagé (Dashboard + Roadmap). Le score est toujours
   dérivé de la roadmap via getDimensionScores() : rien n'est stocké.
   ============================================================ */

import { DIMENSIONS, getDimensionScores, getWeakestDimensions } from './core.js';

const MAX = 10;
let _chart = null;

// Une seule instance Chart vit à la fois : on la détruit avant de redessiner,
// sinon Chart.js garde un canvas fantôme après chaque validation d'objectif.
export function destroyRadar() {
  if (_chart) { _chart.destroy(); _chart = null; }
}

export function renderRadar(slot, onNavigate = null) {
  if (!slot) return;
  const scores = getDimensionScores();
  const weakest = getWeakestDimensions();
  const totalPts = DIMENSIONS.reduce((s, d) => s + scores[d.key], 0);

  const weakLabel = weakest.length === 1
    ? `Ton angle mort : <strong>${weakest[0].label}</strong> (${weakest[0].score}/${MAX})`
    : `Tes angles morts : <strong>${weakest.map(w => w.short).join(', ')}</strong> (${weakest[0].score}/${MAX})`;

  slot.innerHTML = `
    <div class="card radar-card">
      <div class="radar-head">
        <div class="card-title" style="margin:0">Pilotage des 8 dimensions</div>
        <span class="radar-total">${totalPts}/${DIMENSIONS.length * MAX} points</span>
      </div>
      <div class="radar-canvas-wrap">
        <canvas id="radar-8d"></canvas>
      </div>
      <div class="radar-pills">
        ${DIMENSIONS.map(d => `
          <button class="radar-pill" data-dim="${d.key}" style="border-color:${d.color}55">
            <span class="radar-pill-dot" style="background:${d.color}"></span>
            <span class="radar-pill-label">${d.label}</span>
            <span class="radar-pill-score" style="color:${d.color}">${scores[d.key]}/${MAX}</span>
          </button>`).join('')}
      </div>
      <div class="radar-weak">⚠️ ${weakLabel}</div>
    </div>`;

  _draw(scores);

  if (onNavigate) {
    slot.querySelectorAll('[data-dim]').forEach(pill => {
      pill.addEventListener('click', () => onNavigate(pill.dataset.dim));
    });
  }
}

function _draw(scores) {
  destroyRadar();
  const C = window.Chart;
  const canvas = document.getElementById('radar-8d');
  if (!C || !canvas) return;

  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const grid = dark ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.08)';
  const text = dark ? '#A0A2A8' : '#6E7079';

  // Le polygone « où tu en es » suit la couleur d'accent du thème, pas une
  // valeur codée en dur : la grille et les axes restent en gris de bordure.
  const css = window.getComputedStyle?.(document.documentElement);
  const token = (name, fallback) => (css?.getPropertyValue(name) || '').trim() || fallback;
  const accent = token('--accent', '#E4682E');
  const accentRgb = token('--accent-rgb', '228,104,46');

  C.defaults.font.family = "'DM Sans', system-ui, sans-serif";

  _chart = new C(canvas, {
    type: 'radar',
    data: {
      labels: DIMENSIONS.map(d => d.short),
      datasets: [{
        label: 'Score',
        data: DIMENSIONS.map(d => scores[d.key]),
        fill: true,
        backgroundColor: `rgba(${accentRgb},.16)`,
        borderColor: accent,
        borderWidth: 2,
        pointBackgroundColor: DIMENSIONS.map(d => d.color),
        pointBorderColor: dark ? '#0F0F11' : '#FFFFFF',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items => DIMENSIONS[items[0].dataIndex].label,
            label: item => `${item.raw}/${MAX} objectif${item.raw > 1 ? 's' : ''} validé${item.raw > 1 ? 's' : ''}`,
          },
        },
      },
      scales: {
        r: {
          min: 0,
          max: MAX,
          ticks: { stepSize: 2, backdropColor: 'transparent', color: text, font: { size: 10 } },
          grid: { color: grid },
          angleLines: { color: grid },
          pointLabels: { color: text, font: { size: 11, weight: '600' } },
        },
      },
    },
  });
}
