// missions.js — Marisol Vega's story: six jobs that take Nico Ferrer
// from stealing his first coupe to knocking over a cash truck at
// sunset. A small step engine runs each job: every mission is a list
// of steps (go somewhere, steal this, deliver that, lose the police,
// win this fight), and each step knows how to start, how to check
// itself, and where its marker sits. Between missions a glowing
// marker waits at the next job's doorstep.

import { PLACES } from './city.js';
import { makeVehicle } from './vehicles.js';
import { makePedestrian } from './pedestrians.js';
import { setWantedLock, clearWanted } from './police.js';
import { givePistol } from './player.js';
import { sfx } from './audio.js';

export function createMissions(game) {
  const ms = {
    index: 0,
    phase: 'offer', // offer | active | done
    stepIdx: 0,
    steps: [],
    current: null,
    spawned: [],
    timer: 0,
    checkpointIdx: 0,
    storyComplete: false,
    offerArmed: true,
  };
  game.missions = ms;
  ms.list = buildMissionList(game);
  return ms;
}

function track(game, entity) {
  game.missions.spawned.push(entity);
  return entity;
}

function cleanupSpawned(game) {
  const ms = game.missions;
  for (const e of ms.spawned) e.dead = true;
  game.vehicles = game.vehicles.filter((v) => !v.dead);
  game.pedestrians = game.pedestrians.filter((p) => !p.dead);
  ms.spawned = [];
}

// --- The six jobs ----------------------------------------------------------

function buildMissionList(game) {
  const P = PLACES;
  return [
    {
      id: 'first-wheels',
      title: 'First Wheels',
      start: P.garage,
      reward: 250,
      intro: [
        ['Marisol Vega', 'Nico. You drive, I hear. Prove it.'],
        ['Marisol Vega', 'A teal Cóndor Coupe sits by Marina Azul. Bring it to my garage.'],
      ],
      outro: [['Marisol Vega', 'Clean work. There may be a future for you in Bahia Verde.']],
      build(g) {
        const car = track(g, makeVehicle('coupe', 462, 2466, 0.35, { color: '#12b5a5', driver: 'parked' }));
        g.vehicles.push(car);
        return [
          { type: 'goto', x: car.x, y: car.y, r: 90, text: 'Go to the teal Cóndor Coupe at Marina Azul' },
          { type: 'steal', vehicle: car, text: 'Steal the Cóndor Coupe' },
          { type: 'deliver', vehicle: car, x: P.garage.x, y: P.garage.y, r: 62, text: 'Deliver the coupe to Vega Auto' },
        ];
      },
    },
    {
      id: 'marina-run',
      title: 'Marina Run',
      start: P.garage,
      reward: 400,
      intro: [
        ['Marisol Vega', 'A crate waits on the marina dock. No questions, no opening it.'],
        ['Marisol Vega', 'The Hotel Coral concierge expects it. The clock is not your friend.'],
      ],
      outro: [['Marisol Vega', 'On time and unopened. The Coral pays well for discretion.']],
      build() {
        return [
          { type: 'pickup', x: P.marina.x, y: P.marina.y, r: 34, text: 'Pick up the sealed crate at Marina Azul' },
          { type: 'timerGoto', x: P.hotel.x, y: P.hotel.y, r: 62, seconds: 150, text: 'Deliver the crate to Hotel Coral' },
        ];
      },
    },
    {
      id: 'hot-van',
      title: 'Hot Van',
      start: P.warehouse,
      reward: 600,
      intro: [
        ['Marisol Vega', 'The Carga Van at Almacén Sur is loaded with... merchandise.'],
        ['Marisol Vega', 'Every patrol in the city has its description. Lose them, then reach Taller Fénix.'],
      ],
      outro: [['Marisol Vega', 'The Fénix boys will make that van disappear. So will the paperwork.']],
      build(g) {
        const van = track(g, makeVehicle('van', P.warehouse.x - 60, P.warehouse.y + 96, Math.PI, { color: '#dfe6e9', driver: 'parked' }));
        g.vehicles.push(van);
        return [
          { type: 'steal', vehicle: van, text: 'Take the loaded Carga Van' },
          {
            type: 'loseThenDeliver', vehicle: van, x: P.chopShop.x, y: P.chopShop.y, r: 64,
            textHot: 'Lose the BVPD — the van is too hot to deliver',
            textCool: 'Deliver the van to Taller Fénix',
            onStart(g2) { setWantedLock(g2, 2); g2.reportCrime('policeHit', van.x, van.y); },
          },
        ];
      },
    },
    {
      id: 'collections',
      title: 'Collections',
      start: P.market,
      reward: 800,
      intro: [
        ['Marisol Vega', 'Three men owe the family. Rico, Duarte, Salas. Collect.'],
        ['Marisol Vega', 'They will not want to pay. Persuade them.'],
      ],
      outro: [['Marisol Vega', 'Every cent. You have a talent for difficult conversations.']],
      build(g) {
        const sites = [
          { name: 'Rico', x: P.plaza.x + 30, y: P.plaza.y + 40, cash: 150 },
          { name: 'Duarte', x: 2540, y: 2470, cash: 220 },
          { name: 'Salas', x: 620, y: 1700, cash: 280 },
        ];
        const steps = [];
        for (const [i, site] of sites.entries()) {
          const thugs = [];
          for (let k = 0; k < 2; k++) {
            const ped = track(g, makePedestrian(g.rng, site.x + (k === 0 ? 0 : 26), site.y + (k === 0 ? 0 : 14), {
              hostile: true, health: 46, name: k === 0 ? site.name : null, missionTag: 'collections',
            }));
            ped.state = 'walk';
            ped.stayPut = true; // debtors wait at their spot, they do not wander off
            ped.target = { x: site.x, y: site.y };
            g.pedestrians.push(ped);
            thugs.push(ped);
          }
          steps.push({ type: 'goto', x: site.x, y: site.y, r: 130, text: `Find ${site.name} — he owes the family` });
          steps.push({
            type: 'fight', peds: thugs, cash: site.cash,
            text: `Collect what ${site.name} owes`,
            onStart(g2) {
              for (const ped of thugs) if (ped.state !== 'down') ped.state = 'hostile';
              g2.say(site.name, 'Tell Marisol the money is... spent. Boys!');
            },
            onComplete(g2) {
              g2.player.cash += site.cash;
              sfx.cash();
              if (i === 0 && !g2.player.hasPistol) {
                givePistol(g2, 3);
                g2.say('Marisol Vega', 'Rico dropped his pistol. Keep it. You will need it.');
              }
            },
          });
        }
        return steps;
      },
    },
    {
      id: 'checkpoint-run',
      title: 'Checkpoint Run',
      start: P.garage,
      reward: 1000,
      intro: [
        ['Marisol Vega', 'One last audition, Nico. Six checkpoints, one clock, whole city.'],
        ['Marisol Vega', 'Any car you like. I suggest a fast one that is not yours.'],
      ],
      outro: [['Marisol Vega', 'Fastest wheel in Bahia Verde. Now — the real job.']],
      build() {
        const points = [
          { x: 940, y: 300 }, { x: 2220, y: 860 }, { x: 3500, y: 1420 },
          { x: 2860, y: 1980 }, { x: 940, y: 1980 }, { x: 300, y: 860 },
        ];
        return [{ type: 'checkpoints', points, seconds: 175, text: 'Hit every checkpoint before the clock dies' }];
      },
    },
    {
      id: 'sunset-score',
      title: 'The Sunset Score',
      start: P.hotel,
      reward: 3000,
      intro: [
        ['Marisol Vega', 'A Blindado cash truck crosses Bahia Verde at sunset, full of resort money.'],
        ['Marisol Vega', 'Stop it. Take the bag. Then disappear at the beach hideout. Retire, almost.'],
      ],
      outro: [
        ['Marisol Vega', 'It is done. The truck, the money, the legend.'],
        ['Marisol Vega', 'Bahia Verde is yours now, Nico. Try not to spend it all on bail.'],
      ],
      build(g) {
        const node = g.city.nodes[7];
        const next = node.neighbors[0];
        const truck = track(g, makeVehicle('truck', node.x, node.y, Math.atan2(next.y - node.y, next.x - node.x), {
          color: '#5d6d7e', driver: 'traffic', from: node, to: next, health: 300, maxSpeed: 148,
        }));
        g.vehicles.push(truck);
        return [
          {
            type: 'intercept', vehicle: truck,
            text: 'Stop the Blindado cash truck — ram it or shoot it out',
            doneWhen: (g2) => truck.health <= 165 || truck.dead,
            onUpdate: () => {
              // Wounded, the truck limps: easier to finish, still running.
              if (truck.health < 210) truck.maxSpeed = 88;
            },
            pos: () => ({ x: truck.x, y: truck.y }),
          },
          {
            type: 'pickup', dynamic: () => ({ x: truck.x, y: truck.y }), r: 40,
            text: 'Grab the money bag from the truck',
            onComplete(g2) {
              g2.player.cash += 1500;
              setWantedLock(g2, 4);
              g2.reportCrime('policeHit', truck.x, truck.y);
              sfx.cash();
            },
          },
          {
            type: 'layLow', x: P.hideout.x, y: P.hideout.y, r: 74,
            textHot: 'Get to the beach hideout, west end of the sand',
            textCool: 'Lie low at the hideout until the heat dies',
          },
        ];
      },
    },
  ];
}

// --- Engine -----------------------------------------------------------------

export function missionStartMarker(game) {
  const ms = game.missions;
  if (ms.phase !== 'offer' || ms.storyComplete) return null;
  const m = ms.list[ms.index];
  return { x: m.start.x, y: m.start.y, label: m.title };
}

export function currentStep(game) {
  const ms = game.missions;
  if (ms.phase !== 'active') return null;
  return ms.steps[ms.stepIdx] ?? null;
}

export function stepTarget(game, step) {
  if (!step) return null;
  if (step.pos) return step.pos(game);
  if (step.dynamic) return step.dynamic(game);
  if (step.type === 'steal' || step.type === 'intercept') return { x: step.vehicle.x, y: step.vehicle.y };
  if (step.type === 'checkpoints') {
    const pt = step.points[game.missions.checkpointIdx];
    return pt ? { x: pt.x, y: pt.y } : null;
  }
  if (step.type === 'fight') {
    const alive = step.peds.find((p) => p.state !== 'down');
    return alive ? { x: alive.x, y: alive.y } : null;
  }
  return { x: step.x, y: step.y };
}

export function objectiveText(game) {
  const ms = game.missions;
  if (ms.storyComplete) return 'Story complete — Bahia Verde is yours. Free roam.';
  if (ms.phase === 'offer') {
    const m = ms.list[ms.index];
    return m ? `Go to the ◆ to start “${m.title}”` : '';
  }
  const step = currentStep(game);
  if (!step) return '';
  if (step.type === 'loseThenDeliver') {
    // "Lose them" means nobody in uniform is close enough to watch
    // the van roll in — the stars alone do not tell that story while
    // a mission holds a floor under them.
    const watched = game.vehicles.some((v) => v.driver === 'police' && Math.hypot(v.x - game.player.x, v.y - game.player.y) < 360)
      || game.officers.some((o) => Math.hypot(o.x - game.player.x, o.y - game.player.y) < 360);
    const atShop = game.player.inCar === step.vehicle
      && Math.hypot(game.player.x - step.x, game.player.y - step.y) < step.r;
    return atShop && !watched ? step.textCool : step.textHot;
  }
  if (step.type === 'layLow') {
    const atHideout = Math.hypot(game.player.x - step.x, game.player.y - step.y) < step.r;
    return atHideout || game.wanted.stars === 0 ? step.textCool : step.textHot;
  }
  if (step.type === 'checkpoints') {
    return `${step.text} (${game.missions.checkpointIdx}/${step.points.length})`;
  }
  return step.text;
}

function startStep(game, step) {
  const ms = game.missions;
  if (step.type === 'timerGoto' || step.type === 'checkpoints') ms.timer = step.seconds;
  if (step.type === 'checkpoints') ms.checkpointIdx = 0;
  step.onStart?.(game);
}

function beginMission(game) {
  const ms = game.missions;
  const m = ms.list[ms.index];
  ms.current = m;
  ms.steps = m.build(game);
  ms.stepIdx = 0;
  ms.phase = 'active';
  for (const [speaker, line] of m.intro) game.say(speaker, line);
  sfx.missionStart();
  startStep(game, ms.steps[0]);
}

function completeMission(game) {
  const ms = game.missions;
  const m = ms.current;
  game.player.cash += m.reward;
  sfx.missionDone();
  for (const [speaker, line] of m.outro) game.say(speaker, line);
  game.notify(`Mission complete: ${m.title} — $${m.reward}`, 4);
  cleanupSpawned(game);
  ms.offerArmed = false; // the next job waits until Nico steps away and returns
  if (game.wanted.lockMin > 0 && m.id !== 'sunset-score') setWantedLock(game, 0);
  ms.index += 1;
  ms.current = null;
  ms.steps = [];
  if (ms.index >= ms.list.length) {
    ms.phase = 'done';
    ms.storyComplete = true;
    game.say('Marisol Vega', 'Bahia Verde is yours now, Nico.');
  } else {
    ms.phase = 'offer';
  }
  game.saveGame();
}

export function failMission(game, why) {
  const ms = game.missions;
  if (ms.phase !== 'active') return;
  game.notify(`Mission failed: ${why}`, 3.5);
  cleanupSpawned(game);
  setWantedLock(game, 0);
  ms.current = null;
  ms.steps = [];
  ms.phase = 'offer';
}

function advanceStep(game) {
  const ms = game.missions;
  const step = currentStep(game);
  step?.onComplete?.(game);
  ms.stepIdx += 1;
  if (ms.stepIdx >= ms.steps.length) completeMission(game);
  else startStep(game, ms.steps[ms.stepIdx]);
}

export function updateMissions(game, dt) {
  const ms = game.missions;
  const p = game.player;
  if (ms.phase === 'offer') {
    const marker = missionStartMarker(game);
    if (marker) {
      const dist = Math.hypot(p.x - marker.x, p.y - marker.y);
      if (dist > 95) ms.offerArmed = true;
      else if (ms.offerArmed && dist < 44) beginMission(game);
    }
    return;
  }
  if (ms.phase !== 'active') return;
  const step = currentStep(game);
  if (!step) return;
  step.onUpdate?.(game, dt);

  // Mission timers.
  if (step.type === 'timerGoto' || step.type === 'checkpoints') {
    ms.timer -= dt;
    if (ms.timer <= 0) {
      failMission(game, 'out of time');
      return;
    }
  }

  const distTo = (x, y) => Math.hypot(p.x - x, p.y - y);
  switch (step.type) {
    case 'goto':
      if (distTo(step.x, step.y) < step.r) advanceStep(game);
      break;
    case 'pickup': {
      const at = step.dynamic ? step.dynamic(game) : step;
      if (!p.inCar && distTo(at.x, at.y) < step.r) {
        sfx.pickup();
        advanceStep(game);
      }
      break;
    }
    case 'steal':
      if (p.inCar === step.vehicle) advanceStep(game);
      break;
    case 'deliver':
      if (p.inCar === step.vehicle && distTo(step.x, step.y) < step.r) advanceStep(game);
      else if (step.vehicle.dead || step.vehicle.health <= 0) failMission(game, 'the delivery vehicle was wrecked');
      break;
    case 'timerGoto':
      if (distTo(step.x, step.y) < step.r) advanceStep(game);
      break;
    case 'loseThenDeliver': {
      if (step.vehicle.dead || step.vehicle.health <= 0) {
        failMission(game, 'the van was wrecked');
      } else if (p.inCar === step.vehicle && distTo(step.x, step.y) < step.r) {
        // Roll in only once no unit is close enough to watch it
        // happen; the Fénix boys handle the rest, heat included.
        const watched = game.vehicles.some((v) => v.driver === 'police' && Math.hypot(v.x - p.x, v.y - p.y) < 360)
          || game.officers.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < 360);
        if (!watched) {
          setWantedLock(game, 0);
          clearWanted(game);
          advanceStep(game);
        }
      }
      break;
    }
    case 'fight':
      if (step.peds.every((ped) => ped.state === 'down')) advanceStep(game);
      break;
    case 'checkpoints': {
      const pt = step.points[ms.checkpointIdx];
      if (pt && distTo(pt.x, pt.y) < 52) {
        ms.checkpointIdx += 1;
        sfx.pickup();
        game.notify(`Checkpoint ${ms.checkpointIdx}/${step.points.length}`, 1.4);
        if (ms.checkpointIdx >= step.points.length) advanceStep(game);
      }
      break;
    }
    case 'intercept':
      if (step.doneWhen(game)) {
        step.vehicle.speed = 0;
        step.vehicle.driver = 'parked';
        advanceStep(game);
      }
      break;
    case 'layLow': {
      const atHideout = distTo(step.x, step.y) < step.r;
      if (atHideout) {
        // Reaching the hideout breaks the scripted manhunt; from here
        // it is ordinary heat, bleeding away fast while Nico lies low.
        if (!step.released) {
          step.released = true;
          setWantedLock(game, 0);
        }
        game.wanted.heat = Math.max(0, game.wanted.heat - 9 * dt);
        if (game.wanted.stars === 0) advanceStep(game);
      }
      break;
    }
    default:
      break;
  }
}
