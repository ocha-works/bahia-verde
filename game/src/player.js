// player.js — Nico Ferrer, the player's character: walking and
// sprinting on foot, slipping into (and stealing) cars, driving them,
// fighting with fists or the pistol, and taking damage. The player
// object is also the thing the camera, the bust meter and the save
// file all revolve around.

import { PLAYER, WORLD } from './config.js';
import { keys, pressed, moveAxis, mouse } from './input.js';
import { collideBuildings, clampToWorld, groundAt } from './city.js';
import { driveCar } from './vehicles.js';
import { WEAPONS, fireBullet, meleeSwing } from './combat.js';
import { sfx, setEngine } from './audio.js';

export function createPlayer(start) {
  return {
    x: start.x,
    y: start.y,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    radius: PLAYER.radius,
    health: PLAYER.maxHealth,
    cash: 120,
    inCar: null,
    weapon: 'fists',
    hasPistol: false,
    ammo: 0,
    reserveAmmo: 0,
    attackCd: 0,
    reloadLeft: 0,
    bustMeter: 0,
    lastDamageAt: -99,
    stepCycle: 0,
    speedNow: 0,
  };
}

export function damagePlayer(game, amount) {
  const p = game.player;
  if (game.state !== 'playing') return;
  p.health -= amount;
  p.lastDamageAt = game.time;
  sfx.hurt();
  game.spawnParticles(p.x, p.y - 6, { count: 5, color: '#ff8fa3', speed: 90, life: 0.3, size: 2.6 });
  if (p.health <= 0) {
    p.health = 0;
    game.onWasted();
  }
}

function nearestEnterableCar(game) {
  const p = game.player;
  let best = null;
  let bestD = Infinity;
  for (const car of game.vehicles) {
    if (car.dead) continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y) - car.radius;
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return bestD < 30 ? best : null;
}

export function enterCar(game, car) {
  const p = game.player;
  p.inCar = car;
  car.driver = 'player';
  car.speed = Math.max(0, car.speed);
  sfx.door();
  // Taking a car that is not yours is the city's signature crime:
  // it only counts if somebody sees it happen.
  game.reportCrime('carTheft', car.x, car.y);
  game.notify('You are driving the ' + (car.kind === 'police' ? 'BVPD Interceptor' : carLabel(car)), 2.2);
}

export function exitCar(game) {
  const p = game.player;
  const car = p.inCar;
  if (!car) return;
  // Step out on the left side of the car.
  const side = car.angle - Math.PI / 2;
  p.x = car.x + Math.cos(side) * (car.wid / 2 + 16);
  p.y = car.y + Math.sin(side) * (car.wid / 2 + 16);
  const pos = { x: p.x, y: p.y };
  collideBuildings(game.city, pos, p.radius);
  p.x = pos.x;
  p.y = pos.y;
  car.driver = 'parked';
  car.speed = 0;
  p.inCar = null;
  sfx.door();
  setEngine(0, false);
}

export function carLabel(car) {
  return { coupe: 'Cóndor Coupe', sedan: 'Meridian Sedan', hatch: 'Pico Hatch', van: 'Carga Van', truck: 'Blindado Cash Truck', police: 'BVPD Interceptor' }[car.kind] ?? 'car';
}

export function updatePlayer(game, dt) {
  const p = game.player;
  p.attackCd = Math.max(0, p.attackCd - dt);
  if (p.reloadLeft > 0) {
    p.reloadLeft -= dt;
    if (p.reloadLeft <= 0) finishReload(game);
  }

  if (p.inCar) {
    updateDriving(game, dt);
  } else {
    updateOnFoot(game, dt);
  }

  // Slow recovery once the shooting stops and the heat is off.
  if (game.wanted.stars === 0 && game.time - p.lastDamageAt > 6 && p.health > 0) {
    p.health = Math.min(PLAYER.maxHealth, p.health + 2.2 * dt);
  }
  p.speedNow = p.inCar ? Math.abs(p.inCar.speed) : Math.hypot(p.vx, p.vy);
}

function updateDriving(game, dt) {
  const p = game.player;
  const car = p.inCar;
  let throttle = 0;
  let steer = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) throttle = 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) throttle = -1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) steer = -1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) steer = 1;
  if (game.autopilot) {
    const drive = game.autopilot(game, car, dt);
    throttle = drive.throttle;
    steer = drive.steer;
  }
  const ground = groundAt(car.x, car.y);
  const ratio = driveCar(car, throttle, steer, dt, ground === 'sand' ? 'sand' : 'road');
  // A handbrake kills speed fast and lets the tail swing.
  if (keys.has('Space')) {
    car.speed -= car.speed * 2.6 * dt;
    car.angle += steer * 1.4 * dt * Math.min(1, Math.abs(car.speed) / 140);
  }
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  setEngine(ratio, true);

  if (pressed.has('KeyE') || pressed.has('KeyF')) {
    exitCar(game);
  }
}

function updateOnFoot(game, dt) {
  const p = game.player;
  const axis = moveAxis();
  const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const topSpeed = sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  let tx = 0;
  let ty = 0;
  if (game.autopilot) {
    const move = game.autopilot(game, p, dt);
    tx = move.x;
    ty = move.y;
  } else if (axis.x !== 0 || axis.y !== 0) {
    const len = Math.hypot(axis.x, axis.y);
    tx = (axis.x / len) * topSpeed;
    ty = (axis.y / len) * topSpeed;
  }
  const blend = Math.min(1, dt * 10);
  p.vx += (tx - p.vx) * blend;
  p.vy += (ty - p.vy) * blend;
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  const pos = { x: p.x, y: p.y };
  collideBuildings(game.city, pos, p.radius);
  p.x = pos.x;
  p.y = pos.y;
  clampToWorld(p, 24);
  if (p.y > WORLD.waterY - 14) p.y = WORLD.waterY - 14; // the bay is out of bounds on foot

  // Facing: the mouse when shooting, otherwise the way we walk.
  const moving = Math.hypot(p.vx, p.vy) > 12;
  if (mouse.down || p.weapon === 'pistol') {
    p.angle = Math.atan2(game.mouseWorld.y - p.y, game.mouseWorld.x - p.x);
  } else if (moving) {
    p.angle = Math.atan2(p.vy, p.vx);
  }
  if (moving) {
    p.stepCycle += dt * Math.hypot(p.vx, p.vy) / 26;
    if (Math.floor(p.stepCycle) !== Math.floor(p.stepCycle - dt * 4)) sfx.step();
  }

  // Cars are solid to a walker.
  for (const car of game.vehicles) {
    const dx = p.x - car.x;
    const dy = p.y - car.y;
    const d = Math.hypot(dx, dy);
    const min = car.radius + p.radius - 4;
    if (d > 0.01 && d < min) {
      p.x = car.x + (dx / d) * min;
      p.y = car.y + (dy / d) * min;
    }
  }

  if (pressed.has('KeyE') || pressed.has('KeyF')) {
    const car = nearestEnterableCar(game);
    if (car) {
      enterCar(game, car);
      return;
    }
  }

  // Weapon switching: 1 for fists, 2 for the pistol, Q swaps.
  if (pressed.has('Digit1')) p.weapon = 'fists';
  if (pressed.has('Digit2') && p.hasPistol) p.weapon = 'pistol';
  if (pressed.has('KeyQ') && p.hasPistol) p.weapon = p.weapon === 'fists' ? 'pistol' : 'fists';
  if (pressed.has('KeyR') && p.weapon === 'pistol') startReload(game);

  // Attacking: click or Space uses the current weapon.
  const wantsAttack = mouse.clicked || mouse.down || pressed.has('Space');
  if (wantsAttack && p.attackCd <= 0 && p.reloadLeft <= 0) {
    if (p.weapon === 'pistol' && p.hasPistol) {
      shootPistol(game);
    } else {
      p.attackCd = WEAPONS.fists.cooldown;
      if (meleeSwing(game, p, p.angle)) sfx.punch();
      else sfx.swing();
    }
  }
}

function shootPistol(game) {
  const p = game.player;
  if (p.ammo <= 0) {
    sfx.dryFire();
    p.attackCd = 0.25;
    startReload(game);
    return;
  }
  p.ammo -= 1;
  p.attackCd = WEAPONS.pistol.cooldown;
  const spread = game.rng.range(-0.03, 0.03);
  fireBullet(game, p.x, p.y, p.angle + spread, 'player');
  sfx.gunshot();
  game.threat = { x: p.x, y: p.y, age: 0 };
  game.reportCrime('gunshot', p.x, p.y);
  if (p.ammo === 0) startReload(game);
}

function startReload(game) {
  const p = game.player;
  if (p.reloadLeft > 0 || p.ammo >= WEAPONS.pistol.magSize || p.reserveAmmo <= 0) return;
  p.reloadLeft = WEAPONS.pistol.reloadTime;
  sfx.reload();
}

function finishReload(game) {
  const p = game.player;
  const need = WEAPONS.pistol.magSize - p.ammo;
  const take = Math.min(need, p.reserveAmmo);
  p.ammo += take;
  p.reserveAmmo -= take;
}

export function givePistol(game, mags = 3) {
  const p = game.player;
  p.hasPistol = true;
  p.weapon = 'pistol';
  p.ammo = WEAPONS.pistol.magSize;
  p.reserveAmmo += WEAPONS.pistol.magSize * mags;
  game.notify('You got the PISTOL — click or Space to shoot, R to reload, Q to swap', 4);
}
