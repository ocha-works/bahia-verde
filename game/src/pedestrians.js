// pedestrians.js — the people of Bahia Verde: neighbours strolling the
// promenades, who scatter when a car mounts the kerb or a shot rings
// out, and the occasional debtor who would rather fight than pay.
// Pedestrians walk between waypoints on pavements and plazas, flee
// threats, and — when a mission marks them hostile — come at the
// player with their fists.

import { PLAYER } from './config.js';
import { isOnRoad, collideBuildings, clampToWorld, groundAt } from './city.js';

const SKIN_TONES = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
const SHIRTS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f78c6b', '#a8dadc', '#e07a5f', '#81b29a'];
const PANTS = ['#3d405b', '#555b6e', '#6d6875', '#2a9d8f', '#e9c46a'];

let nextPedId = 1;

export function makePedestrian(rng, x, y, opts = {}) {
  return {
    id: nextPedId++,
    x, y,
    angle: rng.range(0, Math.PI * 2),
    speed: 0,
    walkPhase: rng.range(0, Math.PI * 2),
    shirt: opts.shirt ?? rng.pick(SHIRTS),
    pants: opts.pants ?? rng.pick(PANTS),
    skin: rng.pick(SKIN_TONES),
    health: opts.health ?? 30,
    state: opts.state ?? 'walk', // walk | flee | down | hostile | scared
    target: null,
    retargetIn: rng.range(0, 3),
    hostile: opts.hostile ?? false,
    name: opts.name ?? null,
    missionTag: opts.missionTag ?? null,
    attackCd: 0,
    downTime: 0,
    dead: false,
  };
}

// A pavement point to stroll to: near a road but not on it, or anywhere
// on the beach and the plazas.
function strollTarget(game, ped) {
  const rng = game.rng;
  for (let tries = 0; tries < 10; tries++) {
    const x = ped.x + rng.range(-420, 420);
    const y = ped.y + rng.range(-420, 420);
    if (x < 40 || y < 40 || x > 3800 || y > 2840) continue;
    if (groundAt(x, y) === 'water') continue;
    if (isOnRoad(x, y) && rng.chance(0.75)) continue; // mostly keep off the asphalt
    return { x, y };
  }
  return { x: ped.x + rng.range(-120, 120), y: ped.y + rng.range(-120, 120) };
}

export function spawnPedestrianNear(game, rng) {
  const p = game.player;
  const angle = rng.range(0, Math.PI * 2);
  const dist = rng.range(430, 760);
  const x = p.x + Math.cos(angle) * dist;
  const y = p.y + Math.sin(angle) * dist;
  if (x < 40 || y < 40 || x > 3800 || y > 2840) return null;
  if (groundAt(x, y) === 'water') return null;
  const ped = makePedestrian(rng, x, y);
  ped.target = strollTarget(game, ped);
  return ped;
}

export function updatePedestrian(game, ped, dt) {
  if (ped.state === 'down') {
    ped.downTime += dt;
    if (ped.downTime > 25) ped.dead = true;
    return;
  }
  const player = game.player;
  const distToPlayer = Math.hypot(player.x - ped.x, player.y - ped.y);

  // Fear: a speeding car nearby, a gunshot, or the player's own menace
  // sends a walker running directly away from the threat.
  if (ped.state !== 'hostile') {
    const threat = game.threat;
    if (threat && Math.hypot(threat.x - ped.x, threat.y - ped.y) < 190 && threat.age < 2.5) {
      ped.state = 'flee';
      ped.fleeFrom = { x: threat.x, y: threat.y };
    } else if (ped.state === 'flee' && (!threat || threat.age > 3)) {
      ped.state = 'walk';
      ped.target = strollTarget(game, ped);
    }
  }

  let desiredSpeed = 0;
  if (ped.state === 'flee') {
    const from = ped.fleeFrom ?? player;
    ped.angle = Math.atan2(ped.y - from.y, ped.x - from.x);
    desiredSpeed = 235;
  } else if (ped.state === 'hostile') {
    ped.angle = Math.atan2(player.y - ped.y, player.x - ped.x);
    if (ped.holdPosition) {
      desiredSpeed = 0; // staged menace: face the player, stay put
    } else if (distToPlayer > 30) {
      desiredSpeed = 196;
    } else {
      desiredSpeed = 0;
      ped.attackCd -= dt;
      if (ped.attackCd <= 0) {
        ped.attackCd = 0.85;
        game.damagePlayer(game.rng.range(4, 9), ped);
        game.spawnHitSpark(player.x, player.y, '#ffffff');
      }
    }
  } else if (ped.stayPut) {
    // A debtor waiting at his spot: loiter, do not wander off.
    desiredSpeed = 0;
  } else {
    // Strolling.
    if (!ped.target) ped.target = strollTarget(game, ped);
    const dx = ped.target.x - ped.x;
    const dy = ped.target.y - ped.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 14) {
      ped.retargetIn -= dt;
      if (ped.retargetIn <= 0) {
        ped.target = strollTarget(game, ped);
        ped.retargetIn = game.rng.range(1, 5);
      }
    } else {
      ped.angle = Math.atan2(dy, dx);
      desiredSpeed = 74;
    }
  }

  ped.speed += (desiredSpeed - ped.speed) * Math.min(1, dt * 6);
  if (Math.abs(ped.speed) > 4) {
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
    ped.walkPhase += dt * (Math.abs(ped.speed) / 12);
  }
  const pos = { x: ped.x, y: ped.y };
  collideBuildings(game.city, pos, 11);
  ped.x = pos.x;
  ped.y = pos.y;
  clampToWorld(ped, 24);
  if (groundAt(ped.x, ped.y) === 'water') {
    ped.y = 2620; // nobody strolls into the bay
  }
}

export function hurtPedestrian(game, ped, damage, angle) {
  if (ped.state === 'down') return;
  ped.health -= damage;
  game.spawnHitSpark(ped.x, ped.y, '#ffd166');
  if (ped.health <= 0) {
    ped.state = 'down';
    ped.downTime = 0;
    ped.speed = 0;
    game.onPedDown?.(ped);
  } else if (!ped.hostile) {
    ped.state = 'flee';
    ped.fleeFrom = { x: ped.x - Math.cos(angle) * 40, y: ped.y - Math.sin(angle) * 40 };
  }
}

export function drawPedestrian(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.fillStyle = 'rgba(30,30,40,0.25)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 10, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  if (ped.state === 'down') {
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = ped.pants;
    ctx.fillRect(-4, -2, 8, 13);
    ctx.fillStyle = ped.shirt;
    ctx.fillRect(-5, -13, 10, 12);
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(0, -16, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.rotate(ped.angle);
  // Legs swing with the walk phase when moving.
  const swing = Math.abs(ped.speed) > 6 ? Math.sin(ped.walkPhase) * 5 : 0;
  ctx.strokeStyle = ped.pants;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-3 - swing * 0.4, swing);
  ctx.moveTo(0, 0);
  ctx.lineTo(-3 + swing * 0.4, -swing);
  ctx.stroke();
  // Torso and head, drawn facing +x (the heading).
  ctx.fillStyle = ped.shirt;
  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 6.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(2.5, 0, 4.6, 0, Math.PI * 2);
  ctx.fill();
  if (ped.hostile) {
    ctx.fillStyle = '#ef476f';
    ctx.fillRect(-2, -7, 7, 3); // a red bandana marks a fighter
  }
  ctx.restore();

  if (ped.name && ped.state !== 'down') {
    ctx.fillStyle = 'rgba(20,24,32,0.75)';
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const w = ctx.measureText(ped.name).width + 10;
    ctx.fillRect(ped.x - w / 2, ped.y - 30, w, 14);
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(ped.name, ped.x, ped.y - 19);
  }
}

export { PLAYER };
