// Dev-only stand-in for the FastAPI backend. Open the game with ?mock (and optionally &speed=5).
// Its events are placeholders, not the real level scripts. Don't serve this file in production:
// students will open dev tools.

const DURATION = 180;
const FAULT_SECONDS = 45;
const ENGINEER_SECONDS = 20;
const Y_RANGE = [35, 95];

const LEVELS = {
  1: {
    title: 'Spot it',
    machines: 1,
    controls: { log: false, engineers: false },
    events: [
      { at: 15, m: 0, kind: 'spike' },
      { at: 50, m: 0, kind: 'creep' },
    ],
  },
  2: {
    title: 'Check the context',
    machines: 4,
    controls: { log: true, engineers: false },
    events: [
      { at: 15, m: 1, kind: 'bump', log: ['engineer', 'Testing #{m}, its temperature will move for a bit.'] },
      { at: 40, m: 2, kind: 'creep' },
      { at: 80, m: 0, kind: 'climb', log: ['engineer', 'Raising RPM on #{m}.'] },
      { at: 120, m: null, kind: 'warm', log: ['system', 'Indoor temperature higher than expected.'] },
    ],
  },
  3: {
    title: 'Act on it',
    machines: 4,
    controls: { log: true, engineers: true },
    events: [
      { at: 15, m: 2, kind: 'wobble' },
      { at: 50, m: 1, kind: 'spike' },
      { at: 65, m: 3, kind: 'wobble' },
      { at: 90, m: 0, kind: 'climb' },
      { at: 120, m: 1, kind: 'creep' },
    ],
  },
};

const FAULTS = new Set(['creep', 'climb', 'wobble']);
const REPORTS = {
  creep: 'Replaced a worn bearing on #{m}.',
  wobble: 'Fixed a cracked fan blade on #{m}. The temperature wobbled before it climbed.',
  climb: 'Fixed the cooling pump on #{m}. It could not keep up at high RPM.',
};

const rand = (a, b) => a + Math.random() * (b - a);
const noise = (amp) => (Math.random() + Math.random() + Math.random() - 1.5) * amp;
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
const avg = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null);
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const fill = (text, m) => text.replace('{m}', m.id);

// Temperature offset of an event after p seconds of progress.
function offsetFor(kind, p) {
  const s = Math.min(1, p / FAULT_SECONDS);
  switch (kind) {
    case 'spike': return p < 6 ? 16 * Math.sin((Math.PI * p) / 6) : 0;
    case 'bump': return p < 30 ? 9 * Math.sin((Math.PI * p) / 30) : 0;
    case 'warm': return Math.min(3, p * 0.15);
    case 'creep': return 30 * s ** 1.6;
    case 'climb': return 6 * Math.min(1, p / 6) + 26 * s ** 1.4;
    case 'wobble': return 16 * s ** 1.4;
    default: return 0;
  }
}

export function createMockServer(onMessage) {
  const speed = Number(new URLSearchParams(location.search).get('speed')) || 1;
  const emit = (msg) => setTimeout(() => onMessage(msg), 0);
  const ids = shuffle([1001, 1002, 1003, 1004]); // shuffled per player, like the real game
  const scores = {};
  let joined = false;
  let nextLevel = 1;
  let L = null; // current level state
  let timer = null;

  const isLive = (m) => m.status === 'running' || (m.status === 'engineer' && !m.wasOff);
  const activeFault = (m) =>
    L.events.find((e) => e.machine === m && FAULTS.has(e.kind) && e.started && !e.resolved && !e.broken);
  const log = (kind, text) => { if (L.def.controls.log) emit({ type: 'log', t: L.t, kind, text }); };

  function startLevel(n) {
    clearInterval(timer);
    const def = LEVELS[n];
    const machines = ids.slice(0, def.machines).map((id) => {
      const m = {
        id, base: rand(48, 58), baseRpm: Math.round(rand(15, 32)) * 100, status: 'running',
        flaggedAt: null, flagCooldown: 0, restarting: 0, wasOff: false, actions: [], history: [],
      };
      m.rpm = m.baseRpm;
      for (let t = -60; t <= 0; t++) m.history.push([t, +(m.base + noise(1)).toFixed(1)]);
      m.temp = m.history.at(-1)[1];
      return m;
    });
    L = {
      n, def, t: 0, machines,
      events: def.events.map((e) => ({
        ...e, machine: e.m == null ? null : machines[e.m],
        started: false, progress: 0, resolved: false, broken: false, fixedAt: 0, fixOffset: 0, firstReact: null,
      })),
      engineers: def.controls.engineers
        ? [{ name: 'Engineer A', machine: null, left: 0 }, { name: 'Engineer B', machine: null, left: 0 }]
        : [],
      score: 0, caught: 0, falseAlarms: 0, detect: [], pendingFlags: [],
      output: 0, downtime: 0, indoor: 21, flags: 0,
    };
    sendLevelStart();
    log('system', `Shift started.${def.controls.engineers ? ' 2 engineers on duty.' : ''}`);
    timer = setInterval(step, 1000 / speed);
  }

  function sendLevelStart() {
    emit({
      type: 'level_start', level: L.n, title: L.def.title, duration: DURATION, yRange: Y_RANGE,
      controls: L.def.controls, machines: L.machines.map((m) => m.id),
      history: Object.fromEntries(L.machines.map((m) => [m.id, m.history])),
    });
    emit(tickMsg());
  }

  function resolve(e, m) {
    e.resolved = true;
    e.fixedAt = L.t;
    e.fixOffset = offsetFor(e.kind, e.progress);
    if (e.kind === 'climb') m.rpm = m.baseRpm;
  }

  function step() {
    const t = ++L.t;

    for (const e of L.events) {
      if (e.started || e.at > t) continue;
      e.started = true;
      if (e.log) log(e.log[0], e.machine ? fill(e.log[1], e.machine) : e.log[1]);
      if (e.kind === 'climb') e.machine.rpm = e.machine.baseRpm + 900;
      if (e.kind === 'warm') L.indoor = 24;
    }

    for (const g of L.engineers) if (g.machine && --g.left <= 0) finishVisit(g);

    for (const m of L.machines) {
      let offset = 0;
      let amp = 1;
      for (const e of L.events) {
        if (!e.started || (e.machine !== m && e.machine !== null)) continue;
        if (e.resolved) { offset += e.fixOffset * Math.max(0, 1 - (t - e.fixedAt) / 8); continue; }
        if (m.status === 'running' && !e.broken) e.progress++; // faults freeze when off or being fixed
        offset += offsetFor(e.kind, e.progress);
        if (e.kind === 'wobble') amp += 6 * Math.min(1, e.progress / FAULT_SECONDS);
      }

      if (isLive(m)) {
        const target = m.base + offset + noise(amp);
        m.temp = m.restarting > 0 ? m.temp + (target - m.temp) * 0.35 : target;
        if (m.restarting > 0) m.restarting--;
        L.output += m.rpm / 1000;
      } else {
        m.temp += ((m.status === 'broken' ? 24 : 32) - m.temp) * 0.06 + noise(0.2);
        L.downtime++;
        if (m.status === 'off') L.score -= 1;
      }

      const f = activeFault(m);
      if (f && f.progress >= FAULT_SECONDS) {
        f.broken = true;
        m.status = 'broken';
        L.score -= L.n === 3 ? 150 : 100;
        log('system', `Machine #${m.id} broke down.`);
      }

      if (m.flagCooldown > 0) m.flagCooldown--;
      if (m.flaggedAt != null && t - m.flaggedAt >= 30) m.flaggedAt = null;
      m.history.push([t, +m.temp.toFixed(1)]);
    }

    emit(tickMsg());
    if (t >= DURATION) endLevel();
  }

  function tickMsg() {
    const n = L.n;
    const free = L.engineers.filter((g) => !g.machine).length;
    const online = L.machines.filter(isLive).length;
    const stats = [{ label: 'Machines online', value: `${online} / ${L.machines.length}` }];
    if (n === 3) {
      stats.push({ label: 'Output this shift', value: `${Math.round(L.output).toLocaleString('en-US')} units` });
      stats.push({ label: 'Downtime', value: mmss(L.downtime) });
    }
    if (n >= 2) stats.push({ label: 'Indoor temperature', value: `${L.indoor} °C` });
    stats.push({ label: 'Your flags', value: String(L.flags) });

    const playing = L.t < DURATION;
    return {
      type: 'tick', t: L.t, score: L.score, stats,
      engineers: L.engineers.map((g) => ({
        name: g.name, machine: g.machine ? g.machine.id : null, secondsLeft: g.left, total: ENGINEER_SECONDS,
      })),
      machines: Object.fromEntries(L.machines.map((m) => [m.id, {
        temp: +m.temp.toFixed(1),
        rpm: isLive(m) ? m.rpm + Math.round(noise(15)) : 0,
        status: m.status,
        flaggedAt: m.flaggedAt,
        canFlag: playing && m.status !== 'broken' && m.flagCooldown === 0 && m.flaggedAt == null,
        canSend: playing && n === 3 && free > 0 && (m.status === 'running' || m.status === 'off'),
        canTurnOff: playing && n === 3 && m.status === 'running',
      }])),
    };
  }

  function flag(m) {
    if (m.status === 'broken' || m.flagCooldown > 0 || m.flaggedAt != null) return;
    L.flags++;
    m.actions.push(L.t);
    log('you', `You flagged machine #${m.id}.`);
    const f = activeFault(m);

    if (L.n === 3) {
      // Level 3: no feedback until the level ends, so flags can't be used to test machines.
      m.flaggedAt = L.t;
      L.pendingFlags.push({ ok: !!f });
      if (f) f.firstReact ??= L.t;
      emit(tickMsg());
      return;
    }

    m.flagCooldown = 3;
    if (f) {
      L.score += 100 + Math.max(0, 45 - (L.t - f.at));
      L.caught++;
      L.detect.push(L.t - f.at);
      resolve(f, m);
      log('system', `Maintenance fixed machine #${m.id}.`);
    } else {
      L.score -= 40;
      L.falseAlarms++;
    }
    emit({ type: 'flag_result', machine: m.id, correct: !!f, t: L.t });
    emit(tickMsg());
  }

  function dispatch(m) {
    const g = L.engineers.find((x) => !x.machine);
    if (L.n !== 3 || !g || !(m.status === 'running' || m.status === 'off')) return;
    g.machine = m;
    g.left = ENGINEER_SECONDS;
    m.wasOff = m.status === 'off';
    m.status = 'engineer';
    m.actions.push(L.t);
    const f = activeFault(m);
    if (f) f.firstReact ??= L.t;
    log('engineer', `Heading to machine #${m.id}.`);
    emit(tickMsg());
  }

  function finishVisit(g) {
    const m = g.machine;
    g.machine = null;
    const f = activeFault(m);
    if (f) {
      const react = f.firstReact ?? L.t;
      L.score += 100 + Math.max(0, 45 - (react - f.at));
      L.caught++;
      L.detect.push(react - f.at);
      resolve(f, m);
      log('engineer', fill(REPORTS[f.kind], m));
    } else {
      L.score -= 40;
      L.falseAlarms++;
      log('engineer', `Checked machine #${m.id}. Nothing found.`);
    }
    if (m.wasOff) m.restarting = 6;
    m.wasOff = false;
    m.status = 'running';
  }

  function turnOff(m) {
    if (L.n !== 3 || m.status !== 'running') return;
    m.status = 'off';
    m.actions.push(L.t);
    log('you', `You turned off machine #${m.id}.`);
    emit(tickMsg());
  }

  // Fake model: catches every fault 5-13 s in, and falls for every false scare (it can't read the log).
  function modelResult() {
    const at = {};
    const detect = [];
    let score = 0, caught = 0, falseAlarms = 0;
    for (const e of L.events) {
      if (!e.started) continue;
      if (FAULTS.has(e.kind)) {
        const d = Math.round(rand(5, 13));
        caught++; detect.push(d); score += 100 + 45 - d;
        (at[e.machine.id] ??= []).push(e.at + d);
      } else {
        falseAlarms++; score -= 40;
        const m = e.machine ?? L.machines[0];
        (at[m.id] ??= []).push(e.at + 2);
      }
    }
    return { at, caught, falseAlarms, avgDetect: avg(detect), score };
  }

  function endLevel() {
    clearInterval(timer);
    timer = null;
    if (L.n === 3) for (const p of L.pendingFlags) if (!p.ok) { L.score -= 40; L.falseAlarms++; }
    if (L.n < 3) {
      for (const e of L.events) {
        if (FAULTS.has(e.kind) && e.started && !e.resolved && !e.broken) L.score -= 100;
      }
    }
    const faults = L.events.filter((e) => FAULTS.has(e.kind) && e.started).length;
    const model = modelResult();
    scores[L.n] = { you: L.score, model: model.score };
    nextLevel = L.n + 1;

    emit({
      type: 'level_end', level: L.n, nextLevel: L.n < 3 ? L.n + 1 : null,
      you: { caught: L.caught, faults, falseAlarms: L.falseAlarms, avgDetect: avg(L.detect), score: L.score },
      model: { caught: model.caught, faults, falseAlarms: model.falseAlarms, avgDetect: model.avgDetect, score: model.score },
      totals: L.n === 3
        ? [1, 2, 3].map((n) => ({ level: n, you: scores[n]?.you ?? null, model: scores[n]?.model ?? null }))
        : null,
      replays: L.machines
        .filter((m) => L.events.some((e) => e.machine === m && e.started))
        .map((m) => ({
          machine: m.id,
          temps: m.history.filter((p) => p[0] >= 0),
          youAt: m.actions,
          modelAt: model.at[m.id] ?? [],
        })),
    });
  }

  function devBar() {
    const bar = document.createElement('div');
    bar.className = 'mockbar';
    const label = document.createElement('span');
    label.textContent = `Mock server · speed ×${speed}`;
    bar.append(label);
    const add = (text, fn) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.onclick = fn;
      bar.append(b);
    };
    for (const n of [1, 2, 3]) add(`Start L${n}`, () => joined && startLevel(n));
    add('End level', () => {
      if (!timer) return;
      L.t = DURATION - 1;
      step();
    });
    document.body.append(bar);
  }
  devBar();

  return {
    send(msg) {
      if (msg.type === 'join') {
        joined = true;
        if (timer) sendLevelStart();
        else emit({ type: 'waiting', level: Math.min(nextLevel, 3), title: LEVELS[Math.min(nextLevel, 3)].title, done: nextLevel > 3 });
        return;
      }
      if (!timer) return;
      const m = L.machines.find((x) => x.id === msg.machine);
      if (!m) return;
      if (msg.type === 'flag') flag(m);
      else if (msg.type === 'send_engineer') dispatch(m);
      else if (msg.type === 'turn_off') turnOff(m);
    },
  };
}
