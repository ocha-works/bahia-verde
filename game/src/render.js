// render.js — the camera and everything the camera sees: ground, roads,
// buildings with their sun-shadowed roofs, palms and stalls, the water,
// mission markers, cars, people, and the full-screen states (title,
// pause, busted, wasted) drawn over the living city.

import { WORLD, COLORS } from './config.js';
import { AVENUES, STREETS, AVENUE_HALF, STREET_HALF, PLACES } from './city.js';
import { drawVehicle, shade } from './vehicles.js';
import { drawPedestrian } from './pedestrians.js';
import { drawOfficer } from './police.js';
import { drawParticles } from './combat.js';
import { drawHUD, wrapText } from './hud.js';

export function createCamera() {
  return { x: 0, y: 0 };
}

export function updateCamera(cam, target, w, h, dt, snap = false) {
  const tx = target.x - w / 2;
  const ty = target.y - h / 2;
  const blend = snap ? 1 : Math.min(1, dt * 4.5);
  cam.x += (tx - cam.x) * blend;
  cam.y += (ty - cam.y) * blend;
  cam.x = Math.max(0, Math.min(WORLD.width - w, cam.x));
  cam.y = Math.max(0, Math.min(WORLD.height - h, cam.y));
  if (WORLD.width < w) cam.x = (WORLD.width - w) / 2;
  if (WORLD.height < h) cam.y = (WORLD.height - h) / 2;
}

export function drawGame(ctx, game, w, h) {
  const cam = game.camera;
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
  drawGround(ctx, game, cam, w, h);
  drawProps(ctx, game, cam, w, h, 'under');
  drawBuildings(ctx, game, cam, w, h);
  drawMarkers(ctx, game);
  for (const car of game.vehicles) {
    if (onScreen(car.x, car.y, cam, w, h, 90)) drawVehicle(ctx, car, game.time);
  }
  for (const ped of game.pedestrians) {
    if (onScreen(ped.x, ped.y, cam, w, h, 40)) drawPedestrian(ctx, ped);
  }
  for (const officer of game.officers) {
    if (onScreen(officer.x, officer.y, cam, w, h, 40)) drawOfficer(ctx, officer);
  }
  if (!game.player.inCar) drawPlayer(ctx, game);
  drawParticles(ctx, game);
  ctx.restore();

  // Warm sunlight wash and a soft vignette.
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(255, 190, 90, 0.07)');
  grad.addColorStop(1, 'rgba(30, 60, 90, 0.05)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  if (game.state === 'playing' || game.state === 'paused') drawHUD(ctx, game, w, h);
  if (game.state === 'title') drawTitle(ctx, game, w, h);
  if (game.state === 'paused') drawPause(ctx, game, w, h);
  if (game.state === 'busted') drawEndCard(ctx, game, w, h, 'BUSTED', 'The BVPD takes its cut, and lets you walk.', '#4da3ff');
  if (game.state === 'wasted') drawEndCard(ctx, game, w, h, 'WASTED', 'Hospital San Sol patches you up — for a price.', '#ef476f');
}

function onScreen(x, y, cam, w, h, pad) {
  return x > cam.x - pad && x < cam.x + w + pad && y > cam.y - pad && y < cam.y + h + pad;
}

function drawGround(ctx, game, cam, w, h) {
  const x0 = Math.max(0, cam.x - 40);
  const y0 = Math.max(0, cam.y - 40);
  const x1 = Math.min(WORLD.width, cam.x + w + 40);
  const y1 = Math.min(WORLD.height, cam.y + h + 40);

  // City blocks read as warm pavement between the roads.
  ctx.fillStyle = COLORS.pavement;
  if (y0 < WORLD.sandY) ctx.fillRect(x0, y0, x1 - x0, Math.min(y1, WORLD.sandY) - y0);
  // Park lawns inside their blocks (plazas stay paved).
  ctx.fillStyle = COLORS.grassDark;
  for (const block of game.city.blocks) {
    if (block.kind !== 'park') continue;
    if (block.x > x1 || block.y > y1 || block.x + block.w < x0 || block.y + block.h < y0) continue;
    ctx.fillRect(block.x, block.y, block.w, block.h);
  }
  // Sand and sea.
  if (y1 > WORLD.sandY && y0 < WORLD.waterY) {
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(x0, Math.max(y0, WORLD.sandY), x1 - x0, Math.min(y1, WORLD.waterY) - Math.max(y0, WORLD.sandY));
  }
  ctx.fillStyle = COLORS.sandDark;
  ctx.fillRect(x0, WORLD.waterY - 8, x1 - x0, 8);
  if (y1 > WORLD.waterY) {
    ctx.fillStyle = COLORS.waterDeep;
    ctx.fillRect(x0, Math.max(y0, WORLD.waterY), x1 - x0, y1 - Math.max(y0, WORLD.waterY));
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(x0, Math.max(y0, WORLD.waterY), x1 - x0, 60);
    // Drifting foam lines.
    ctx.strokeStyle = 'rgba(220, 245, 240, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const fy = WORLD.waterY + 16 + i * 52 + Math.sin(game.time * 0.7 + i * 2) * 4;
      if (fy < y0 || fy > y1) continue;
      for (let x = x0; x < x1; x += 46) {
        const yy = fy + Math.sin(x * 0.02 + game.time + i) * 3;
        if (x === x0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
    }
    ctx.stroke();
    ctx.fillStyle = COLORS.waterFoam;
    ctx.fillRect(x0, WORLD.waterY, x1 - x0, 3);
  }

  // Roads: asphalt, kerb lines, dashed centres, crosswalks.
  ctx.fillStyle = COLORS.road;
  for (const ax of AVENUES) ctx.fillRect(ax - AVENUE_HALF, 240, AVENUE_HALF * 2, 2150);
  for (const sy of STREETS) {
    if (sy === 2330) ctx.fillRect(0, sy - STREET_HALF, WORLD.width, STREET_HALF * 2);
    else ctx.fillRect(234, sy - STREET_HALF, 3332, STREET_HALF * 2);
  }
  ctx.strokeStyle = COLORS.roadEdge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const ax of AVENUES) {
    ctx.moveTo(ax - AVENUE_HALF, 240);
    ctx.lineTo(ax - AVENUE_HALF, 2390);
    ctx.moveTo(ax + AVENUE_HALF, 240);
    ctx.lineTo(ax + AVENUE_HALF, 2390);
  }
  ctx.stroke();
  ctx.strokeStyle = COLORS.laneMark;
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 30]);
  ctx.beginPath();
  for (const ax of AVENUES) {
    ctx.moveTo(ax, 250);
    ctx.lineTo(ax, 2380);
  }
  for (const sy of STREETS) {
    if (sy === 2330) {
      ctx.moveTo(10, sy);
      ctx.lineTo(WORLD.width - 10, sy);
    } else {
      ctx.moveTo(244, sy);
      ctx.lineTo(3556, sy);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // Crosswalks at every crossing in view.
  ctx.fillStyle = 'rgba(230,230,230,0.5)';
  for (const node of game.city.nodes) {
    if (!onScreen(node.x, node.y, cam, w, h, 120)) continue;
    for (let i = -2; i <= 2; i++) {
      ctx.fillRect(node.x - AVENUE_HALF + 6, node.y + i * 12 - 3, 12, 6);
      ctx.fillRect(node.x + AVENUE_HALF - 18, node.y + i * 12 - 3, 12, 6);
      ctx.fillRect(node.x + i * 12 - 3, node.y - STREET_HALF + 6, 6, 12);
      ctx.fillRect(node.x + i * 12 - 3, node.y + STREET_HALF - 18, 6, 12);
    }
  }
}

function drawProps(ctx, game, cam, w, h) {
  for (const prop of game.city.props) {
    if (prop.kind === 'dock') {
      ctx.fillStyle = '#9a7b4f';
      ctx.fillRect(prop.x, prop.y, prop.w, prop.h);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (let x = prop.x + 16; x < prop.x + prop.w; x += 24) ctx.fillRect(x, prop.y, 3, prop.h);
      continue;
    }
    if (!onScreen(prop.x, prop.y, cam, w, h, 50)) continue;
    if (prop.kind === 'palm') {
      ctx.strokeStyle = '#7a5c36';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(prop.x, prop.y);
      ctx.lineTo(prop.x + 3, prop.y - 4);
      ctx.stroke();
      ctx.strokeStyle = '#2e8b57';
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + prop.x * 0.01;
        ctx.beginPath();
        ctx.moveTo(prop.x + 3, prop.y - 4);
        ctx.quadraticCurveTo(
          prop.x + 3 + Math.cos(a) * 11, prop.y - 4 + Math.sin(a) * 11 - 3,
          prop.x + 3 + Math.cos(a) * 17, prop.y - 4 + Math.sin(a) * 17 + 4,
        );
        ctx.stroke();
      }
    } else if (prop.kind === 'tree') {
      ctx.fillStyle = '#3f7d3a';
      ctx.beginPath();
      ctx.arc(prop.x, prop.y, 13, 0, Math.PI * 2);
      ctx.arc(prop.x + 9, prop.y + 4, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4c9150';
      ctx.beginPath();
      ctx.arc(prop.x - 3, prop.y - 3, 8, 0, Math.PI * 2);
      ctx.fill();
    } else if (prop.kind === 'lamp') {
      ctx.fillStyle = '#37474f';
      ctx.beginPath();
      ctx.arc(prop.x, prop.y, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.arc(prop.x, prop.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (prop.kind === 'stall') {
      // A market stall: wooden counter under a striped canopy.
      ctx.fillStyle = '#8a6b46';
      ctx.fillRect(prop.x - 13, prop.y - 1, 26, 11);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(prop.x - 13, prop.y + 7, 26, 3);
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i % 2 === 0 ? prop.color : '#f7f3e8';
        ctx.fillRect(prop.x - 15 + i * 6, prop.y - 12, 6, 9);
      }
      ctx.strokeStyle = '#6d543a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(prop.x - 14, prop.y - 3);
      ctx.lineTo(prop.x - 14, prop.y + 2);
      ctx.moveTo(prop.x + 14, prop.y - 3);
      ctx.lineTo(prop.x + 14, prop.y + 2);
      ctx.stroke();
    } else if (prop.kind === 'umbrella') {
      ctx.fillStyle = prop.color;
      ctx.beginPath();
      ctx.arc(prop.x, prop.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(prop.x, prop.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawBuildings(ctx, game, cam, w, h) {
  let i = 0;
  for (const b of game.city.buildings) {
    i++;
    if (!onScreen(b.x + b.w / 2, b.y + b.h / 2, cam, w, h, Math.max(b.w, b.h))) continue;
    const lift = b.height;
    // Ground shadow, then the walls, then the roof slab shifted up
    // against the sun: the cheapest tall-building illusion there is.
    ctx.fillStyle = 'rgba(40, 35, 25, 0.22)';
    ctx.fillRect(b.x + 9, b.y + 11, b.w, b.h);
    ctx.fillStyle = shade(b.color, -38);
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x - lift * 0.28, b.y - lift * 0.55, b.w, b.h);
    ctx.fillStyle = shade(b.color, 6);
    ctx.fillRect(b.x - lift * 0.28 + 4, b.y - lift * 0.55 + 4, b.w - 8, b.h - 8);
    // Rooftop clutter, stable per building.
    const seed = (i * 2654435761) % 100 / 100;
    ctx.fillStyle = 'rgba(90, 90, 100, 0.55)';
    const rx = b.x - lift * 0.28 + 8 + seed * Math.max(4, b.w - 34);
    const ry = b.y - lift * 0.55 + 8 + ((seed * 7) % 1) * Math.max(4, b.h - 30);
    ctx.fillRect(rx, ry, 16, 11);
    if (b.w > 90) ctx.fillRect(rx + 26, ry + 5, 11, 8);
    if (b.name) {
      ctx.fillStyle = 'rgba(20, 24, 32, 0.8)';
      ctx.font = '700 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.name.toUpperCase(), b.x + b.w / 2 - lift * 0.28, b.y - lift * 0.55 + b.h / 2 + 4);
      ctx.textAlign = 'left';
    }
  }
}

function drawMarkers(ctx, game) {
  const t = game.time;
  const beam = (x, y, color) => {
    const grad = ctx.createLinearGradient(x, y - 190, x, y);
    grad.addColorStop(0, 'rgba(255, 210, 63, 0)');
    grad.addColorStop(1, 'rgba(255, 210, 63, 0.35)');
    ctx.fillStyle = color === 'gold' ? grad : grad;
    ctx.fillRect(x - 13, y - 190, 26, 190);
    const bob = Math.sin(t * 3.2) * 6;
    ctx.save();
    ctx.translate(x, y - 26 + bob);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = COLORS.marker;
    ctx.fillRect(-10, -10, 20, 20);
    ctx.fillStyle = '#b8860b';
    ctx.fillRect(-5.5, -5.5, 11, 11);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255, 210, 63, 0.75)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, 30 + Math.sin(t * 3.2) * 4, 0, Math.PI * 2);
    ctx.stroke();
  };
  if (game.state !== 'playing') return;
  const target = game.stepTargetPos;
  if (target) beam(target.x, target.y, 'gold');
  // A health pack glows outside the hospital doors.
  const hosp = PLACES.hospital;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(hosp.x - 9, hosp.y + 27, 18, 18);
  ctx.fillStyle = '#ef476f';
  ctx.fillRect(hosp.x - 2, hosp.y + 30, 4, 12);
  ctx.fillRect(hosp.x - 6, hosp.y + 34, 12, 4);
}

export function drawPlayer(ctx, game) {
  const p = game.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(30,30,40,0.28)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 10, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(p.angle);
  const swing = p.speedNow > 8 ? Math.sin(p.stepCycle * Math.PI) * 5 : 0;
  ctx.strokeStyle = COLORS.playerPants;
  ctx.lineWidth = 4.4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-3 - swing * 0.4, swing);
  ctx.moveTo(0, 0);
  ctx.lineTo(-3 + swing * 0.4, -swing);
  ctx.stroke();
  ctx.fillStyle = COLORS.playerShirt;
  ctx.beginPath();
  ctx.ellipse(0, 0, 8.4, 6.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8c39e';
  ctx.beginPath();
  ctx.arc(2.5, 0, 4.8, 0, Math.PI * 2);
  ctx.fill();
  // Nico's flat cap, brim toward the facing.
  ctx.fillStyle = '#c62828';
  ctx.beginPath();
  ctx.arc(2.5, 0, 5, Math.PI * 0.65, Math.PI * 1.95);
  ctx.fill();
  ctx.fillRect(4, -1.6, 6, 3.2);
  // The pistol, when it is the weapon in hand.
  if (p.weapon === 'pistol' && p.hasPistol) {
    ctx.fillStyle = '#14161a';
    ctx.fillRect(7, -1.6, 10, 3.2);
  }
  ctx.restore();
}

function drawTitle(ctx, game, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(10, 16, 28, 0.62)');
  grad.addColorStop(0.55, 'rgba(10, 16, 28, 0.25)');
  grad.addColorStop(1, 'rgba(10, 16, 28, 0.66)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23f';
  ctx.font = '800 74px system-ui, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 18;
  ctx.fillText('BAHIA VERDE', w / 2, h * 0.3);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 19px system-ui, sans-serif';
  ctx.fillText('An open-world crime story on the Costa Serena', w / 2, h * 0.3 + 36);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  const lines = [
    'Steal cars. Run jobs for Marisol Vega. Outrun the BVPD.',
    '',
    game.hasSave ? 'ENTER — Continue      N — New game' : 'ENTER — Start the story',
    '',
    'WASD / arrows — move & drive      E — enter / leave a car',
    'Mouse — aim      Click / Space — punch & shoot      Shift — sprint / handbrake',
    'R — reload      Q — swap weapon      P — pause      M — mute',
  ];
  lines.forEach((line, i) => ctx.fillText(line, w / 2, h * 0.46 + i * 26));
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('Built for make.fun’s “Make GTA 6” bounty — an original game; any resemblance to other cities is purely geographical.', w / 2, h - 26);
  ctx.textAlign = 'left';
}

function drawPause(ctx, game, w, h) {
  ctx.fillStyle = 'rgba(10, 14, 22, 0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 40px system-ui, sans-serif';
  ctx.fillText('PAUSED', w / 2, h / 2 - 12);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('P — resume      Progress saves itself after every job', w / 2, h / 2 + 22);
  ctx.textAlign = 'left';
}

function drawEndCard(ctx, game, w, h, title, line, color) {
  ctx.fillStyle = 'rgba(10, 14, 22, 0.6)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.font = '800 64px system-ui, sans-serif';
  ctx.fillText(title, w / 2, h / 2 - 20);
  ctx.fillStyle = '#ffffff';
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillText(line, w / 2, h / 2 + 16);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '600 15px system-ui, sans-serif';
  ctx.fillText('ENTER — back on the street', w / 2, h / 2 + 66);
  ctx.textAlign = 'left';
}
