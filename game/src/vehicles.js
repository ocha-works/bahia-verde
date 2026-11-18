// vehicles.js — every car in Bahia Verde: the catalogue of types, the
// traffic that drives the road graph on its own, the shared arcade
// physics the player and the police both drive with, and the routine
// that draws a car (including a police car's light bar).

import { TRAFFIC, COLORS } from './config.js';
import { roadPointNear } from './city.js';

export const VEHICLE_TYPES = {
  coupe: { label: 'Cóndor Coupe', len: 48, wid: 23, maxSpeed: 305, accel: 205, health: 100 },
  sedan: { label: 'Meridian Sedan', len: 50, wid: 24, maxSpeed: 252, accel: 165, health: 110 },
  hatch: { label: 'Pico Hatch', len: 42, wid: 22, maxSpeed: 232, accel: 175, health: 90 },
  van: { label: 'Carga Van', len: 56, wid: 26, maxSpeed: 208, accel: 130, health: 140 },
  truck: { label: 'Blindado Cash Truck', len: 62, wid: 28, maxSpeed: 196, accel: 105, health: 420 },
  police: { label: 'BVPD Interceptor', len: 50, wid: 24, maxSpeed: 292, accel: 195, health: 130 },
};

const TRAFFIC_COLORS = ['#e74c3c', '#f39c12', '#ecf0f1', '#3498db', '#9b59b6', '#1abc9c', '#e67e22', '#95a5a6', '#fd79a8', '#00b894'];
const TRAFFIC_KINDS = ['coupe', 'sedan', 'sedan', 'hatch', 'hatch', 'van'];

let nextId = 1;

export function makeVehicle(kind, x, y, angle, opts = {}) {
  const type = VEHICLE_TYPES[kind];
  return {
    id: nextId++,
    kind,
    x, y, angle,
    speed: 0,
    steer: 0,
    len: type.len,
    wid: type.wid,
    radius: type.len * 0.42,
    maxSpeed: opts.maxSpeed ?? type.maxSpeed,
    accel: type.accel,
    health: opts.health ?? type.health,
    maxHealth: type.health,
    color: opts.color ?? '#cccccc',
    driver: opts.driver ?? 'parked', // parked | traffic | player | police | scripted
    from: opts.from ?? null,
    to: opts.to ?? null,
    dead: false,
    lightPhase: Math.random() * Math.PI * 2,
  };
}

export function spawnParkedCar(city, rng, places) {
  // Park along the edge of an avenue or a street, parallel to the kerb.
  const vertical = rng.chance(0.5);
  let x;
  let y;
  let angle;
  if (vertical) {
    const ax = rng.pick([300, 940, 1580, 2220, 2860, 3500]);
    x = ax + rng.pick([-1, 1]) * 52;
    y = rng.range(420, 2180);
    angle = rng.chance(0.5) ? -Math.PI / 2 : Math.PI / 2;
  } else {
    const sy = rng.pick([300, 860, 1420, 1980]);
    y = sy + rng.pick([-1, 1]) * 44;
    x = rng.range(420, 3380);
    angle = rng.chance(0.5) ? 0 : Math.PI;
  }
  if (places && Math.hypot(x - places.x, y - places.y) < 60) return null;
  const car = makeVehicle(rng.pick(TRAFFIC_KINDS), x, y, angle, { color: rng.pick(TRAFFIC_COLORS), driver: 'parked' });
  return car;
}

export function spawnTrafficCar(game, rng) {
  const p = game.player;
  const spot = roadPointNear(game.city, rng, p.x, p.y, 520, 980);
  const dirx = spot.next.x - spot.node.x;
  const diry = spot.next.y - spot.node.y;
  const angle = Math.atan2(diry, dirx);
  // Start in the right-hand lane of the segment node -> next.
  const rx = -diry / (Math.hypot(dirx, diry) || 1);
  const ry = dirx / (Math.hypot(dirx, diry) || 1);
  const car = makeVehicle(rng.pick(TRAFFIC_KINDS), spot.x + rx * TRAFFIC.laneOffset, spot.y + ry * TRAFFIC.laneOffset, angle, {
    color: rng.pick(TRAFFIC_COLORS),
    driver: 'traffic',
    from: spot.node,
    to: spot.next,
  });
  car.speed = TRAFFIC.cruiseSpeed * rng.range(0.7, 1);
  return car;
}

// The point a road-following driver aims at: ahead along the segment,
// shifted into the right-hand lane.
function laneTarget(car) {
  const dx = car.to.x - car.from.x;
  const dy = car.to.y - car.from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const along = (car.x - car.from.x) * ux + (car.y - car.from.y) * uy;
  const ahead = Math.min(len, along + TRAFFIC.lookAhead);
  return {
    x: car.from.x + ux * ahead - uy * TRAFFIC.laneOffset,
    y: car.from.y + uy * ahead + ux * TRAFFIC.laneOffset,
    ux, uy, len, along,
  };
}

export function steerToward(car, tx, ty, dt, turnRate = 2.7) {
  const desired = Math.atan2(ty - car.y, tx - car.x);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxTurn = turnRate * dt;
  car.steer = Math.max(-1, Math.min(1, diff * 2.2));
  car.angle += Math.max(-maxTurn, Math.min(maxTurn, diff * 1.9 * dt * 2.2));
  return Math.abs(diff);
}

// Is there a vehicle close ahead of this one? Traffic queues politely.
function carAhead(game, car) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let nearest = null;
  let nearestDist = Infinity;
  for (const other of game.vehicles) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * fx + dy * fy;
    if (ahead < 4 || ahead > TRAFFIC.safeGap + car.speed * 0.35) continue;
    const lateral = Math.abs(-dx * fy + dy * fx);
    if (lateral > 20) continue;
    if (ahead < nearestDist) {
      nearestDist = ahead;
      nearest = other;
    }
  }
  return nearest;
}

export function updateTrafficCar(game, car, dt) {
  if (!car.from || !car.to) return;
  const target = laneTarget(car);
  const angleDiff = steerToward(car, target.x, target.y, dt);

  let desired = TRAFFIC.cruiseSpeed * (car.kind === 'van' ? 0.8 : 1);
  if (angleDiff > 0.5) desired *= 0.45;
  const blocker = carAhead(game, car);
  if (blocker) {
    desired = Math.min(desired, Math.max(0, blocker.speed - 12));
    if (Math.hypot(blocker.x - car.x, blocker.y - car.y) < 44) desired = 0;
  }
  // A pedestrian in the road ahead stops traffic, most of the time.
  for (const ped of game.pedestrians) {
    if (ped.state === 'down') continue;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const lateral = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (ahead > 0 && ahead < 52 && lateral < 17) {
      desired = 0;
      break;
    }
  }

  if (car.speed < desired) car.speed = Math.min(desired, car.speed + car.accel * 0.7 * dt);
  else car.speed = Math.max(desired, car.speed - 260 * dt);

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  // Reached the node? Choose the next leg: usually straight on.
  if (target.along > target.len - 30) {
    const options = car.to.neighbors.filter((n) => n !== car.from);
    let nextNode;
    if (options.length === 0) {
      nextNode = car.from; // dead end: turn around
    } else {
      const straight = options.find((n) => Math.sign(n.x - car.to.x) === Math.sign(target.ux) && Math.sign(n.y - car.to.y) === Math.sign(target.uy));
      nextNode = straight && game.rng.chance(0.65) ? straight : game.rng.pick(options);
    }
    car.from = car.to;
    car.to = nextNode;
  }
}

// Shared arcade physics for any car a driver is actively steering
// (the player, a police unit, a scripted truck): throttle -1..1,
// steer -1..1. Returns the surface speed ratio for the engine note.
export function driveCar(car, throttle, steer, dt, surface = 'road') {
  const wrecked = car.health <= 0;
  const topSpeed = wrecked ? 42 : car.maxSpeed * (surface === 'sand' ? 0.55 : 1);
  if (throttle > 0) {
    // Forward throttle; twice as strong while rolling backwards (braking).
    car.speed += car.accel * throttle * dt * (car.speed < 0 ? 2.4 : 1);
  } else if (throttle < 0) {
    if (car.speed > 8) {
      car.speed -= 340 * dt; // brake pedal
    } else {
      car.speed += car.accel * 0.6 * throttle * dt; // reverse gear
    }
  } else {
    car.speed -= car.speed * 0.7 * dt;
    if (Math.abs(car.speed) < 2) car.speed = 0;
  }
  car.speed = Math.max(-car.maxSpeed * 0.32, Math.min(topSpeed, car.speed));
  const steerAuthority = Math.min(1, Math.abs(car.speed) / 60);
  car.angle += steer * 1.85 * steerAuthority * dt * (car.speed < 0 ? -1 : 1) * Math.min(1, Math.abs(car.speed) / 120 + 0.25);
  car.steer = steer;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  return Math.abs(car.speed) / car.maxSpeed;
}

export function drawVehicle(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  // Soft shadow first, unrotated-light style.
  ctx.fillStyle = 'rgba(30, 30, 40, 0.28)';
  ctx.beginPath();
  ctx.ellipse(3, 5, car.len * 0.52, car.wid * 0.58, car.angle, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(car.angle);

  const L = car.len;
  const W = car.wid;
  const body = car.dead || car.health <= 0 ? '#55565c' : car.color;
  ctx.fillStyle = body;
  roundRect(ctx, -L / 2, -W / 2, L, W, 6);
  ctx.fill();
  // Hood and boot shading.
  ctx.fillStyle = 'rgba(255,255,255,0.13)';
  roundRect(ctx, L * 0.18, -W / 2 + 2, L * 0.28, W - 4, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  roundRect(ctx, -L / 2 + 2, -W / 2 + 2, L * 0.2, W - 4, 4);
  ctx.fill();
  // Cabin: windshield, roof, rear window.
  ctx.fillStyle = '#1d2733';
  roundRect(ctx, -L * 0.08, -W / 2 + 3, L * 0.16, W - 6, 3);
  ctx.fill();
  ctx.fillStyle = shade(body, 18);
  roundRect(ctx, -L * 0.3, -W / 2 + 4, L * 0.22, W - 8, 3);
  ctx.fill();
  ctx.fillStyle = '#24313f';
  roundRect(ctx, -L * 0.38, -W / 2 + 3, L * 0.08, W - 6, 3);
  ctx.fill();
  // Wheels, front pair turned by the steer value.
  ctx.fillStyle = '#14161a';
  const wy = W / 2 - 1;
  for (const [wx, wySign, front] of [[L * 0.32, -1, 1], [L * 0.32, 1, 1], [-L * 0.32, -1, 0], [-L * 0.32, 1, 0]]) {
    ctx.save();
    ctx.translate(wx, wySign * wy);
    if (front) ctx.rotate((car.steer || 0) * 0.42);
    roundRect(ctx, -5, -2.5, 10, 5, 2);
    ctx.fill();
    ctx.restore();
  }
  if (car.kind === 'police') {
    // White doors and the light bar, red/blue alternating with time.
    ctx.fillStyle = COLORS.policeCarLight;
    roundRect(ctx, -L * 0.16, -W / 2 + 3, L * 0.3, 5, 2);
    ctx.fill();
    roundRect(ctx, -L * 0.16, W / 2 - 8, L * 0.3, 5, 2);
    ctx.fill();
    const phase = Math.sin(time * 11 + car.lightPhase) > 0;
    ctx.fillStyle = phase ? '#ff3b30' : '#0a84ff';
    roundRect(ctx, -L * 0.06, -W / 4, L * 0.12, W / 4, 2);
    ctx.fill();
    ctx.fillStyle = phase ? '#0a84ff' : '#ff3b30';
    roundRect(ctx, -L * 0.06, 0, L * 0.12, W / 4, 2);
    ctx.fill();
  }
  if (car.kind === 'truck') {
    ctx.fillStyle = '#78858f';
    roundRect(ctx, -L * 0.48, -W / 2 + 2, L * 0.55, W - 4, 3);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BLINDADO', -L * 0.2, 3);
  }
  if (car.kind === 'van') {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    roundRect(ctx, -L * 0.44, -W / 2 + 3, L * 0.5, W - 6, 3);
    ctx.fill();
  }
  ctx.restore();

  // Damage smoke above a hurt car.
  if (car.health < 45 && !car.dead) {
    const puff = (Math.sin(time * 3 + car.id * 7) + 1) / 2;
    ctx.fillStyle = `rgba(60,60,60,${0.25 + puff * 0.2})`;
    ctx.beginPath();
    ctx.arc(car.x + L * 0.3, car.y - 6 - puff * 8, 5 + puff * 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Lighten (+) or darken (−) a #rrggbb colour by an amount.
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp((n >> 16) + amt);
  const g = clamp(((n >> 8) & 0xff) + amt);
  const b = clamp((n & 0xff) + amt);
  return `rgb(${r},${g},${b})`;
}
