// End-of-level screen: you vs the model, totals after level 3, and a replay per machine.

import { drawChart, COLORS } from './chart.js';
import { el } from './dashboard.js';

const $ = (id) => document.getElementById(id);
let replays = [];
let yRange = [35, 95];
let duration = 180;

export function showResults(msg, game) {
  const { you, model } = msg;
  yRange = game?.yRange ?? yRange;
  duration = game?.duration ?? duration;
  $('res-title').textContent = `Level ${msg.level} complete: you vs the model`;

  const dash = (v) => (v == null ? '–' : String(v));
  const rows = [
    ['Faults caught', `${you.caught} / ${you.faults}`, `${model.caught} / ${model.faults}`],
    ['False alarms', dash(you.falseAlarms), dash(model.falseAlarms)],
    ['Average seconds to detect', dash(you.avgDetect), dash(model.avgDetect)],
    ['Score', dash(you.score), dash(model.score)],
  ];
  $('res-body').replaceChildren(...rows.map((r, i) => tableRow(r, i === rows.length - 1)));

  $('res-totals').hidden = !msg.totals;
  if (msg.totals) {
    const sum = (k) => msg.totals.reduce((s, l) => s + (l[k] ?? 0), 0);
    $('totals-body').replaceChildren(
      ...msg.totals.map((l) => tableRow([`Level ${l.level}`, dash(l.you), dash(l.model)])),
      tableRow(['Total', String(sum('you')), String(sum('model'))], true),
    );
  }

  replays = msg.replays.map((r) => {
    const card = el('div', 'panel replay');
    const canvas = el('canvas');
    card.append(el('h3', null, `Replay: machine #${r.machine}`), canvas);
    return { ...r, canvas, card };
  });
  $('replays').replaceChildren(...replays.map((r) => r.card));

  $('res-next').textContent = msg.nextLevel
    ? `Waiting for the host to start level ${msg.nextLevel}.`
    : 'Shift over. Check the leaderboard on the big screen.';

  requestAnimationFrame(redrawReplays); // canvases need to be on screen to have a size
}

export function redrawReplays() {
  for (const r of replays) {
    drawChart(r.canvas, r.temps.map(([t, v]) => ({ t, v })), {
      yMin: yRange[0],
      yMax: yRange[1],
      tMin: 0,
      tMax: duration,
      markers: [
        ...r.modelAt.map((t) => ({ t, color: COLORS.model, dashed: true, label: 'Model', labelAt: 'bottom' })),
        ...r.youAt.map((t) => ({ t, color: COLORS.you, label: 'You', labelAt: 'top' })),
      ],
    });
  }
}

function tableRow(cells, strong = false) {
  const tr = el('tr', strong ? 'total' : null);
  cells.forEach((c, i) => {
    const td = el('td', null, c);
    if (strong && i === 1) td.className = 'you';
    tr.append(td);
  });
  return tr;
}
