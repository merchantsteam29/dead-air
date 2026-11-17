# DEAD AIR: notes for developers and AI agents

Co-op "friendslop" ghost-hunting game. Plain HTML + ES modules + Three.js 0.160 (import map from a CDN), PeerJS for
rooms, no build step, no backend. Same stack as Mimic (`../mimic`); `net.js` and `vc.js` are copies of Mimic's
(room prefix `deadair-v1-`; vc.js adds a per-call `rec` send into `sfx.recMix`).

## Run / test
`node serve.js` -> http://localhost:8080. URL params: `?test` (exposes `window.__da`, skips the service worker),
`?autostart` (solo night at once), `?nomic`, `?join=CODE`. Tests in `tools/` (CDP harness, no npm deps): smoke, mp (two
Chromes over the PeerJS cloud), creatures, mobile, gallery, icons. Headless SwiftShader runs at a few fps and dt is capped
at 0.05, so wait on `game.time`, not wall time (see `waitGame` in creatures.mjs).

## Flow
Title -> Play alone (`SoloNet`, this browser is the host) / Host / Join -> lobby -> host `startNight()` broadcasts `start`
{seed, night, season, quota, seasonViews, crew} -> `Game`. Night ends (`end` {reason leave|time|dead, views, lost, cams,
dead}) -> every browser sends its highlights (`Session.shareHighlights`, paced `hl` parts: meta, JPEG frames, mu-law audio
in 16 KB parts; the host relays) and `hlEnd` -> host `review` {keys, info} -> `Review.play` -> host Next night / new season /
back to lobby. A season is 3 nights (`NIGHTS` in main.js); `quotaFor(season)` scales with crew size. Nothing to unlock,
no currency: views are only the score.

## Modules (js/)
- `world.js`: seeded 72x72 grid (1 m cells: GROUND / FLOOR / WALL / EDGE trees / SOLID / DOOR), 3-4 buildings split into
  rooms (BSP with doorways), the van at the south edge (`van` {x, z, r}: the zone you leave from). `collide`, `los`,
  `path` (BFS), `clearWalk`, `spot(r, 'in'|'out'|'any')`. `buildScene` draws it (instanced walls and trees, gable roofs).
  The moon has a shadow map rendered once (`shadowMap.autoUpdate = false`) so insides stay dark.
- `game.js`: one night. Host: `populate` (camcorders at the van: 1 for 1-2 players, 2 for 3-4; 30 props; 3+night passive
  anomalies; `schedule` for the dangerous ones), `hostTick` (things, items, rules, `snap` at 15 Hz), `knockDown`, `kill`,
  `stealFrom`, `noise` (Applause hears it). Everyone: `controls` (FPS movement, stamina, jump, grab/throw/drop, van hold-E
  after 20 s), `drawPlayers` (Crew models, headlamp SpotLights pool of 3), `voices` (proximity; the dead hear only the
  dead), HUD, a death cam on the killer, then spectating. Client -> host: st, grab, drop, film, leave. Host -> all: snap, ev, end.
- `things.js`: `KINDS` (worth + `act` multiplier per state). Host AI in `hostUpdate`; drawn from snapshots in `render`.
  chair, tv, flamingo (moves only unseen; pecks), wardrobe (knocks, opens when close), balloon (follows), dancer (dances
  only in a headlamp beam), **applause** (Mr. Applause: wander 0 / hunt 1 / chase 2 / pose 3 when filmed / stunned 4 / bow
  over a catch 5; hears `P.v` (mic level) and running), **hand** (targets carriers, steals, runs to a far room; stunned 3).
  `struck(th)` = a thrown thing hit it.
- `items.js`: camcorders (`cam`: `tape` views, `batt`) and junk; host physics (gravity, bounces, walls, shoves, bonks:
  >5.5 m/s knocks people down and stuns creatures). holder '' | player id | 'T<thing id>'.
- `camcorder.js`: filming (right click / LT / touch FILM). Viewfinder shader (grain, tear on `game.danger`, night vision
  N/RB). `tick` every 0.2 s scores what's in frame (worth x act x framing x distance x lit x freshness) and sends `film`
  {id, p, b} every second; `moment(ev)` gives big one-offs (a catch on camera = 450). Fake live chat (`chat.js`).
- **Places** (world.js `TYPES`): lot / mall / hospital / school (seeded; `?place=` forces one for tests). Big ones: one building (BSP `min`/`depth`/`door`), `FURN` cells (block walking, not sight) only inside a room's outer ring so it stays connected, `fixtures` (a ceiling light per room; events.js lights the nearest 5). Location junk via `T.props`, a unique thing via `T.unique`.
- `creatures3.js`: cart (mall), xray (hospital), chalkboard (school: `a` = message*10 + crew index; drawn on a canvas).
- **critic** (creatures3.js): drawn only while YOU film (`g.cam.aiming`); host: 0 lurks behind the nearest player, 1 filmed (walks at the filmer), within 2.2 m ev cancel {id, lost: 25% of their tape} + knock-down, 2 gone 30 s. camcorder.js: worth views for 2.4 s in frame (`critT`), then drains (film p can be negative: host clamps -300..1500, tape never under 0).
- **Haunted junk** (items.js `haunted`): `it.haunt` (first 2+night props), hs 0 asleep / 1 floating after the nearest player (2 m away, 1.3 m up) / 2 thrown at them (normal physics, so it bonks) / 3 resting; snapshot index 9 = hs+1 (`it.h`), drawn with a purple aura sprite.
- **Gadgets** (models.js `GADGETS`, appended after the location junk): walkie (P.radio flag 32 = holding + talking; listeners holding a walkie get `vc.route(.., radio: true)`; host `noise` at other walkies), emf (client HUD #emf), flash (charges in `batt`, intent `use` -> `hostUse` stuns in a 9 m cone, ev flashed), battery (`use`: +60 to a camcorder within 2.6 m, then removed: Items.applySnap drops items missing from the snapshot; ev charged {cam, b}).
- **Roles** (look.role, cleanLook): camop battery x0.6, host narrate 9/s, runner RUN x1.12 + stamina -13/s, tech EMF HUD + sees the Critic within 15 m. **Looks**: Crew(color, hat, outfit, acc).
- **Van levels** (`vanLevel(views)` in game.js, `VAN_LEVELS`): the host's local channel views, sent in start.vanLvl; world.buildVan draws them; perks: 2 brighter lamp, 3 extra battery, 4 van.r 6.5, 5 extra flash. (The owner chose looks AND small perks.)
- **Modes** (run.mode, start.mode): season (default), **endless** (`left` = 9999, the host checks the crew's tape total every 180 s against `endlessNeed(k)`: ev check {ok, need, have}; a fail = end('cancelled'); each pass spawns another hostile; snapshot `e` = [nextCheck, need]; records.endless), **monster** (start.monster = a random player id; that P.monster is out of `living()`, has no Crew model; an applause thing with `ctrl` = their id and `a` = 1 + their crew index follows their `st`; intents bite / bow -> `hostMonster`; the client runs `monsterControls` (red rings on loud players, brighter hemi); the review says who won).
- `events.js`: NightEvents, picked from the seed (no message; `?event=` forces one): fog, storm, power, bloodmoon (`speedK` in Things.walk, `mult` in the camcorder), bloodrain (chaos.js runs it). The moon, lightning, the fixture light pool.
- `tutorial.js`: first solo night of season 1, once per device (localStorage deadair.tutorial; `?tutorial` forces it; How to play resets it). #coach line, 5 steps, each times out after 45 s; pushes the hostile schedule back 70 s.
- Push to talk (main.js `updateMicGate`): settings.mic open | ptt; the mic track is enabled only while V / pad R3 (`pad.talk`) / touch TALK is held. Settings has a mic level bar (#micBar).
- Map is 84x84 now; lamp posts (`world.posts`, part of `fixtures` with `post: true`), lit windows on outside walls, lot rooms furnished (table / sofa / cabinet).
- `stats.js`: the local channel page (title > Your channel), recorded in main.showReview.
- `creatures2.js`: MORE kinds (appended to KINDS, so indexes stay): **intern** (crews of 2+; copies a living player, a = colour*10 + hat; 0 tag along, 1 stalk a loner (nobody within 10 m) at 2.7, 2 exposed after 1.5 s filmed within 12 m (ev exposed) and rushes the filmer, 3 hit, 4 took someone, 5 gone + disguise() respawn; the camera (cam.aiming) shows its true face), **mascot** (0 asleep in its chair, 1 moves only when no aiming player sees it, 2 frozen in a pose (a), 3 caught, 4 bonked), phone, bathtub, portrait (changes face unseen), dog (fetches thrown items: holder T<id>). things.js calls buildMore/hostMore/drawMore.
- `chaos.js`: **BloodRain** (host plans it ~55% of nights: ev rain warn/on/off + snap `r`; outside = not indoor and >3.2 m from the van: stamina -30/s, battery -2.2/s, red screen, filming x2), **Donations** (host ev req/reqDone/reqEnd every 45-80 s; the camcorder calls `progress`/`moment`; intent `don` {id, cam} -> bonus on that tape), **Bodies** (intents carry / bodyDrop; the host moves dead P (over the carrier's right shoulder, or flying); 2.5 s at the van -> ev revive). While dead, the host ignores a client's st position and the client takes its own from the snap.
- `emotes.js`: the wheel (hold Z, D-pad, touch EMOTE); `st.e` / snap index 10. Crew.update draws them; models.js also has the ragdoll (`knock(dx, dz)` from ev down/dead dx,dz).
- `tape.js`: `TapeRec` records 6 fps 192x108 JPEGs + 16 kHz audio of `sfx.recMix` (game sounds, your mic, friends' calls
  weighted by distance) through an AudioWorklet; keeps the best 8 s per camcorder.
- `review.js`: the upload page (plays clips with sound, comments, the night's numbers, season verdict).
- `session.js`: SoloNet / Net + VoiceChat, looks (`info`), message routing, highlight transfer.
- `input.js`: keyboard/mouse, every controller (raw layouts remapped; wheels and resting axes ignored), touch.
- `models.js`: Crew (bean with face, mouth flaps with voice level, hats, flop when down/dead), camcorder, props.
- `audio.js`: all sounds synthesized; `recMix` is what the camcorder hears.

## Online extras
- **Quick Play**: public crews host on fixed codes (`QUICK_CODES` in net.js, QQ?2; `newCode` never makes one). `probe()` asks every one at once (`peek` -> `peeked` with `session.peekInfo`: mode public/private, season/night). main.js `listQuick` (#quick), `hostCrew(code, true)` = public.
- **Rejoin**: while a night is on (`net.locked`) the host keeps a dropped player's place 45 s (`net.away`, the `secret` from welcome). Client: `lostConnection` -> `Session.rejoin` (8 tries, #rejoining) -> host `onRejoin` sends `lastStart` + `resume` {time, x, z, yaw} to that player only -> beginNight keeps the tape. `tools/online.mjs` tests both.

## Performance
- `node tools/perf.mjs` prints frame time, draw calls and triangles in a few spots (headless numbers: compare before / after only).
- Every light costs every pixel: headlamp spot lights only for actual friends (`lamps`), 3 fixture lights (events.js pool), no light on the view model or the dog. Never add or remove lights mid-night (shader rebuilds).
- Repeated level bits are instanced (walls, trees, furniture, lintels, windows, fixtures). `mats.js` `lam(color)` shares plain materials: never change one after creating it.
- The viewfinder renders at 60% resolution; its DOM text updates 10x a second. Shadows: PCF, the static moon map is drawn once.

## Rules
- Level generation must stay deterministic from the seed (every browser builds the map). Use the seeded `shuffle`.
- A client intent and a host broadcast never share a `t`.
- Nothing to unlock, no currency or shop (the owner's rule for these games).
- `[hidden]` is forced with `display: none !important` in style.css (CSS display rules used to beat it).
