// combat.js — fists, the pistol, bullets and impact particles.
// Combat is deliberately light: a melee arc for punches, fast straight
// bullets for gunfire, and small particle bursts so hits read clearly
// without any gore. Crime reporting hooks live here too: a swing or a
// shot near witnesses is what the police module hears about.

import { HEAT } from './config.js';
import { buildingAt } from './city.js';
import { hurtPedestrian } from './pedestrians.js';

export const WEAPONS = {
  fists: { name: 'Fists', damage: 13, cooldown: 0.34, range: 34 },
  pistol: { name: 'Pistol', damage: 30, cooldown: 0.23, range: 560, magSize: 12, reloadTime: 0.9 },
};

export function fireBullet(game, x, y, angle, from, damage = WEAPONS.pistol.damage) {
  const speed = 880;
  game.bullets.push({
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: WEAPONS.pistol.range / speed,
    from, // 'player' | 'officer'
    damage,
  });
  game.spawnParticles(x + Math.cos(angle) * 16, y + Math.sin(angle) * 16, {
    count: 3, color: '#ffdf6b', speed: 60, life: 0.09, size: 2.4,
  });
}

export function updateBullets(game, dt) {
  const kept = [];
  for (const b of game.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    if (buildingAt(game.city, b.x, b.y, -2)) {
      game.spawnHitSpark(b.x, b.y, '#ffe9a8');
      continue;
    }
    let consumed = false;
    if (b.from === 'player') {
      for (const ped of game.pedestrians) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.x - b.x, ped.y - b.y) < 12) {
          hurtPedestrian(game, ped, b.damage, Math.atan2(b.vy, b.vx));
          if (ped.state === 'down') game.reportCrime('pedKilled', ped.x, ped.y);
          else game.reportCrime('assault', ped.x, ped.y);
          consumed = true;
          break;
        }
      }
      if (!consumed) {
        for (const officer of game.officers) {
          if (Math.hypot(officer.x - b.x, officer.y - b.y) < 12) {
            game.hurtOfficer(officer, b.damage);
            consumed = true;
            break;
          }
        }
      }
      if (!consumed) {
        for (const car of game.vehicles) {
          if (car.dead) continue;
          if (Math.hypot(car.x - b.x, car.y - b.y) < car.radius) {
            car.health -= b.damage * 0.5;
            game.spawnHitSpark(b.x, b.y, '#ffb703');
            if (car.driver === 'police') game.reportCrime('policeHit', car.x, car.y);
            consumed = true;
            break;
          }
        }
      }
    } else if (b.from === 'officer') {
      const p = game.player;
      const target = p.inCar ?? p;
      if (Math.hypot(target.x - b.x, target.y - b.y) < (p.inCar ? p.inCar.radius : 13)) {
        if (p.inCar) p.inCar.health -= b.damage * 0.35;
        else game.damagePlayer(b.damage * 0.6, null);
        game.spawnHitSpark(b.x, b.y, '#ff8fa3');
        consumed = true;
      }
    }
    if (!consumed) kept.push(b);
  }
  game.bullets = kept;
}

// A punch (or a baton swing): everything hostile-sized inside a short
// arc in front of the swinger takes it. Returns true if anything landed.
export function meleeSwing(game, swinger, angle) {
  const range = WEAPONS.fists.range;
  let landed = false;
  const reach = (target) => {
    const dx = target.x - swinger.x;
    const dy = target.y - swinger.y;
    const dist = Math.hypot(dx, dy);
    if (dist > range + 10) return false;
    let diff = Math.atan2(dy, dx) - angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.abs(diff) < 1.15;
  };
  for (const ped of game.pedestrians) {
    if (ped === swinger || ped.state === 'down') continue;
    if (reach(ped)) {
      hurtPedestrian(game, ped, WEAPONS.fists.damage, angle);
      game.reportCrime(ped.state === 'down' ? 'pedKilled' : 'assault', ped.x, ped.y);
      landed = true;
    }
  }
  for (const officer of game.officers) {
    if (reach(officer)) {
      game.hurtOfficer(officer, WEAPONS.fists.damage);
      landed = true;
    }
  }
  for (const car of game.vehicles) {
    if (Math.hypot(car.x - swinger.x, car.y - swinger.y) < range + car.radius) {
      car.health -= 4;
      game.spawnHitSpark(car.x, car.y - 10, '#ffe9a8');
      landed = true;
    }
  }
  return landed;
}

// --- Particles ------------------------------------------------------------

export function spawnParticles(game, x, y, { count = 8, color = '#ffffff', speed = 120, life = 0.4, size = 3, spread = Math.PI * 2 } = {}) {
  for (let i = 0; i < count; i++) {
    const a = game.rng.range(0, spread);
    const s = game.rng.range(speed * 0.3, speed);
    game.particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: game.rng.range(life * 0.5, life),
      maxLife: life,
      color,
      size: game.rng.range(size * 0.6, size * 1.3),
    });
  }
}

export function updateParticles(game, dt) {
  const kept = [];
  for (const p of game.particles) {
    p.life -= dt;
    if (p.life <= 0) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
    kept.push(p);
  }
  game.particles = kept;
}

export function drawParticles(ctx, game) {
  for (const p of game.particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Bullet tracers.
  ctx.strokeStyle = 'rgba(255, 230, 150, 0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const b of game.bullets) {
    ctx.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
}

export { HEAT };
