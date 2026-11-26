# predictive-maintenance-workshop

"Be the Model": a workshop game where players race a trained anomaly detector at spotting machine faults.

## Frontend

Plain HTML, CSS and JavaScript in `frontend/`. No build step.

```bash
python3 -m http.server 8000 -d frontend
```

- Game with the in-browser mock server: http://localhost:8000/?mock (add `&speed=5` to play faster). Use the bar at the bottom left to start levels.
- Leaderboard: http://localhost:8000/leaderboard.html (shows example rows until `/api/leaderboard` exists).
- To play again as a new player, clear `localStorage` (nickname and player ID).

Without `?mock` the page connects to `ws(s)://<host>/ws`. `js/mock-server.js` is for development only: don't serve it in production.

## Message contract

Server → browser (JSON, `type` field):

| type | fields |
| --- | --- |
| `waiting` | `level`, `title`, `done` |
| `level_start` | `level`, `title`, `duration`, `yRange: [min, max]`, `controls: {log, engineers}`, `machines: [id]`, `history: {id: [[t, temp]]}` |
| `tick` | `t`, `score`, `stats: [{label, value}]`, `engineers: [{name, machine, secondsLeft, total}]`, `machines: {id: {temp, rpm, status, flaggedAt, canFlag, canSend, canTurnOff}}` |
| `log` | `t`, `kind: engineer \| system \| you`, `text` |
| `flag_result` | `machine`, `correct`, `t` (levels 1–2 only) |
| `level_end` | `level`, `nextLevel`, `you`/`model: {caught, faults, falseAlarms, avgDetect, score}`, `totals: [{level, you, model}] \| null`, `replays: [{machine, temps: [[t, temp]], youAt: [t], modelAt: [t]}]` |

`status` is one of `running`, `engineer`, `off`, `broken`. The server sends full state every tick, so a reconnect (`join` with the same `playerId`) just resends `level_start` and carries on.

Browser → server: `join {nickname, playerId}`, `flag {machine}`, `send_engineer {machine}`, `turn_off {machine}`.

Leaderboard: `GET /api/leaderboard` → `[{nickname, points, isModel}]`.
