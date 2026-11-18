// hud.js — everything drawn over the world: the cash and health readouts,
// the wanted stars, the objective banner and mission timer, dialogue and
// message lines, the context prompt, the bust meter, and the minimap
// with its blips for the mission target, the police and the player.

import { WORLD, COLORS } from './config.js';
import { AVENUES, STREETS } from './city.js';
import { objectiveText, currentStep, missionStartMarker } from './missions.js';
import { roundRect } from './vehicles.js';

function panel(ctx, x, y, w, h, alpha = 0.55) {
  ctx.fillStyle = `rgba(16, 20, 28, ${alpha})`;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
}

export function drawHUD(ctx, game, w, h) {
  const p = game.player;
  ctx.textAlign = 'left';

  // Cash and health, top-left.
  panel(ctx, 14, 14, 208, 64);
  ctx.fillStyle = '#8ee08a';
  ctx.font = '700 24px system-ui, sans-serif';
  ctx.fillText(`$${Math.floor(p.cash)}`, 26, 44);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '600 10px system-ui, sans-serif';
  ctx.fillText('NICO FERRER — BAHIA VERDE', 26, 60);
  // Health bar under the cash.
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(ctx, 26, 66, 184, 7, 3);
  ctx.fill();
  ctx.fillStyle = p.health > 30 ? '#06d6a0' : '#ef476f';
  roundRect(ctx, 26, 66, Math.max(0, 184 * (p.health / 100)), 7, 3);
  ctx.fill();

  // Wanted stars, top-right. They flash while the police can see him.
  const stars = game.wanted.stars;
  if (stars > 0) {
    const flash = game.wanted.seen && Math.sin(game.time * 6) > 0;
    ctx.font = '26px system-ui, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i < 5; i++) {
      const on = i < stars;
      ctx.fillStyle = on ? (flash ? '#ffd23f' : '#ffb703') : 'rgba(255,255,255,0.25)';
      ctx.fillText('★', w - 20 - (4 - i) * 30, 44);
    }
    ctx.textAlign = 'left';
  }

  drawObjective(ctx, game, w);
  drawWeapon(ctx, game, h);
  drawMinimap(ctx, game, w, h);
  drawDialogue(ctx, game, w, h);
  drawMessage(ctx, game, w, h);

  // Context prompt, bottom-centre.
  if (game.promptText) {
    ctx.font = '600 15px system-ui, sans-serif';
    const tw = ctx.measureText(game.promptText).width + 28;
    panel(ctx, w / 2 - tw / 2, h - 118, tw, 30, 0.65);
    ctx.fillStyle = '#ffe9a8';
    ctx.textAlign = 'center';
    ctx.fillText(game.promptText, w / 2, h - 97);
    ctx.textAlign = 'left';
  }

  // The bust meter: a red bar that fills while the law has him cornered.
  if (p.bustMeter > 0.02) {
    const bw = 260;
    panel(ctx, w / 2 - bw / 2 - 10, h / 2 - 90, bw + 20, 44, 0.7);
    ctx.fillStyle = '#ef476f';
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED?', w / 2, h / 2 - 66);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    roundRect(ctx, w / 2 - bw / 2, h / 2 - 62, bw, 8, 4);
    ctx.fill();
    ctx.fillStyle = '#ef476f';
    roundRect(ctx, w / 2 - bw / 2, h / 2 - 62, bw * Math.min(1, p.bustMeter), 8, 4);
    ctx.fill();
    ctx.textAlign = 'left';
  }
}

function drawObjective(ctx, game, w) {
  const ms = game.missions;
  const text = objectiveText(game);
  if (!text) return;
  const title = ms.phase === 'active' && ms.current ? ms.current.title : (ms.storyComplete ? 'Free Roam' : 'Next Job');
  ctx.font = '700 12px system-ui, sans-serif';
  const titleW = ctx.measureText(title.toUpperCase()).width;
  ctx.font = '600 15px system-ui, sans-serif';
  const textW = ctx.measureText(text).width;
  const bw = Math.max(titleW, textW) + 36;
  panel(ctx, w / 2 - bw / 2, 14, bw, 52, 0.55);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23f';
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.fillText(title.toUpperCase(), w / 2, 33);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 15px system-ui, sans-serif';
  ctx.fillText(text, w / 2, 55);
  // Mission timer, when a step is against the clock.
  const step = currentStep(game);
  if (step && (step.type === 'timerGoto' || step.type === 'checkpoints')) {
    const left = Math.max(0, game.missions.timer);
    const label = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.fillStyle = left < 20 ? '#ef476f' : '#ffffff';
    ctx.fillText(label, w / 2, 88);
  }
  ctx.textAlign = 'left';
}

function drawWeapon(ctx, game, h) {
  const p = game.player;
  panel(ctx, 14, h - 74, 208, 60);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '600 10px system-ui, sans-serif';
  if (p.inCar) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 17px system-ui, sans-serif';
    ctx.fillText(`${Math.round(Math.abs(p.inCar.speed) * 0.36)} km/h`, 26, h - 48);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillText('VEHICLE CONDITION', 26, h - 30);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(ctx, 130, h - 38, 80, 6, 3);
    ctx.fill();
    ctx.fillStyle = p.inCar.health > 35 ? '#06d6a0' : '#ef476f';
    roundRect(ctx, 130, h - 38, 80 * Math.max(0, p.inCar.health / p.inCar.maxHealth), 6, 3);
    ctx.fill();
  } else if (p.weapon === 'pistol' && p.hasPistol) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 17px system-ui, sans-serif';
    ctx.fillText(`PISTOL  ${p.ammo} / ${p.reserveAmmo}`, 26, h - 48);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillText(p.reloadLeft > 0 ? 'RELOADING…' : 'CLICK / SPACE TO SHOOT — R RELOAD — Q SWAP', 26, h - 30);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 17px system-ui, sans-serif';
    ctx.fillText('FISTS', 26, h - 48);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillText(p.hasPistol ? 'CLICK / SPACE TO PUNCH — Q FOR PISTOL' : 'CLICK / SPACE TO PUNCH', 26, h - 30);
  }
}

function drawMinimap(ctx, game, w, h) {
  const mw = 208;
  const mh = 156;
  const mx = w - mw - 14;
  const my = h - mh - 14;
  const sx = mw / WORLD.width;
  const sy = mh / WORLD.height;
  panel(ctx, mx - 4, my - 4, mw + 8, mh + 8, 0.6);
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, mx, my, mw, mh, 6);
  ctx.clip();
  // Land, sand, water.
  ctx.fillStyle = '#5d8a48';
  ctx.fillRect(mx, my, mw, mh);
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(mx, my + WORLD.sandY * sy, mw, (WORLD.waterY - WORLD.sandY) * sy);
  ctx.fillStyle = COLORS.water;
  ctx.fillRect(mx, my + WORLD.waterY * sy, mw, mh - WORLD.waterY * sy);
  // Roads.
  ctx.strokeStyle = 'rgba(240,240,230,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const ax of AVENUES) {
    ctx.moveTo(mx + ax * sx, my + 240 * sy);
    ctx.lineTo(mx + ax * sx, my + 2390 * sy);
  }
  for (const syLine of STREETS) {
    ctx.moveTo(mx + 234 * sx, my + syLine * sy);
    ctx.lineTo(mx + 3566 * sx, my + syLine * sy);
  }
  ctx.stroke();

  const blip = (x, y, color, size) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(mx + x * sx, my + y * sy, size, 0, Math.PI * 2);
    ctx.fill();
  };
  // Police first (under the target), then the mission target, then Nico.
  for (const car of game.vehicles) {
    if (car.driver === 'police') blip(car.x, car.y, Math.sin(game.time * 9) > 0 ? '#4da3ff' : '#ff5a4e', 3);
  }
  for (const o of game.officers) blip(o.x, o.y, '#4da3ff', 2.2);
  const step = currentStep(game);
  const target = step ? game.stepTargetPos : missionStartMarker(game);
  if (target) {
    const pulse = 3.4 + Math.sin(game.time * 5) * 0.9;
    ctx.fillStyle = COLORS.marker;
    ctx.save();
    ctx.translate(mx + target.x * sx, my + target.y * sy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-pulse / 1.4, -pulse / 1.4, pulse * 1.4, pulse * 1.4);
    ctx.restore();
  }
  // Player arrow.
  const p = game.player;
  ctx.save();
  ctx.translate(mx + p.x * sx, my + p.y * sy);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, -3.6);
  ctx.lineTo(-4, 3.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '600 9px system-ui, sans-serif';
  ctx.fillText('BAHIA VERDE', mx + 6, my + mh - 6);
}

function drawDialogue(ctx, game, w, h) {
  const line = game.dialogue[0];
  if (!line) return;
  const bw = Math.min(620, w - 80);
  panel(ctx, w / 2 - bw / 2, h - 168, bw, 46, 0.72);
  ctx.fillStyle = '#ffd23f';
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.fillText(line.speaker, w / 2 - bw / 2 + 14, h - 146);
  ctx.fillStyle = '#ffffff';
  ctx.font = '15px system-ui, sans-serif';
  wrapText(ctx, line.text, w / 2 - bw / 2 + 14, h - 128, bw - 28, 17);
}

function drawMessage(ctx, game, w, h) {
  const msg = game.message;
  if (!msg || msg.ttl <= 0) return;
  ctx.font = '700 17px system-ui, sans-serif';
  const tw = ctx.measureText(msg.text).width + 34;
  panel(ctx, w / 2 - tw / 2, h / 2 + 96, tw, 34, 0.6);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(msg.text, w / 2, h / 2 + 119);
  ctx.textAlign = 'left';
}

export function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}
