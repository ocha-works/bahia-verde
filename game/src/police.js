// police.js — the Bahia Verde PD: the wanted-heat model, the
// Interceptors that hunt the player across the road graph, and the
// officers who pile out and shoot once the stars climb. Crimes are
// reported through game.reportCrime, which this module installs:
// a theft nobody sees never happened, but gunfire carries.

import { HEAT, POLICE, PLAYER } from './config.js';
import { makeVehicle, driveCar, steerToward } from './vehicles.js';
import { roadPointNear, nodeNearest, collideBuildings, clampToWorld, PLACES } from './city.js';
import { fireBullet } from './combat.js';
import { sfx, setSirenLevel } from './audio.js';

export function createPolice(game) {
  game.wanted = { heat: 0, stars: 0, seen: false, lockMin: 0, spawnCd: 0 };
  game.officers = [];

  game.reportCrime = (kind, x, y) => {
    const w = game.wanted;
    const policeNear = game.vehicles.some((v) => v.driver === 'police' && Math.hypot(v.x - x, v.y - y) < 540)
      || game.officers.some((o) => Math.hypot(o.x - x, o.y - y) < 540);
    const pedNear = game.pedestrians.some((p) => p.state !== 'down' && Math.hypot(p.x - x, p.y - y) < 260);
    let amount = HEAT[kind] ?? 0;
    if (kind === 'carTheft' && !policeNear && !pedNear) return; // unseen, unreported
    if (kind === 'gunshot' && !policeNear && !pedNear) amount *= 0.4;
    if ((kind === 'assault' || kind === 'pedKilled') && !policeNear && !pedNear) amount *= 0.5;
    if (amount <= 0) return;
    w.heat = Math.min(HEAT.max, w.heat + amount);
    recalcStars(game);
    if (kind === 'assault' || kind === 'gunshot' || kind === 'pedKilled') {
      game.threat = { x, y, age: 0 };
    }
  };

  game.hurtOfficer = (officer, damage) => {
    officer.health -= damage;
    game.spawnHitSpark(officer.x, officer.y, '#ffd166');
    if (officer.health <= 0 && !officer.dead) {
      officer.dead = true;
      game.reportCrime('officerKilled', officer.x, officer.y);
      game.spawnParticles(officer.x, officer.y, { count: 10, color: '#20303e', speed: 80, life: 0.5, size: 3 });
    }
  };
}

function recalcStars(game) {
  const w = game.wanted;
  const byHeat = Math.ceil(w.heat / HEAT.perStar);
  w.stars = Math.max(w.lockMin, Math.min(5, byHeat));
  if (w.heat <= 0 && w.lockMin === 0) w.stars = 0;
}

export function setWantedLock(game, minStars) {
  game.wanted.lockMin = minStars;
  recalcStars(game);
}

export function clearWanted(game) {
  game.wanted.heat = 0;
  game.wanted.lockMin = 0;
  recalcStars(game);
}

function policeCars(game) {
  return game.vehicles.filter((v) => v.driver === 'police');
}

function spawnInterceptor(game) {
  const p = game.player;
  const spot = roadPointNear(game.city, game.rng, p.x, p.y, POLICE.spawnDistance - 60, POLICE.spawnDistance + 220);
  const angle = Math.atan2(spot.next.y - spot.node.y, spot.next.x - spot.node.x);
  const car = makeVehicle('police', spot.x, spot.y, angle, { color: '#20303e', driver: 'police' });
  car.officerDropped = 0;
  game.vehicles.push(car);
  return car;
}

function releaseCar(game, car) {
  // The chase is over: the unit rejoins ordinary traffic and drives off.
  const node = nodeNearest(game.city, car.x, car.y);
  car.from = node;
  car.to = game.rng.pick(node.neighbors);
  car.driver = 'traffic';
}

export function updatePolice(game, dt) {
  const w = game.wanted;
  const p = game.player;

  // Who can see the player right now? (Not through the hideout's
  // palmetto thicket: inside its radius the trail is cold.)
  const hiddenAtHideout = Math.hypot(p.x - PLACES.hideout.x, p.y - PLACES.hideout.y) < 95;
  w.seen = !hiddenAtHideout && (policeCars(game).some((c) => Math.hypot(c.x - p.x, c.y - p.y) < POLICE.sightRange)
    || game.officers.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < POLICE.sightRange));

  // Heat cools — slowly while watched, faster in hiding. A mission can
  // hold a floor under it (a scripted chase that must be outrun, not
  // waited out — the floor only lifts when the mission says so).
  const floor = w.lockMin > 0 ? (w.lockMin - 1) * HEAT.perStar + 0.5 : 0;
  const decay = w.seen ? HEAT.decaySeen : HEAT.decayHidden;
  w.heat = Math.max(floor, w.heat - decay * dt);
  recalcStars(game);

  // Fleet size follows the stars.
  const desired = [0, 1, 2, 3, 4, 5][w.stars];
  const cars = policeCars(game);
  w.spawnCd -= dt;
  if (cars.length < desired && w.spawnCd <= 0) {
    spawnInterceptor(game);
    w.spawnCd = 1.6;
  }
  for (const car of cars) {
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (w.stars === 0 && d > 260) releaseCar(game, car);
    else if (d > POLICE.despawnDistance && w.stars <= 2) {
      car.dead = true; // removed by the vehicle sweep in main
    }
  }

  // Drive the chase. The beach hideout is the one place the trail
  // goes cold: units hold on the coastal road and search, rather
  // than driving in — which is what makes lying low there possible.
  const atHideout = Math.hypot(p.x - PLACES.hideout.x, p.y - PLACES.hideout.y) < 95;
  for (const car of policeCars(game)) {
    const target = p.inCar ?? p;
    const lead = 0.35;
    let tx = target.x + (target.vx ?? Math.cos(target.angle) * (target.speed ?? 0)) * lead;
    let ty = target.y + (target.vy ?? Math.sin(target.angle) * (target.speed ?? 0)) * lead;
    if (atHideout) {
      tx = PLACES.hideout.x + 330;
      ty = 2330;
    }
    const diff = steerToward(car, tx, ty, dt, 3.1);
    const dist = Math.hypot(car.x - p.x, car.y - p.y);
    let throttle = diff > 1.15 ? 0.25 : 1;
    if (dist < 60 && p.speedNow < 14) throttle = 0.1; // sit on a stopped suspect
    const bonus = dist > 420 ? 26 : 0; // rubber-band so chases stay chases
    const savedMax = car.maxSpeed;
    car.maxSpeed = POLICE.maxSpeedBase + w.stars * POLICE.perStarSpeed + bonus;
    driveCar(car, throttle, Math.max(-1, Math.min(1, car.steer)), dt, 'road');
    car.maxSpeed = savedMax;

    // Officers pile out when the suspect is on foot and close.
    car.officerDropped -= dt;
    if (w.stars >= 3 && !p.inCar && dist < 150 && Math.abs(car.speed) < 70 && car.officerDropped <= 0
      && game.officers.filter((o) => !o.dead).length < w.stars) {
      car.officerDropped = 24;
      game.officers.push({
        x: car.x + game.rng.range(-14, 14),
        y: car.y + game.rng.range(-14, 14),
        angle: Math.atan2(p.y - car.y, p.x - car.x),
        speed: 0,
        health: 55,
        shootCd: game.rng.range(0.8, 1.6),
        dead: false,
      });
      sfx.door();
    }
  }

  updateOfficers(game, dt);
  updateBust(game, dt);

  // Siren volume follows the nearest unit.
  let nearest = Infinity;
  for (const car of policeCars(game)) nearest = Math.min(nearest, Math.hypot(car.x - p.x, car.y - p.y));
  setSirenLevel(nearest === Infinity ? 0 : Math.max(0, 1 - nearest / 720));
}

function updateOfficers(game, dt) {
  const p = game.player;
  const w = game.wanted;
  for (const o of game.officers) {
    if (o.dead) continue;
    const dist = Math.hypot(p.x - o.x, p.y - o.y);
    if (w.stars === 0 || dist > 620) {
      o.dead = true; // the moment passes; they melt away off-screen
      continue;
    }
    o.angle = Math.atan2(p.y - o.y, p.x - o.x);
    let move = 0;
    if (dist > 132) move = 1;
    else if (dist < 84) move = -0.5;
    o.x += Math.cos(o.angle) * 198 * move * dt;
    o.y += Math.sin(o.angle) * 198 * move * dt;
    const pos = { x: o.x, y: o.y };
    collideBuildings(game.city, pos, 11);
    o.x = pos.x;
    o.y = pos.y;
    clampToWorld(o, 24);

    o.shootCd -= dt;
    if (o.shootCd <= 0 && dist < 320 && !p.inCar) {
      o.shootCd = game.rng.range(1.3, 2.1);
      const spread = game.rng.range(-0.085, 0.085);
      fireBullet(game, o.x, o.y, o.angle + spread, 'officer', 9);
      sfx.gunshot();
    } else if (o.shootCd <= 0 && dist < 260 && p.inCar) {
      o.shootCd = game.rng.range(1.6, 2.4);
      const spread = game.rng.range(-0.1, 0.1);
      fireBullet(game, o.x, o.y, o.angle + spread, 'officer', 9);
      sfx.gunshot();
    }
  }
  game.officers = game.officers.filter((o) => !o.dead);
}

function updateBust(game, dt) {
  const p = game.player;
  if (game.state !== 'playing') return;
  const slowOrStopped = p.inCar ? Math.abs(p.inCar.speed) < 16 : p.speedNow < 34;
  let covered = false;
  if (slowOrStopped) {
    for (const car of policeCars(game)) {
      if (Math.hypot(car.x - p.x, car.y - p.y) < 64) { covered = true; break; }
    }
    if (!covered) {
      for (const o of game.officers) {
        if (Math.hypot(o.x - p.x, o.y - p.y) < 46) { covered = true; break; }
      }
    }
  }
  if (covered && game.wanted.stars > 0) {
    p.bustMeter += dt / PLAYER.bustTime;
    if (p.bustMeter >= 1) {
      p.bustMeter = 0;
      game.onBusted();
    }
  } else {
    p.bustMeter = Math.max(0, p.bustMeter - dt * 0.9);
  }
}

export function drawOfficer(ctx, officer) {
  ctx.save();
  ctx.translate(officer.x, officer.y);
  ctx.fillStyle = 'rgba(30,30,40,0.25)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 10, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(officer.angle);
  ctx.fillStyle = '#20303e';
  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 6.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8c39e';
  ctx.beginPath();
  ctx.arc(2.5, 0, 4.6, 0, Math.PI * 2);
  ctx.fill();
  // Cap and the pistol in hand.
  ctx.fillStyle = '#16222c';
  ctx.beginPath();
  ctx.arc(2.5, 0, 4.8, Math.PI * 0.7, Math.PI * 1.9);
  ctx.fill();
  ctx.fillStyle = '#11151a';
  ctx.fillRect(8, -1.5, 9, 3);
  ctx.restore();
}
