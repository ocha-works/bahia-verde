# bahia-verde

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ocha-works/bahia-verde/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ocha-works/bahia-verde/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Bahia Verde** is an original open-world crime game that runs in a desktop web browser. Explore a sun-soaked coastal city on foot and by car: steal rides, run jobs for the Vega family fixer Marisol, outrun the Bahia Verde PD as your wanted stars climb, brawl and shoot your way through a six-mission story arc, and stash your progress in the browser. Traffic, pedestrians, police chases, a live minimap and a full HUD — all in plain Canvas 2D JavaScript with no build step and no network calls.

## Run it

```sh
node serve.ts
# then open http://localhost:8080 in a desktop browser
```

Any static file server pointed at `game/` works just as well. Play with WASD/arrows to move and drive, E to enter or leave a car, Shift to sprint, mouse to aim, click or Space to punch and shoot, P to pause, M to mute.

## How it is built

Plain ES modules under `game/src/`, one job each, no dependencies:

| File | Job |
| --- | --- |
| `city.js` | Generates Bahia Verde from a fixed seed: road graph, blocks, buildings, beach, named places |
| `vehicles.js` | Car catalogue, traffic AI on the road graph, the shared arcade driving physics |
| `pedestrians.js` | Walkers who stroll, flee danger, and occasionally fight back |
| `police.js` | The wanted-heat model, BVPD Interceptor chases, officers, the bust meter |
| `player.js` | Nico on foot and behind the wheel: entering cars, driving, fighting |
| `combat.js` | Fists, the pistol, bullets and impact particles |
| `missions.js` | Marisol Vega's six-job story arc and the step engine that runs it |
| `hud.js` | Cash, health, wanted stars, objective banner, dialogue and the minimap |
| `render.js` | Camera, world and entity drawing, title / pause / busted / wasted screens |
| `audio.js` | Every sound synthesised with WebAudio — siren, engine, gunfire, a sunny music loop |
| `save.js` | Progress in `localStorage`: jobs done, cash, the pistol, where you left off |
| `scenes.js` | Staged set-pieces behind `?scene=chase` (etc.) — how the screenshots were taken |

The handover program at the repository root, `main.ts`, copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored make.fun library — that dossier is what the bounty judge reads.

## The story

Six jobs for fixer Marisol Vega: *First Wheels*, *Marina Run*, *Hot Van*, *Collections*, *Checkpoint Run*, and the finale, *The Sunset Score* — a cash truck, a money bag, a four-star manhunt, and a beach hideout where the trail goes cold. Finish the story and Bahia Verde is yours to roam.

---

<sub>Entered on [make.fun](https://make.fun/?ref=yhjp53pb&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
