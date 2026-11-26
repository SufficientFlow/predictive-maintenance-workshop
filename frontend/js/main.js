// Entry point: screen switching and message handling. The page only renders what the server
// sends; it never knows upcoming events or the right answers.

import { connect } from './connection.js';
import { buildDashboard, renderTick, redrawGraphs, addLog } from './dashboard.js';
import { showResults, redrawReplays } from './results.js';
import { drawChart } from './chart.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['join', 'waiting', 'room', 'results'];
const HINTS = {
  1: 'One machine. Press "Flag anomaly" as soon as you think a fault is developing. Blips that settle by themselves are not faults.',
  2: 'Four machines and an activity log. Engineers and the system explain some odd readings. The model can\'t read the log, but you can.',
  3: 'Two engineers. Send one to fix a machine, or turn a machine off to stop a fault getting worse. Flag results stay hidden until the level ends.',
};

let game = null;
let screen = null;

function show(name) {
  screen = name;
  for (const s of SCREENS) $(`screen-${s}`).hidden = s !== name;
  if (name === 'waiting') drawBriefing();
}

function playerId() {
  let id = localStorage.getItem('playerId');
  if (!id) {
    id = crypto.randomUUID?.() ?? String(Math.random()).slice(2);
    localStorage.setItem('playerId', id);
  }
  return id;
}

const conn = await connect(handle);

function join(nickname) {
  $('wait-nick').textContent = nickname;
  $('wait-title').textContent = 'Connecting…';
  $('wait-hint').textContent = '';
  show('waiting');
  conn.send({ type: 'join', nickname, playerId: playerId() });
}

function handle(msg) {
  switch (msg.type) {
    case 'waiting':
      $('wait-title').textContent = msg.done
        ? 'Shift over. Thanks for playing!'
        : `Waiting for the host to start level ${msg.level}: ${msg.title}`;
      $('wait-hint').textContent = msg.done ? '' : HINTS[msg.level] ?? '';
      show('waiting');
      break;

    case 'level_start': {
      const history = {};
      for (const [id, pts] of Object.entries(msg.history ?? {})) history[id] = pts.map(([t, v]) => ({ t, v }));
      game = {
        level: msg.level, title: msg.title, duration: msg.duration, controls: msg.controls,
        machines: msg.machines, yRange: msg.yRange ?? [35, 95],
        history, markers: {}, feedback: {}, tick: null,
      };
      buildDashboard(game, {
        flag: (machine) => conn.send({ type: 'flag', machine }),
        send: (machine) => conn.send({ type: 'send_engineer', machine }),
        turnOff: (machine) => conn.send({ type: 'turn_off', machine }),
      });
      show('room');
      break;
    }

    case 'tick': {
      if (!game) return;
      game.tick = msg;
      for (const [id, m] of Object.entries(msg.machines)) {
        const h = (game.history[id] ??= []);
        if (!h.length || h.at(-1).t < msg.t) h.push({ t: msg.t, v: m.temp });
        if (m.flaggedAt != null) addMarker(id, m.flaggedAt);
      }
      renderTick(game);
      break;
    }

    case 'log':
      addLog(msg);
      break;

    case 'flag_result':
      if (!game) return;
      game.feedback[msg.machine] = { correct: msg.correct, until: Date.now() + 2500 };
      addMarker(msg.machine, msg.t);
      renderTick(game);
      break;

    case 'level_end':
      showResults(msg, game);
      show('results');
      break;
  }
}

function addMarker(id, t) {
  const list = (game.markers[id] ??= []);
  if (!list.includes(t)) list.push(t);
}

// Example graphs on the waiting screen. Seeded, so they look the same every time.
function drawBriefing() {
  for (const canvas of document.querySelectorAll('canvas[data-pattern]')) {
    let seed = 7;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const kind = canvas.dataset.pattern;
    const pts = [];
    for (let t = 0; t < 60; t++) {
      let v = 55 + (r() + r() + r() - 1.5) * 1.2;
      if (kind === 'building' && t > 15) v += 0.012 * (t - 15) ** 2;
      if (kind === 'fluctuating' && t > 15) v += (r() - 0.5) * (t - 15) * 0.5 + (t - 15) * 0.1;
      pts.push({ t, v });
    }
    drawChart(canvas, pts, { yMin: 35, yMax: 95 });
  }
}

window.addEventListener('resize', () => {
  if (screen === 'room') redrawGraphs(game);
  if (screen === 'results') redrawReplays();
  if (screen === 'waiting') drawBriefing();
});

$('join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const nickname = $('nickname').value.trim().slice(0, 20);
  if (!nickname) return;
  localStorage.setItem('nickname', nickname);
  join(nickname);
});

// A refresh rejoins with the same player ID, so the server can resume the run.
const saved = localStorage.getItem('nickname');
if (saved) join(saved);
else show('join');
