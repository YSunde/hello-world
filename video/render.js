/*
 * КБ-13 · видео-визитка: детерминированный таймлайн.
 * window.renderFrame(t) рисует кадр в момент t (секунды); scripts/render-video.mjs снимает кадры и собирает MP4.
 */
import { LightningField, brandWaypoints } from '../assets/js/lightning.js';

export const DURATION = 24.5;
export const FPS = 30;

const $ = (id) => document.getElementById(id);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/* сцены и склейки (каждая склейка — разряд через весь кадр + вспышка) */
const SCENES = [
  ['sA', 0, 3.1],
  ['sB', 3.1, 7.3],
  ['sC', 7.3, 11.6],
  ['sD', 11.6, 16.0],
  ['sE', 16.0, 20.2],
  ['sF', 20.2, DURATION],
];
const CUTS = SCENES.slice(1).map((s) => s[1]);
/* моменты ударов — для звука */
export const STRIKES = [0.3, 7.55, 14.05, 16.45, 20.45];

async function inlineLogo(el) {
  const svg = await (await fetch('../assets/brand/logo.svg')).text();
  el.innerHTML = svg
    .replace(/<\?xml[^>]*>/, '')
    .replace(/<defs>[\s\S]*?<\/defs>/, '')
    .replace(/class="cls-1"/g, 'class="logo-ink"')
    .replace(/class="cls-2"/g, 'class="logo-bolt"');
}

const F = {};
async function setup() {
  await Promise.all([inlineLogo($('logoA')), inlineLogo($('logoF')), document.fonts.ready]);
  await Promise.all([...document.images].map((im) => im.decode().catch(() => {})));
  const base = { dpr: 1, reveal: 0, widthRef: 900, minW: 0.8, maxW: 1.6 };
  F.A = new LightningField($('fA'), { ...base, seed: 13, waypoints: () => brandWaypoints([0.06, 0.94], [0.94, 0.06]), branches: 6, sub: 1, twigs: 0, width: 6, reach: 0.18, step: 0.06, jag: 0.6, rest: 0.95 });
  F.C = new LightningField($('fC'), { ...base, seed: 29, waypoints: () => brandWaypoints([0.03, 0.985], [0.985, 0.02]), branches: 5, sub: 1, twigs: 0, width: 6, reach: 0.2, step: 0.06, jag: 0.6, rest: 0.93 });
  F.D = new LightningField($('fD'), { ...base, seed: 17, waypoints: () => brandWaypoints([0.724, 0.486], [0.07, 0.95]), branches: 5, sub: 1, twigs: 0, width: 5, reach: 0.18, step: 0.06, jag: 0.6, rest: 0.93 });
  F.E = new LightningField($('fE'), { ...base, seed: 23, waypoints: () => brandWaypoints([0.12, 0.71], [0.98, 0.04]), branches: 4, sub: 1, twigs: 0, width: 4.5, widthRef: 420, reach: 0.22, step: 0.08, jag: 0.6, rest: 0.92 });
  F.F = new LightningField($('fF'), { ...base, seed: 5, waypoints: [[0, 0.55], [0.3, 0.38], [0.62, 0.6], [1, 0.4]], branches: 8, sub: 1, twigs: 0, width: 3.8, widthRef: 150, minW: 1, maxW: 1.4, reach: 0.1, spread: 1.2, step: 0.05, rest: 0.9 });
  F.Cut = new LightningField($('fCut'), { ...base, seed: 101, waypoints: () => brandWaypoints([-0.02, 1.02], [1.02, -0.02]), branches: 5, sub: 0, twigs: 0, width: 6, reach: 0.16, step: 0.06, jag: 0.6, rest: 0 });
}

/* разряд: до ts — пусто; затем лидер, удар, мерцание, «застывание»; опционально гаснет */
function bolt(f, t, ts, { leader = 160, to = 1, flash = true, out = null } = {}) {
  const el = (t - ts) * 1000;
  if (el < 0) {
    f.reveal = 0;
    f.heat = 0;
    f.draw();
    return;
  }
  f.frame(el, { from: 0, to, leader, flash, rest: f.o.rest });
  if (out) {
    const k = 1 - prog(t, out[0], out[1]);
    f.intensity *= k;
    f.flash *= k;
    f.draw();
  }
}

const wipe = (el, p) => {
  const e = easeOut(p);
  el.style.clipPath = `polygon(0 -20%, ${e * 140}% -20%, ${e * 140 - 40}% 120%, 0 120%)`;
};
const fadeUp = (el, p, dy = 18) => {
  const e = easeOut(p);
  el.style.opacity = e;
  el.style.transform = `translateY(${(1 - e) * dy}px)`;
};
const draw = (svg, p, stagger = 0.18) => {
  const paths = svg.querySelectorAll('path');
  paths.forEach((path, i) => {
    const q = clamp(p * (1 + stagger * (paths.length - 1)) - i * stagger);
    path.style.strokeDasharray = '1';
    path.style.strokeDashoffset = String(1 - easeOut(q));
  });
};

window.renderFrame = (t) => {
  for (const [id, a, b] of SCENES) $(id).classList.toggle('on', t >= a && t < b);

  // A — разряд по фирменной диагонали, затем знак КБ13
  if (t < 3.1) {
    bolt(F.A, t, 0.3, { leader: 260, out: [1.6, 2.6] });
    const lp = prog(t, 1.25, 1.9);
    $('logoA').style.opacity = easeOut(lp);
    $('logoA').style.transform = `scale(${0.94 + 0.06 * easeOut(lp)})`;
  }
  // B — внимание: камера въезжает, метка фокуса защёлкивается
  if (t >= 3.1 && t < 7.3) {
    wipe($('tB'), prog(t, 3.25, 3.85));
    fadeUp($('pB'), prog(t, 3.8, 4.4));
    const cp = easeOut(prog(t, 3.2, 4.1));
    $('camB').style.transform = `translateX(${(1 - cp) * 120}px)`;
    $('camB').style.opacity = cp;
    const fp = prog(t, 4.3, 4.65);
    $('focusB').style.opacity = fp > 0 ? 1 : 0;
    $('focusB').style.transformOrigin = '1360px 670px';
    $('focusB').style.transform = `scale(${1.25 - 0.25 * easeOut(fp)})`;
    $('recB').style.opacity = t > 4.6 && Math.floor((t - 4.6) * 1.6) % 2 === 0 ? 1 : 0;
  }
  // C — человек с табличкой, разряд за фигурой
  if (t >= 7.3 && t < 11.6) {
    wipe($('tC'), prog(t, 7.4, 8.0));
    fadeUp($('pC'), prog(t, 8.1, 8.6));
    bolt(F.C, t, 7.55, { leader: 240 });
    $('plC').style.transform = `translateY(${-14 * prog(t, 7.3, 11.6)}px)`;
    draw($('ddC'), prog(t, 8.7, 9.6));
  }
  // D — карандаш «выпускает» разряд: рост 1.6 c, затем удар
  if (t >= 11.6 && t < 16.0) {
    wipe($('tD'), prog(t, 11.7, 12.3));
    fadeUp($('pD'), prog(t, 12.3, 12.8));
    fadeUp($('sD2'), prog(t, 12.7, 13.2));
    const g = prog(t, 12.4, 14.05);
    const f = F.D;
    if (t < 14.05) {
      f.reveal = easeInOut(g) * 0.999;
      f.intensity = 0.62 + 0.08 * Math.sin(t * 40);
      f.heat = g > 0 ? 1 : 0;
      f.flash = 0;
      f.draw();
    } else bolt(f, t, 14.05, { leader: 0 });
    const j = t < 14.05 && g > 0 ? 1 : 0;
    $('handD').style.transform = `translate(${j * Math.sin(t * 31) * 1.6}px, ${j * Math.cos(t * 27) * 1.4}px)`;
  }
  // E — давай дружить: «звонок» и разряд от трубки
  if (t >= 16.0 && t < 20.2) {
    wipe($('tE'), prog(t, 16.1, 16.6));
    fadeUp($('pE'), prog(t, 16.6, 17.1));
    draw($('ddE'), prog(t, 16.3, 16.9));
    const ring = t > 16.9 ? 0.55 + 0.45 * Math.abs(Math.sin((t - 16.9) * 5)) : 1;
    $('ddE').style.opacity = ring;
    bolt(F.E, t, 16.45, { leader: 200 });
  }
  // F — финал: паутина разряда, знак, направления
  if (t >= 20.2) {
    bolt(F.F, t, 20.45, { leader: 220 });
    const lp = prog(t, 20.9, 21.6);
    $('logoF').style.opacity = easeOut(lp);
    $('logoF').style.transform = `scale(${0.95 + 0.05 * easeOut(lp)})`;
    fadeUp($('topF'), prog(t, 21.6, 22.3));
  }

  // склейки: разряд через кадр + вспышка бумаги
  let cutField = false;
  let flash = 0;
  for (const c of CUTS) {
    if (t >= c - 0.22 && t < c + 0.3) {
      F.Cut.build(101 + Math.round(c * 10));
      bolt(F.Cut, t, c - 0.22, { leader: 110, flash: true, out: [c + 0.05, c + 0.3] });
      cutField = true;
    }
    const d = Math.abs(t - c);
    flash = Math.max(flash, clamp(1 - d / 0.14) * 0.88);
  }
  if (!cutField) {
    F.Cut.reveal = 0;
    F.Cut.draw();
  }
  $('flash').style.opacity = flash;
  let tint = 0;
  for (const s of STRIKES) tint = Math.max(tint, clamp(1 - Math.abs(t - s - 0.18) / 0.25));
  $('tint').style.opacity = tint;
};

window.ready = setup();
