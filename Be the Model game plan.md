# Be the Model: game plan

Nov 25, 2026 · @Jesse

## Concept

Each player runs their own factory control room and races a trained model to spot machine faults before they cause a breakdown. It has three levels of 3 minutes each, inside a 45-minute workshop.

The lesson players should leave with: a model is good at faint patterns in sensor data, while people can use context the model never sees.

## Dashboard and controls

The layout follows your sketch: machine graphs on the left, activity log on the right, actions below. Controls appear only when a level needs them.

| Element | What it does | Levels |
| --- | --- | --- |
| Machine grapha\` | One live temperature line, with no normal range shown | 1–3 |
| Current values | RPM and temperature as numbers | 1–3 |
| Flag anomaly | Records "I think this is a fault" for scoring | 1–3 |
| Activity log | Engineer messages (diamond) and system messages (circle) | 2–3 |
| Send engineer | Checks and fixes one machine | 3 |
| Turn off machine | Stops a fault from progressing, but loses production | 3 |

Two changes I'd make to the sketch:

- **Keep one line per graph.** The line is always temperature, and RPM is shown as a number.
- **Put each machine's buttons and values under its own graph.** A separate decision panel makes players look back and forth to match machine numbers.

## Core mechanics

Every level plays a fixed script, so all players and the model face the same events. Graphs update once per second, with a little random noise.

The datasets are made in advance. Machine numbers are shuffled per player, including in log messages, so copying a neighbour's answer doesn't work. Only a player's first attempt at each level counts on the leaderboard.

Players judge only the temperature graph. The temperature and RPM numbers are for show. There are three patterns to learn:

| Graph pattern | What it might mean |
| --- | --- |
| Steady, moving slightly up and down | Normal |
| Steadily building up | A wearing part |
| Fluctuating a lot | A broken part |

- **Fault:** a pattern that keeps getting worse. It starts faint and ends in a breakdown after 45 seconds.
- **False scare:** looks odd but settles by itself or is explained by the log.
- **Flag (all levels):** one press per event. The player gets right or wrong feedback straight away.
- **Engineer (level 3):** 2 available. A visit takes 20 seconds, then a one-line report appears in the log.
- **Turn off (level 3):** freezes the fault. An engineer still has to fix it before the machine can restart.
- **Breakdown:** the machine stays offline for the rest of the level. The game continues.

## Levels

Each level adds one skill: reading data, then using context, then acting on it. Times are when the first sign appears.

### Level 1: spot it (1 machine)

| Time | What happens | Correct response |
| --- | --- | --- |
| 0:25 | Short temperature spike that settles | Ignore |
| 1:20 | Temperature creeps up while RPM stays flat | Alert |

### Level 2: check the context (4 machines)

| Time | Log message | Data | Correct response |
| --- | --- | --- | --- |
| 0:20 | Engineer: testing #1002, temperature will move | #1002 temperature rises, then recovers | Ignore |
| 0:55 | None | #1003 temperature slowly creeps up | Alert #1003 |
| 1:35 | Engineer: raising RPM on #1001 | #1001 temperature climbs far more than usual | Alert #1001 |
| 2:15 | System: indoor temperature higher than expected | All machines run slightly warmer | Ignore |

### Level 3: act on it (4 machines, 2 engineers)

| Time | What happens | Correct response |
| --- | --- | --- |
| 0:20 | #1003: temperature wobbles, then rises | Send engineer |
| 1:15 | #1002: single sharp spike | Ignore |
| 1:25 | #1004: same wobble as #1003 had | Send engineer early |
| 1:40 | #1001: sudden temperature climb | Send engineer, or turn off if none is free |

The engineer's report on #1003 teaches the wobble pattern. Teams that read it can catch #1004 sooner.

## Scoring and the model

Players and model score by the same rules. These numbers are a starting point to adjust after a test run.

| Outcome | Points |
| --- | --- |
| Fault caught (alert, or engineer arrives in time) | +100 |
| Speed bonus | +45, minus 1 per second after the first sign |
| False alarm or wasted engineer visit | −40 |
| Missed fault in levels 1–2 | −100 |
| Breakdown in level 3 | −150 |
| Machine turned off | −1 per second |

**The model:** players compete against a real trained anomaly detector, for example an Isolation Forest. It learns from normal temperature runs made by the same data generator, never from the level scripts. It does not read the activity log.

It processes each level one second at a time, so it never sees ahead. This can be done before the workshop and the results saved, as long as the level data stays the same.

In level 3 it follows one fixed rule: send an engineer when it flags something and one is free.

In level 3, the speed bonus counts from the flag, and the +100 still needs an engineer to arrive in time. A wrong flag costs 40 points. Flag feedback waits until level 3 ends, so flagging can't be used to test machines.

Don't tune the scripts until the model loses. Show its real results, including where it beats everyone.

### Results screen

When a level's simulation ends, players compare their results with the model's. The model's choices stay hidden until then. After level 3, show the totals for all three.

| Shown side by side | You | Model |
| --- | --- | --- |
| Faults caught |  |  |
| False alarms |  |  |
| Average seconds to detect |  |  |
| Score |  |  |

Below it, a replay of each graph marks where the player and the model reacted.

## Architecture

A single FastAPI container runs the game. The model runs beforehand and leaves its predictions as files.

&#91;embedded content: architecture · browser, backend, files, database\]

| Part | Choice |
| --- | --- |
| Frontend | Plain HTML, CSS and JavaScript, no build step |
| Backend | Python with FastAPI, one Uvicorn worker |
| Live updates | WebSockets, one update per second |
| Graphs | `<canvas>` |
| Database | SQLite |
| Model | scikit-learn, reads each dataset point by point |

- **Pages:** `index.html` holds join, control room and results. `leaderboard.html` is separate and fetches rankings every 5 seconds.
- **Safety:** nicknames are inserted with `textContent`, never `innerHTML`.
- **Sessions:** a player ID stored in the browser lets a refresh resume the same run.
- **Reruns:** if a dataset changes, rerun the predictions.

## Hosting and leaderboard

The game runs on your dedicated server, reached through a Cloudflare Tunnel. The workshop is open to anyone, so players join with a link or QR code and a nickname.

- **Server keeps the truth:** it streams the sensor data live and calculates scores. IT students will open dev tools, so upcoming events and correct answers never go to the browser early.
- **Shared leaderboard:** nicknames and points, with the model listed as its own entry.
- **Host controls:** start each level, reset between workshops and remove offensive nicknames.
- **Load:** test with many simulated players, since attendance is unknown.
- **Backup:** be able to run it on your own laptop if the server or tunnel fails.

## Build plan

The workshop is on 9 December. Start with level 1 and test it on someone before building the rest.

| Done by | Milestone |
| --- | --- |
| 29 Nov | Level 1 playable and tested on one person |
| 2 Dec | Server, tunnel, leaderboard and level 2 |
| 4 Dec | Model trained and results screen working |
| 6 Dec | Level 3 |
| 7 Dec | Full run-through with testers and load test |
| 8 Dec | Fixes only, no new features |

- [ ] Dashboard with one live graph and the alert button
- [ ] Level scripts as data files, so timings are easy to change
- [ ] Scoring and end-of-level screen
- [ ] Test level 1 with someone new to the topic
- [ ] Train the model and record its decisions
- [ ] Activity log and 4 machines (level 2)
- [ ] Engineers, turn off and breakdowns (level 3)
- [ ] Full run-through with 2–3 testers, then adjust timings and points

## Decided

- Open workshop for 1st and 2nd year IT students, any number of attendees
- Players bring their own laptops
- Shared leaderboard
