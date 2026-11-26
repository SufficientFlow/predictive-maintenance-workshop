// Control room: header, stat cards, machine cards, engineers and activity log.
// Everything from the server goes in with textContent, never innerHTML.

import { drawChart, COLORS } from './chart.js';

const STATUS = { running: 'Running', engineer: 'Engineer on site', off: 'Turned off', broken: 'Broken down' };
const LOG_ICONS = { engineer: '◇', system: '○', you: '⚑' };
const WINDOW = 60; // seconds of graph shown

const $ = (id) => document.getElementById(id);
let cards = {};

export const fmtTime = (s) => {
  s = Math.max(0, Math.floor(s));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

// Build the machine cards for a new level. handlers: {flag, send, turnOff}(machineId)
export function buildDashboard(game, handlers) {
  const { controls, machines } = game;
  $('hdr-level').textContent = `Level ${game.level} · ${game.title}`;
  $('hdr-eng-wrap').hidden = !controls.engineers;
  $('sidebar').hidden = !controls.log;
  $('engineers-box').hidden = !controls.engineers;
  $('room-main').classList.toggle('no-sidebar', !controls.log);
  $('machines').classList.toggle('single', machines.length === 1);
  $('stats').replaceChildren();
  $('log').replaceChildren();

  cards = {};
  const container = $('machines');
  container.replaceChildren();
  for (const id of machines) {
    const card = el('article', 'machine panel');
    const head = el('header');
    const chip = el('span', 'chip', 'Running');
    head.append(el('h3', null, `Machine #${id}`), chip);

    const graph = el('div', 'graph');
    const canvas = el('canvas');
    graph.append(canvas);

    const values = el('div', 'values');
    const temp = el('b');
    const rpm = el('b');
    const tSpan = el('span', 't', 'TEMP');
    const rSpan = el('span', 'r', 'RPM');
    tSpan.append(temp);
    rSpan.append(rpm);
    values.append(tSpan, rSpan);

    const actions = el('div', 'actions');
    const button = (cls, text, fn) => {
      const b = el('button', cls, text);
      b.type = 'button';
      b.onclick = () => { b.disabled = true; fn(id); }; // re-enabled by the next tick if allowed
      actions.append(b);
      return b;
    };
    const flag = button('btn-outline', 'Flag anomaly', handlers.flag);
    const send = controls.engineers ? button('btn-primary', 'Send engineer', handlers.send) : null;
    const off = controls.engineers ? button('btn-ghost', 'Turn off machine', handlers.turnOff) : null;

    card.append(head, graph, values, actions);
    container.append(card);
    cards[id] = { card, chip, canvas, temp, rpm, flag, send, off };
  }
}

export function renderTick(game) {
  const tick = game.tick;
  if (!tick) return;

  $('hdr-time').textContent = fmtTime(tick.t);
  $('hdr-score').textContent = tick.score;
  if (game.controls.engineers) {
    const free = tick.engineers.filter((g) => g.machine == null).length;
    $('hdr-eng').textContent = `${free}/${tick.engineers.length}`;
    renderEngineers(tick.engineers);
  }
  renderStats(tick.stats);

  const now = Date.now();
  for (const [id, m] of Object.entries(tick.machines)) {
    const c = cards[id];
    if (!c) continue;
    c.chip.textContent = STATUS[m.status] ?? m.status;
    c.card.classList.toggle('is-broken', m.status === 'broken');
    c.card.classList.toggle('is-off', m.status === 'off');
    c.temp.textContent = `${Math.round(m.temp)} °C`;
    c.rpm.textContent = String(m.rpm);

    const fb = game.feedback[id];
    if (fb && fb.until > now) {
      c.flag.textContent = fb.correct ? '✓ Fault caught' : '✗ No fault';
      c.flag.disabled = true;
      c.flag.classList.add('flagged');
    } else if (m.flaggedAt != null) {
      c.flag.textContent = `Flagged at ${fmtTime(m.flaggedAt)}`;
      c.flag.disabled = true;
      c.flag.classList.add('flagged');
    } else {
      c.flag.textContent = 'Flag anomaly';
      c.flag.disabled = !m.canFlag;
      c.flag.classList.remove('flagged');
    }
    if (c.send) c.send.disabled = !m.canSend;
    if (c.off) c.off.disabled = !m.canTurnOff;
  }
  redrawGraphs(game);
}

export function redrawGraphs(game) {
  if (!game?.tick) return;
  const t = game.tick.t;
  for (const [id, c] of Object.entries(cards)) {
    drawChart(c.canvas, game.history[id] ?? [], {
      yMin: game.yRange[0],
      yMax: game.yRange[1],
      tMin: t - WINDOW,
      tMax: t,
      markers: (game.markers[id] ?? []).map((mt) => ({ t: mt, color: COLORS.you, dashed: true })),
    });
  }
}

function renderStats(stats) {
  const box = $('stats');
  if (box.children.length !== stats.length) {
    box.replaceChildren(...stats.map(() => {
      const card = el('div', 'stat panel');
      card.append(el('span'), el('b'));
      return card;
    }));
  }
  stats.forEach((s, i) => {
    const [label, value] = box.children[i].children;
    label.textContent = s.label;
    value.textContent = s.value;
  });
}

function renderEngineers(engineers) {
  $('engineers').replaceChildren(...engineers.map((g) => {
    const li = el('li');
    const row = el('div', 'row');
    const busy = g.machine != null;
    row.append(el('span', null, g.name), el('span', null, busy ? `#${g.machine} · ${g.secondsLeft} s left` : 'Available'));
    li.append(row);
    if (busy) {
      const bar = el('div', 'bar');
      const fillBar = el('i');
      fillBar.style.width = `${Math.round((1 - g.secondsLeft / g.total) * 100)}%`;
      bar.append(fillBar);
      li.append(bar);
    }
    return li;
  }));
}

export function addLog({ t, kind, text }) {
  const li = el('li', kind === 'you' ? 'you-entry' : null);
  li.append(el('span', 'icon', LOG_ICONS[kind] ?? '·'), el('span', 'when', fmtTime(t)), el('span', null, text));
  const log = $('log');
  log.prepend(li);
  while (log.children.length > 50) log.lastChild.remove();
}
