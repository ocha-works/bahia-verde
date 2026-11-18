// main.js — Bahia Verde's bootstrap and heartbeat. It builds the city,
// wires every module into one `game` object, runs the fixed loop
// (player, traffic, police, missions, combat, collisions), maintains
// the ambient population, and owns the state machine: title, playing,
// paused, busted, wasted. It also stages the screenshot scenes when
// the page is opened with ?scene=<name>.

import { TRAFFIC } from './config.js';
import { CITY_SEED, makeRng } from './random.js';
import { buildCity, PLACES, collideBuildings } from './city.js';
import { attachInput, pressed, mouse, endFrameInput } from './input.js';
import { initAudio, resumeAudio, startMusic, toggleMute, sfx, setEngine, setSirenLevel } from './audio.js';
import { createPlayer, updatePlayer, damagePlayer, carLabel } from './player.js';
import { spawnTrafficCar, spawnParkedCar, updateTrafficCar } from './vehicles.js';
import { spawnPedestrianNear, updatePedestrian, hurtPedestrian } from './pedestrians.js';
import { createPolice, updatePolice, clearWanted } from './police.js';
import { createMissions, updateMissions, missionStartMarker, currentStep, stepTarget } from './missions.js';
import { updateBullets, updateParticles, spawnParticles } from './combat.js';
import { createCamera, updateCamera, drawGame } from './render.js';
import { saveGame, loadSave, clearSave } from './save.js';
import { setupScene } from './scenes.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

const params = new URLSearchParams(location.search);
const sceneName = params.get('scene');
const seed = Number(params.get('seed')) || CITY_SEED;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
}
window.addEventListener('resize', resize);
resize();
attachInput(canvas);

// --- The game object --------------------------------------------------------

const city = buildCity(CITY_SEED);
const game = {
  city,
  rng: makeRng(seed ^ 0x9e3779b9),
  time: 0,
  state: sceneName ? 'playing' : 'title',
  vehicles: [],
  pedestrians: [],
  officers: [],
  bullets: [],
  particles: [],
  dialogue: [],
  message: null,
  promptText: '',
  threat: null,
  camera: createCamera(),
  mouseWorld: { x: 0, y: 0 },
  mouseWorldOverride: null,
  autopilot: null,
  stepTargetPos: null,
  hasSave: false,
  crashSfxCd: 0,
  policeHitCd: 0,
  trafficSpawnCd: 0,
  healCd: 0,
};

game.player = createPlayer({ x: PLACES.garage.x, y: PLACES.garage.y + 64 });
createPolice(game);
createMissions(game);
game.saveGame = () => saveGame(game);
game.damagePlayer = (amount) => damagePlayer(game, amount);
game.spawnParticles = (x, y, opts) => spawnParticles(game, x, y, opts);
game.spawnHitSpark = (x, y, color) => spawnParticles(game, x, y, { count: 5, color, speed: 110, life: 0.28, size: 2.6 });
game.notify = (text, ttl = 3) => {
  game.message = { text, ttl };
};
game.say = (speaker, text) => {
  game.dialogue.push({ speaker, text, ttl: 4.4 });
};
game.onPedDown = () => {};
game.onBusted = () => {
  game.state = 'busted';
  sfx.busted();
  setEngine(0, false);
  setSirenLevel(0);
};
game.onWasted = () => {
  game.state = 'wasted';
  setEngine(0, false);
  setSirenLevel(0);
};

const saveData = sceneName ? null : loadSave();
game.hasSave = !!saveData;

// --- Ambient population -------------------------------------------------------

function seedPopulation() {
  for (let i = 0; i < 14; i++) {
    const car = spawnTrafficCar(game, game.rng);
    if (car) game.vehicles.push(car);
  }
  for (let i = 0; i < 16; i++) {
    const parked = spawnParkedCar(game.city, game.rng);
    if (parked) game.vehicles.push(parked);
  }
  for (let i = 0; i < 13; i++) {
    const ped = spawnPedestrianNear(game, game.rng);
    if (ped) game.pedestrians.push(ped);
  }
}

function maintainPopulation(dt) {
  const p = game.player;
  const spawned = game.missions.spawned;
  // Traffic: retire the far, replace the retired.
  let trafficCount = 0;
  for (const car of game.vehicles) {
    if (car.driver !== 'traffic' || spawned.includes(car)) continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d > 1250) car.dead = true;
    else trafficCount++;
  }
  game.trafficSpawnCd -= dt;
  if (trafficCount < TRAFFIC.maxCars && game.trafficSpawnCd <= 0) {
    game.trafficSpawnCd = 0.5;
    const car = spawnTrafficCar(game, game.rng);
    if (car) game.vehicles.push(car);
  }
  // Parked cars top up slowly.
  const parkedCount = game.vehicles.filter((v) => v.driver === 'parked' && !spawned.includes(v)).length;
  if (parkedCount < 10 && game.rng.chance(dt * 0.5)) {
    const parked = spawnParkedCar(game.city, game.rng);
    if (parked && Math.hypot(parked.x - p.x, parked.y - p.y) > 480) game.vehicles.push(parked);
  }
  // Pedestrians likewise.
  let pedCount = 0;
  for (const ped of game.pedestrians) {
    if (spawned.includes(ped)) continue;
    const d = Math.hypot(ped.x - p.x, ped.y - p.y);
    if (d > 1100) ped.dead = true;
    else pedCount++;
  }
  if (pedCount < 15 && game.rng.chance(dt * 2.2)) {
    const ped = spawnPedestrianNear(game, game.rng);
    if (ped) game.pedestrians.push(ped);
  }
  // Wrecks are towed once they are far behind.
  for (const car of game.vehicles) {
    if (car.health <= 0 && !spawned.includes(car) && Math.hypot(car.x - p.x, car.y - p.y) > 1350) car.dead = true;
  }
}

// --- Collisions ---------------------------------------------------------------

function collideVehiclesWithBuildings() {
  for (const car of game.vehicles) {
    const pos = { x: car.x, y: car.y };
    const speedBefore = Math.abs(car.speed);
    if (collideBuildings(game.city, pos, car.radius * 0.78)) {
      car.x = pos.x;
      car.y = pos.y;
      if (speedBefore > 120) {
        car.health -= (speedBefore - 110) * 0.1;
        game.spawnParticles(car.x, car.y, { count: 8, color: '#d9d9d9', speed: 130, life: 0.4, size: 3 });
        if (Math.hypot(car.x - game.player.x, car.y - game.player.y) < 520 && game.crashSfxCd <= 0) {
          sfx.crash();
          game.crashSfxCd = 0.3;
        }
        if (car === game.player.inCar) game.damagePlayer((speedBefore - 120) * 0.03);
      }
      car.speed *= speedBefore > 60 ? -0.16 : 0.2;
    }
  }
}

function collideCarPairs() {
  const vs = game.vehicles;
  for (let i = 0; i < vs.length; i++) {
    for (let j = i + 1; j < vs.length; j++) {
      const a = vs[i];
      const b = vs[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = (a.radius + b.radius) * 0.82;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const closing = Math.abs(a.speed) + Math.abs(b.speed);
      if (closing > 55) {
        const dmg = (closing - 45) * 0.07;
        a.health -= dmg;
        b.health -= dmg;
        game.spawnParticles((a.x + b.x) / 2, (a.y + b.y) / 2, { count: 7, color: '#ffe9a8', speed: 120, life: 0.3, size: 2.6 });
        if (game.crashSfxCd <= 0) {
          sfx.crash();
          game.crashSfxCd = 0.25;
        }
        const playerInvolved = a === game.player.inCar || b === game.player.inCar;
        const policeInvolved = a.driver === 'police' || b.driver === 'police';
        if (playerInvolved && policeInvolved && game.policeHitCd <= 0) {
          game.reportCrime('policeHit', game.player.x, game.player.y);
          game.policeHitCd = 1.4;
        }
        if (playerInvolved) game.damagePlayer((closing - 60) * 0.04);
      }
      a.speed *= 0.55;
      b.speed *= 0.55;
    }
  }
}

function collideCarsWithPeople() {
  for (const car of game.vehicles) {
    if (Math.abs(car.speed) < 34) continue;
    for (const ped of game.pedestrians) {
      if (ped.state === 'down') continue;
      if (Math.hypot(ped.x - car.x, ped.y - car.y) < car.radius + 9) {
        const dmg = Math.min(64, Math.abs(car.speed) * 0.36);
        ped.x += Math.cos(car.angle) * 16;
        ped.y += Math.sin(car.angle) * 16;
        hurtPedestrian(game, ped, dmg, car.angle);
        if (car.driver === 'player') {
          game.reportCrime(ped.state === 'down' ? 'pedKilled' : 'assault', ped.x, ped.y);
        }
        sfx.thud();
        car.speed *= 0.9;
      }
    }
    for (const officer of game.officers) {
      if (Math.hypot(officer.x - car.x, officer.y - car.y) < car.radius + 9) {
        game.hurtOfficer(officer, Math.min(70, Math.abs(car.speed) * 0.4));
        if (car.driver === 'player') game.reportCrime('policeHit', officer.x, officer.y);
        sfx.thud();
        car.speed *= 0.88;
      }
    }
  }
}

// --- Flow: start, respawn -----------------------------------------------------

function applySave(data) {
  const p = game.player;
  const ms = game.missions;
  ms.index = Math.min(data.missionsIndex ?? 0, ms.list.length);
  ms.storyComplete = !!data.storyComplete;
  ms.phase = ms.storyComplete || ms.index >= ms.list.length ? 'done' : 'offer';
  if (ms.phase === 'done') ms.storyComplete = true;
  p.cash = data.cash ?? p.cash;
  if (data.hasPistol) {
    p.hasPistol = true;
    p.ammo = 12;
    p.reserveAmmo = data.reserveAmmo ?? 24;
  }
  if (data.x && data.y) {
    p.x = data.x;
    p.y = data.y;
  }
}

function startGame(continueSave) {
  initAudio();
  resumeAudio();
  startMusic();
  if (continueSave && saveData) applySave(saveData);
  game.state = 'playing';
  updateCamera(game.camera, game.player, canvas.width, canvas.height, 1, true);
}

function respawn(atPlace, feeRate) {
  const p = game.player;
  const fee = Math.max(25, Math.round(p.cash * feeRate));
  p.cash = Math.max(0, p.cash - fee);
  if (p.inCar) {
    p.inCar.driver = 'parked';
    p.inCar = null;
  }
  for (const car of game.vehicles) if (car.driver === 'police') car.dead = true;
  game.officers = [];
  game.bullets = [];
  clearWanted(game);
  p.health = 100;
  p.bustMeter = 0;
  p.x = atPlace.x;
  p.y = atPlace.y;
  setEngine(0, false);
  game.state = 'playing';
  game.notify(fee > 0 ? `The city takes its cut: $${fee}` : 'Back on the street', 3);
  game.saveGame();
}

// --- The loop -------------------------------------------------------------------

function stepWorld(dt) {
  game.time += dt;
  game.crashSfxCd = Math.max(0, game.crashSfxCd - dt);
  game.policeHitCd = Math.max(0, game.policeHitCd - dt);
  if (game.threat) {
    game.threat.age += dt;
    if (game.threat.age > 6) game.threat = null;
  }
  if (game.message) {
    game.message.ttl -= dt;
    if (game.message.ttl <= 0) game.message = null;
  }
  if (game.dialogue.length) {
    game.dialogue[0].ttl -= dt;
    if (game.dialogue[0].ttl <= 0) game.dialogue.shift();
  }

  if (game.state === 'playing') {
    updatePlayer(game, dt);
    // The hospital's health pack: walk into it hurt, walk out whole.
    game.healCd = Math.max(0, game.healCd - dt);
    const p = game.player;
    if (!p.inCar && p.health < 100 && game.healCd <= 0
      && Math.hypot(p.x - PLACES.hospital.x, p.y - (PLACES.hospital.y + 36)) < 30) {
      p.health = 100;
      game.healCd = 20;
      sfx.pickup();
      game.notify('Patched up at Hospital San Sol', 2.4);
    }
    for (const car of game.vehicles) {
      if (car.driver === 'traffic') updateTrafficCar(game, car, dt);
    }
    updatePolice(game, dt);
    for (const ped of game.pedestrians) updatePedestrian(game, ped, dt);
    updateMissions(game, dt);
    updateBullets(game, dt);
    collideVehiclesWithBuildings();
    collideCarPairs();
    collideCarsWithPeople();
    maintainPopulation(dt);
  } else if (game.state === 'title') {
    // The city lives behind the title: traffic rolls, people stroll.
    for (const car of game.vehicles) {
      if (car.driver === 'traffic') updateTrafficCar(game, car, dt);
    }
    for (const ped of game.pedestrians) updatePedestrian(game, ped, dt);
    const drift = {
      x: 1900 + Math.sin(game.time * 0.05) * 620,
      y: 1250 + Math.cos(game.time * 0.037) * 420,
    };
    updateCamera(game.camera, drift, canvas.width, canvas.height, dt);
  }

  updateParticles(game, dt);
  game.vehicles = game.vehicles.filter((v) => !v.dead);
  game.pedestrians = game.pedestrians.filter((p) => !p.dead);

  // Where the HUD and minimap should point.
  const step = currentStep(game);
  game.stepTargetPos = step ? stepTarget(game, step) : missionStartMarker(game);

  // The context prompt.
  game.promptText = '';
  if (game.state === 'playing' && !game.player.inCar) {
    for (const car of game.vehicles) {
      if (Math.hypot(car.x - game.player.x, car.y - game.player.y) - car.radius < 30) {
        game.promptText = `Press E — take the ${carLabel(car)}`;
        break;
      }
    }
  } else if (game.state === 'playing' && game.player.inCar && Math.abs(game.player.inCar.speed) < 30) {
    game.promptText = 'Press E — get out';
  }

  if (game.state === 'playing') {
    updateCamera(game.camera, game.player.inCar ?? game.player, canvas.width, canvas.height, dt);
  }
  game.mouseWorld = game.mouseWorldOverride ?? {
    x: game.camera.x + mouse.x,
    y: game.camera.y + mouse.y,
  };
}

seedPopulation();
if (sceneName) {
  setupScene(game, sceneName);
  updateCamera(game.camera, game.player, canvas.width, canvas.height, 1, true);
  // Warm the simulation up so the staged scene is mid-motion. A scene
  // may ask for a shorter warm-up (the chase is only a chase briefly).
  const warmup = game.warmupSteps ?? 110;
  for (let i = 0; i < warmup; i++) stepWorld(1 / 30);
  game.time = 8; // settle the light phase and pulses somewhere photogenic
}

let last = performance.now();
let frames = 0;
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
  last = now;

  if (game.state === 'title') {
    if (pressed.has('Enter')) startGame(true);
    else if (pressed.has('KeyN')) {
      clearSave();
      game.hasSave = false;
      startGame(false);
    }
  } else if (game.state === 'busted' || game.state === 'wasted') {
    if (pressed.has('Enter')) {
      if (game.state === 'busted') respawn(PLACES.policeStation, 0.12);
      else respawn(PLACES.hospital, 0.1);
    }
  } else if (game.state === 'playing' || game.state === 'paused') {
    if (pressed.has('KeyP') || pressed.has('Escape')) {
      game.state = game.state === 'playing' ? 'paused' : 'playing';
    }
    if (pressed.has('KeyM')) {
      const muted = toggleMute();
      game.notify(muted ? 'Sound off' : 'Sound on', 1.4);
    }
  }

  if (game.state !== 'paused') stepWorld(dt);
  drawGame(ctx, game, canvas.width, canvas.height);
  endFrameInput();

  frames++;
  if (sceneName && frames === 6) {
    window.__bvReady = true;
    const errors = window.__bvErrors ?? [];
    statusEl.textContent = `bv scene=${sceneName} ready errors=${errors.length}${errors.length ? ' first=' + errors[0] : ''}`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
