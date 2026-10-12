/* КБ-13 · собрано scripts/bundle.mjs из assets/js/*.js — не править вручную */
(() => {
const __kb_lightning_1 = (() => {
'use strict';
/*
 * КБ-13 · «Разряд»
 * Процедурная реалистичная молния для светлого фона.
 *
 * Геометрия: главный канал идёт через опорные точки фирменного знака
 * (brand/icon.svg: диагональ снизу-слева вверх-вправо с двумя изломами),
 * поверх — фрактальное смещение средней точки и ветвление 2–3 уровней.
 * Отрисовка: слоистый «трубчатый» штрих (бордовый край → красное тело →
 * горячая середина → почти белое ядро) + отдельный размытый слой свечения,
 * который на бумаге читается как розовый ореол.
 *
 * Без зависимостей. Декоративный слой: canvas aria-hidden, pointer-events: none.
 */

/* ---------- случайность ---------- */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rand) {
  return (rand() + rand() + rand() + rand() - 2) * 1.732;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

/* Опорные точки фирменного знака: центральная линия icon.svg (viewBox 2000×1278),
   y сверху вниз. Короткие вертикальные «ступеньки» на x=647 и x=1178 — изломы знака. */
const BRAND_PATH = [
  [0, 1],
  [0.3235, 0.665],
  [0.3235, 0.585],
  [0.589, 0.437],
  [0.589, 0.35],
  [1, 0],
];

/* Перенос опорных точек знака в прямоугольник поля: from/to — концы диагонали. */
function brandWaypoints(from, to, { steps = true } = {}) {
  const pts = steps ? BRAND_PATH : [BRAND_PATH[0], [0.3235, 0.625], [0.589, 0.393], BRAND_PATH[5]];
  return pts.map(([u, v]) => [lerp(from[0], to[0], u), lerp(from[1], to[1], 1 - v)]);
}

/* ---------- генерация ---------- */

function subdivide(ax, ay, bx, by, disp, minLen, decay, rand, out) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len <= minLen) {
    out.push(bx, by);
    return;
  }
  const nx = -dy / len;
  const ny = dx / len;
  const off = gauss(rand) * disp;
  const along = (rand() - 0.5) * 0.14;
  const mx = ax + dx * (0.5 + along) + nx * off;
  const my = ay + dy * (0.5 + along) + ny * off;
  subdivide(ax, ay, mx, my, disp * decay, minLen, decay, rand, out);
  subdivide(mx, my, bx, by, disp * decay, minLen, decay, rand, out);
}

/* Канал между опорными точками: угловатое «ступенчатое» блуждание к цели
   (характерный зигзаг лидера) + мелкие изломы смещением средней точки. */
function channel(points, rough, minLen, decay, rand, step = 0.034, jag = 0.62) {
  const out = [points[0][0], points[0][1]];
  for (let i = 1; i < points.length; i++) {
    let [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const total = Math.hypot(bx - ax, by - ay);
    const st = Math.min(step, total / 2.2);
    let guard = 0;
    while (guard++ < 400) {
      const dx = bx - ax;
      const dy = by - ay;
      const d = Math.hypot(dx, dy);
      if (d <= st * 1.3) break;
      // чем ближе к цели, тем сильнее притяжение
      const pull = 1 - Math.min(1, d / total);
      // отклонение не больше ±63°: без петель и шагов назад
      const ang = Math.atan2(dy, dx) + clamp(gauss(rand) * jag * (1 - pull * 0.65), -1.1, 1.1);
      const len = st * (0.45 + rand() * 1.1);
      const nx = ax + Math.cos(ang) * len;
      const ny = ay + Math.sin(ang) * len;
      subdivide(ax, ay, nx, ny, len * rough, minLen, decay, rand, out);
      ax = nx;
      ay = ny;
    }
    subdivide(ax, ay, bx, by, Math.hypot(bx - ax, by - ay) * rough, minLen, decay, rand, out);
  }
  return out;
}

function makeBranch(pts, t0, w0, w1, depth, alpha) {
  const n = pts.length / 2;
  const t = new Float32Array(n);
  const w = new Float32Array(n);
  let acc = t0;
  t[0] = t0;
  for (let i = 1; i < n; i++) {
    acc += Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
    t[i] = acc;
  }
  const span = Math.max(1e-6, acc - t0);
  for (let i = 0; i < n; i++) w[i] = lerp(w0, w1, (t[i] - t0) / span);
  return { pts: new Float32Array(pts), t, w, depth, alpha, len: span };
}

/**
 * Генерирует дерево разряда в изотропном пространстве: x ∈ [0, aspect], y ∈ [0, 1].
 * @param {object} o
 *  waypoints — опорные точки в долях поля [[x,y], …] (x,y ∈ 0..1)
 *  aspect — ширина/высота поля
 *  seed, rough (смещение главного канала), minSeg (длина сегмента),
 *  branches, sub, twigs — число ветвей 1-го уровня, на ветвь, на подветвь
 *  spread — максимальный угол ветвей (рад), reach — длина ветвей относительно канала
 *  width — толщина главного канала (px при scale=1)
 */
function generateBolt(o) {
  const rand = mulberry32(o.seed ?? 13);
  const aspect = o.aspect ?? 1;
  const minSeg = o.minSeg ?? 0.011;
  const rough = o.rough ?? 0.1;
  const decay = o.decay ?? 0.56;
  const width = o.width ?? 4;
  const spread = o.spread ?? 0.95;
  const reach = o.reach ?? 0.24;
  const wp = o.waypoints.map(([x, y]) => [x * aspect, y]);

  const branches = [];
  const main = makeBranch(channel(wp, rough, minSeg, decay, rand, o.step ?? 0.042, o.jag ?? 0.55), 0, width, width * (o.taper ?? 0.62), 0, 1);
  // лёгкая пульсация толщины главного канала
  for (let i = 0; i < main.w.length; i++) main.w[i] *= 0.86 + rand() * 0.28;
  branches.push(main);

  const spawn = (parent, count, depth, lenK) => {
    const n = parent.t.length;
    if (n < 8) return;
    for (let k = 0; k < count; k++) {
      const u = 0.06 + rand() * 0.86;
      const i = clamp(Math.floor(u * (n - 1)), 3, n - 4);
      const px = parent.pts[i * 2];
      const py = parent.pts[i * 2 + 1];
      const qx = parent.pts[(i + 3) * 2] - parent.pts[(i - 3) * 2];
      const qy = parent.pts[(i + 3) * 2 + 1] - parent.pts[(i - 3) * 2 + 1];
      const base = Math.atan2(qy, qx);
      const side = (k + (depth === 1 ? 0 : 1)) % 2 === 0 ? 1 : -1;
      const ang = base + side * (0.22 + rand() * spread * (depth > 1 ? 0.9 : 0.75));
      const L = parent.len * lenK * (0.35 + rand() * 0.75) * (1 - u * 0.35);
      const mx = px + Math.cos(ang) * L * 0.5 + gauss(rand) * L * 0.08;
      const my = py + Math.sin(ang) * L * 0.5 + gauss(rand) * L * 0.08;
      const ex = px + Math.cos(ang + gauss(rand) * 0.18) * L;
      const ey = py + Math.sin(ang + gauss(rand) * 0.18) * L;
      const pts = channel(
        [
          [px, py],
          [mx, my],
          [ex, ey],
        ],
        rough * 1.3,
        minSeg * 0.8,
        decay,
        rand,
        (o.step ?? 0.042) * (depth === 1 ? 0.62 : 0.45),
        (o.jag ?? 0.55) * 1.15
      );
      const w0 = parent.w[i] * (depth === 1 ? 0.42 + rand() * 0.16 : 0.5 + rand() * 0.15);
      const br = makeBranch(pts, parent.t[i], w0, w0 * 0.18, depth, depth === 1 ? 0.92 : depth === 2 ? 0.7 : 0.5);
      branches.push(br);
      if (depth === 1 && o.sub) spawn(br, Math.round(o.sub * (0.5 + rand())), 2, 0.55);
      else if (depth === 2 && o.twigs) spawn(br, Math.round(o.twigs * rand() * 1.6), 3, 0.5);
    }
  };
  spawn(main, o.branches ?? 8, 1, reach);

  // нормализация времени прихода фронта (0..1)
  let maxT = 0;
  for (const b of branches) maxT = Math.max(maxT, b.t[b.t.length - 1]);
  const mainEnd = main.t[main.t.length - 1] / maxT;
  for (const b of branches) for (let i = 0; i < b.t.length; i++) b.t[i] /= maxT;

  // рамка для вспышки
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < main.pts.length; i += 2) {
    x0 = Math.min(x0, main.pts[i]);
    x1 = Math.max(x1, main.pts[i]);
    y0 = Math.min(y0, main.pts[i + 1]);
    y1 = Math.max(y1, main.pts[i + 1]);
  }
  return { branches, aspect, mainEnd, bbox: [x0, y0, x1, y1] };
}

/* ---------- отрисовка ---------- */

/* Слои «трубки» на светлом фоне. mul — множитель толщины, a — непрозрачность. */
const LAYERS = [
  { key: 'body', color: [255, 30, 22], mul: 2.1, a: 0.95, add: 0.8 },
  { key: 'hot', color: [255, 150, 132], mul: 1.25, a: 0.95, add: 0.3, min: 1 },
  { key: 'core', color: [255, 255, 255], mul: 0.72, a: 1, add: 0.2, min: 1.2 },
];

const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a < 0 ? 0 : a > 1 ? 1 : a})`;

function drawBolt(ctx, bolt, s) {
  // s: { scale (px на единицу высоты), ox, oy, ws (масштаб толщины), reveal, intensity, heat, heatLen, glowCtx, glowScale, flash, layers }
  const reveal = s.reveal ?? 1;
  if (reveal <= 0) return;
  const I = s.intensity ?? 1;
  const over = Math.max(0, I - 1);
  const k = s.scale;
  const ox = s.ox || 0;
  const oy = s.oy || 0;
  const ws = s.ws ?? 1;
  const heat = s.heat || 0;
  const heatLen = s.heatLen ?? 0.08;

  const buckets = new Map();
  const hot = heat > 0.01 ? new Path2D() : null;

  for (const b of bolt.branches) {
    const { pts, t, w } = b;
    const n = t.length;
    for (let i = 0; i < n - 1; i++) {
      const t1 = t[i];
      if (t1 >= reveal) break;
      let t2 = t[i + 1];
      let x2 = pts[i * 2 + 2];
      let y2 = pts[i * 2 + 3];
      const x1 = pts[i * 2];
      const y1 = pts[i * 2 + 1];
      if (t2 > reveal) {
        const f = (reveal - t1) / (t2 - t1);
        x2 = x1 + (x2 - x1) * f;
        y2 = y1 + (y2 - y1) * f;
        t2 = reveal;
      }
      // затухание к кончику ветви
      const along = b.depth === 0 ? 1 : 1 - 0.55 * ((t1 - t[0]) / Math.max(1e-6, t[n - 1] - t[0]));
      const wq = Math.max(0.5, Math.round(w[i] * ws * 4) / 4);
      const aq = Math.round(b.alpha * along * 10) / 10;
      const key = wq * 100 + aq;
      let p = buckets.get(key);
      if (!p) {
        p = { path: new Path2D(), w: wq, a: aq };
        buckets.set(key, p);
      }
      p.path.moveTo(ox + x1 * k, oy + y1 * k);
      p.path.lineTo(ox + x2 * k, oy + y2 * k);
      if (hot && reveal - t2 < heatLen) {
        hot.moveTo(ox + x1 * k, oy + y1 * k);
        hot.lineTo(ox + x2 * k, oy + y2 * k);
      }
    }
  }

  // свечение: ближний (узкое размытие) и дальний (широкое) ореолы — отдельные canvas
  const glowPass = (g, widthK, widthAdd, alpha) => {
    const gs = s.glowScale ?? 1;
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.setTransform(gs, 0, 0, gs, 0, 0);
    for (const p of buckets.values()) {
      g.lineWidth = p.w * widthK + widthAdd;
      g.strokeStyle = rgba([242, 13, 13], alpha * p.a * Math.min(1.7, I) * (s.glow ?? 1));
      g.stroke(p.path);
    }
    g.restore();
  };
  if (s.nearCtx) glowPass(s.nearCtx, 2.6, 2, 0.34);
  const g = s.glowCtx;
  if (g) {
    glowPass(g, 5.5, 8, 0.17);
    if (s.flash > 0.01) {
      const gs = s.glowScale ?? 1;
      const [bx0, by0, bx1, by1] = bolt.bbox;
      const cx = (ox + ((bx0 + bx1) / 2) * k) * gs;
      const cy = (oy + ((by0 + by1) / 2) * k) * gs;
      const r = Math.max(bx1 - bx0, by1 - by0) * k * 0.62 * gs;
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, rgba([242, 13, 13], 0.12 * s.flash));
      grad.addColorStop(1, rgba([242, 13, 13], 0));
      g.fillStyle = grad;
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const layers = s.layers || LAYERS;
  for (const L of layers) {
    for (const p of buckets.values()) {
      const wpx = p.w * (1 + over * 0.7);
      if (L.min && wpx < L.min) continue;
      ctx.lineWidth = wpx * L.mul + L.add;
      let a = L.a * p.a;
      if (L.key === 'core' || L.key === 'hot') a *= clamp(I * 1.05, 0, 1);
      else a *= clamp(I, 0, 1);
      ctx.strokeStyle = rgba(L.color, a);
      ctx.stroke(p.path);
    }
  }
  if (hot) {
    ctx.lineWidth = 3.2 * ws + 1;
    ctx.strokeStyle = rgba([255, 60, 48], 0.55 * heat);
    ctx.stroke(hot);
    ctx.lineWidth = 1.3 * ws + 0.4;
    ctx.strokeStyle = rgba([255, 250, 246], 0.95 * heat);
    ctx.stroke(hot);
  }
  ctx.restore();
}

/* Кривые интенсивности удара: [мс, значение] */
const STRIKE_I = [
  [0, 1.45],
  [55, 0.5],
  [105, 1.2],
  [165, 0.62],
  [235, 1.02],
  [330, 0.78],
  [470, 0.9],
];
const STRIKE_FLASH = [
  [0, 1],
  [55, 0.25],
  [105, 0.75],
  [165, 0.2],
  [235, 0.45],
  [330, 0.1],
  [470, 0],
];

function curve(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      return lerp(y0, y1, (x - x0) / (x1 - x0));
    }
  }
  return points[points.length - 1][1];
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/* Время в ms: performance.now, но может подменяться при покадровом рендере видео. */
const clock = { now: () => performance.now() };

/**
 * Поле молнии внутри host-элемента: два canvas (свечение + канал).
 * opts: generateBolt-опции + { rest, glow, flash, dpr, glowBlur, reveal, widthRef }
 */
class LightningField {
  constructor(host, opts) {
    this.host = host;
    this.o = Object.assign(
      { rest: 0.9, glow: 1, flash: true, reveal: 0, widthRef: 820, minW: 0.55, maxW: 1.35 },
      opts
    );
    this.reveal = this.o.reveal;
    this.intensity = this.o.rest;
    this.flash = 0;
    this.heat = 0;
    this.visible = true;
    this.seed = this.o.seed ?? 13;
    this.raf = 0;
    this.anim = null;

    const mk = (cls) => {
      const c = document.createElement('canvas');
      c.className = cls;
      c.setAttribute('aria-hidden', 'true');
      host.appendChild(c);
      return c;
    };
    this.glowCanvas = this.o.glow ? mk('kb-bolt__glow') : null;
    this.nearCanvas = this.o.glow ? mk('kb-bolt__near') : null;
    this.canvas = mk('kb-bolt__core');
    this.nctx = this.nearCanvas ? this.nearCanvas.getContext('2d') : null;
    this.ctx = this.canvas.getContext('2d');
    this.gctx = this.glowCanvas ? this.glowCanvas.getContext('2d') : null;

    this.resize = this.resize.bind(this);
    if ('ResizeObserver' in window) {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(host);
    }
    this.resize();
  }

  resize() {
    const r = this.host.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w === this.w && h === this.h) return;
    const dpr = Math.min(this.o.dpr ?? window.devicePixelRatio ?? 1, 2);
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    if (this.glowCanvas) {
      this.gdpr = 0.5;
      this.glowCanvas.width = Math.max(1, Math.round(w * this.gdpr));
      this.glowCanvas.height = Math.max(1, Math.round(h * this.gdpr));
      this.nearCanvas.width = this.glowCanvas.width;
      this.nearCanvas.height = this.glowCanvas.height;
    }
    const aspect = w / h;
    if (!this.bolt || Math.abs(aspect - this.bolt.aspect) / aspect > 0.03) this.build();
    this.draw();
  }

  build(seed) {
    if (seed != null) this.seed = seed;
    const aspect = this.w / this.h;
    const wp = typeof this.o.waypoints === 'function' ? this.o.waypoints(aspect) : this.o.waypoints;
    this.bolt = generateBolt(Object.assign({}, this.o, { seed: this.seed, aspect, waypoints: wp }));
  }

  draw() {
    const { ctx, gctx } = this;
    if (!ctx || !this.bolt) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (gctx) {
      gctx.setTransform(1, 0, 0, 1, 0, 0);
      gctx.clearRect(0, 0, this.glowCanvas.width, this.glowCanvas.height);
      this.nctx.setTransform(1, 0, 0, 1, 0, 0);
      this.nctx.clearRect(0, 0, this.nearCanvas.width, this.nearCanvas.height);
    }
    const ws = clamp(this.h / this.o.widthRef, this.o.minW, this.o.maxW);
    drawBolt(ctx, this.bolt, {
      scale: this.h * this.dpr,
      ws: ws * this.dpr,
      reveal: this.reveal,
      intensity: this.intensity,
      heat: this.heat,
      glowCtx: gctx,
      nearCtx: this.nctx,
      glowScale: this.gdpr / this.dpr,
      glow: this.o.glow,
      flash: this.o.flash ? this.flash : 0,
    });
  }

  /* Прогресс прокрутки: раскрытие с «горячим» фронтом, который остывает за ~0.4 с. */
  setReveal(r, { heat = true } = {}) {
    r = clamp(r, 0, 1);
    if (Math.abs(r - this.reveal) < 0.0005) return;
    const grow = r > this.reveal;
    this.reveal = r;
    if (this.anim) return; // во время удара прогресс применится на следующем кадре
    if (heat && grow) {
      this.heat = 1;
      this.jitter = true;
      this.cool();
    } else {
      this.heat = 0;
      this.draw();
    }
  }

  cool() {
    if (this.raf) return;
    let last = clock.now();
    const step = () => {
      const now = clock.now();
      const dt = now - last;
      last = now;
      this.heat = Math.max(0, this.heat - dt / 420);
      this.intensity = this.o.rest * (this.heat > 0 ? 0.94 + Math.random() * 0.1 : 1);
      this.draw();
      if (this.heat > 0 && !this.anim) this.raf = requestAnimationFrame(step);
      else {
        this.raf = 0;
        this.intensity = this.o.rest;
        this.draw();
      }
    };
    this.raf = requestAnimationFrame(step);
  }

  /* Однократный удар: лидер → обратный удар → 2–3 мерцания → застывший разряд. */
  strike({ from = 0, to = 1, leader = 150, flash = true, seed } = {}) {
    if (seed != null) this.build(seed);
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    const t0 = clock.now();
    const total = leader + 470;
    const rest = this.o.rest;
    return new Promise((resolve) => {
      this.anim = { resolve };
      const step = () => {
        const el = clock.now() - t0;
        this.frame(el, { from, to, leader, flash, rest });
        if (el < total) this.raf = requestAnimationFrame(step);
        else {
          this.raf = 0;
          this.anim = null;
          this.heat = 0;
          this.flash = 0;
          this.intensity = rest;
          this.draw();
          resolve();
        }
      };
      this.raf = requestAnimationFrame(step);
    });
  }

  /* Состояние удара в момент el (мс) — используется и анимацией, и покадровым рендером. */
  frame(el, { from = 0, to = 1, leader = 150, flash = true, rest = this.o.rest } = {}) {
    if (el < leader) {
      const t = easeOut(el / leader);
      this.reveal = lerp(from, to, t);
      this.intensity = 0.42 + 0.2 * Math.random();
      this.heat = 1;
      this.flash = 0;
    } else {
      const k = el - leader;
      this.reveal = Math.max(this.reveal, to);
      const tail = clamp((k - 330) / 140, 0, 1);
      this.intensity = lerp(curve(STRIKE_I, k), rest, tail);
      this.flash = flash ? curve(STRIKE_FLASH, k) : 0;
      this.heat = Math.max(0, 1 - k / 160);
    }
    this.draw();
  }

  /* Прервать удар (например, пользователь прокрутил обратно) и остаться в текущем раскрытии. */
  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    const a = this.anim;
    this.anim = null;
    this.heat = 0;
    this.flash = 0;
    this.intensity = this.o.rest;
    this.draw();
    a?.resolve?.();
  }

  /* Мгновенно показать конечное состояние (reduced motion / без анимации). */
  settle(r = 1) {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.anim = null;
    this.reveal = r;
    this.intensity = this.o.rest;
    this.heat = 0;
    this.flash = 0;
    this.draw();
  }

  fade(ms = 160) {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    const t0 = clock.now();
    const i0 = this.intensity;
    return new Promise((resolve) => {
      const step = () => {
        const t = clamp((clock.now() - t0) / ms, 0, 1);
        this.intensity = i0 * (1 - t);
        this.draw();
        if (t < 1) this.raf = requestAnimationFrame(step);
        else {
          this.raf = 0;
          this.reveal = 0;
          resolve();
        }
      };
      this.raf = requestAnimationFrame(step);
    });
  }

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.ro) this.ro.disconnect();
    this.canvas.remove();
    if (this.glowCanvas) this.glowCanvas.remove();
    if (this.nearCanvas) this.nearCanvas.remove();
  }
}

/* Короткая ломаная для SVG-дуг (hover кнопок, мелкие акценты). Координаты в px. */
function arcPath(x1, y1, x2, y2, { seed = 1, rough = 0.12, minSeg = 6 } = {}) {
  const rand = mulberry32(seed);
  const pts = [x1, y1];
  subdivide(x1, y1, x2, y2, Math.hypot(x2 - x1, y2 - y1) * rough, minSeg, 0.55, rand, pts);
  let d = `M${pts[0].toFixed(1)} ${pts[1].toFixed(1)}`;
  for (let i = 2; i < pts.length; i += 2) d += `L${pts[i].toFixed(1)} ${pts[i + 1].toFixed(1)}`;
  return d;
}
return { mulberry32, BRAND_PATH, brandWaypoints, generateBolt, drawBolt, clock, LightningField, arcPath };
})();

const __kb_storm_2 = (() => {
'use strict';
/*
 * КБ-13 · «Гроза» — глобальный слой ударов молнии (v2).
 *
 * Разряд выглядит как электричество, а не как сосуды: толстое белое ядро, красное тело,
 * широкий розовый ореол, мало ветвей, острые изломы. Удар живёт < 1 с:
 *   лидер 80 мс → обратный удар (перегрузка + вспышка + дрожь блока) → 3 мерцания → затухание,
 * после — выжженный след с тлеющей кромкой, искры с гравитацией, подпалина и дым.
 *
 * Два canvas на весь экран: «задний» (под контентом) и «передний» (над контентом, для искр
 * и ударов по действию пользователя). Координаты эффектов — страничные, поэтому при прокрутке
 * всё остаётся на своих местах. Цикл отрисовки работает только пока есть живые эффекты.
 */
const { generateBolt, mulberry32 } = __kb_lightning_1;

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/* кривая яркости удара: [мс от начала, интенсивность] */
const I_CURVE = [
  [0, 0.5],
  [78, 0.62],
  [82, 1.9],
  [128, 0.32],
  [168, 1.35],
  [226, 0.42],
  [282, 1.05],
  [342, 0.2],
  [400, 0.78],
  [470, 0.55],
  [640, 0],
];
const LEADER = 80;
const BOLT_LIFE = 640;
function curve(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++)
    if (x <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]));
  return pts[pts.length - 1][1];
}

/* Разряд из A в B (px), геометрия в единицах длины удара */
function boltBetween(ax, ay, bx, by, o = {}) {
  const L = Math.max(1, Math.hypot(bx - ax, by - ay));
  const dx = (bx - ax) / L;
  const dy = (by - ay) / L;
  const nx = -dy;
  const ny = dx;
  const rand = mulberry32((o.seed ?? 1) * 7919);
  const bend = (o.bend ?? 0.07) * (rand() < 0.5 ? -1 : 1);
  const wp = [
    [0, 0],
    [dx * 0.38 + nx * bend * (0.6 + rand() * 0.6), dy * 0.38 + ny * bend * (0.6 + rand() * 0.6)],
    [dx * 0.7 - nx * bend * 0.5 * rand(), dy * 0.7 - ny * bend * 0.5 * rand()],
    [dx, dy],
  ];
  const bolt = generateBolt({
    seed: o.seed ?? 1,
    aspect: 1,
    waypoints: wp,
    branches: o.branches ?? 4,
    sub: o.sub ?? 1,
    twigs: 0,
    width: 1,
    taper: 0.55,
    rough: 0.04,
    minSeg: 0.022,
    decay: 0.5,
    step: o.step ?? 0.095,
    jag: o.jag ?? 0.72,
    reach: o.reach ?? 0.22,
    spread: o.spread ?? 0.8,
  });
  return { bolt, L, ax, ay };
}

/* Отрисовка «электрического» канала. s: { L, ax, ay, ox, oy, k (dpr), w (толщина главного канала px), reveal, I, mainOnly } */
function drawElectric(ctx, B, s) {
  const { bolt, L, ax, ay } = B;
  const reveal = s.reveal ?? 1;
  const I = s.I ?? 1;
  if (reveal <= 0 || I <= 0.001) return;
  const k = s.k;
  const over = Math.max(0, I - 1);
  const buckets = new Map();
  const tip = new Path2D();
  for (const b of bolt.branches) {
    if (s.mainOnly && b.depth > 0) continue;
    const { pts, t, w } = b;
    const n = t.length;
    for (let i = 0; i < n - 1; i++) {
      const t1 = t[i];
      if (t1 >= reveal) break;
      let x2 = pts[i * 2 + 2];
      let y2 = pts[i * 2 + 3];
      const x1 = pts[i * 2];
      const y1 = pts[i * 2 + 1];
      let t2 = t[i + 1];
      if (t2 > reveal) {
        const f = (reveal - t1) / (t2 - t1);
        x2 = x1 + (x2 - x1) * f;
        y2 = y1 + (y2 - y1) * f;
        t2 = reveal;
      }
      const along = b.depth === 0 ? 1 : 1 - 0.6 * ((t1 - t[0]) / Math.max(1e-6, t[n - 1] - t[0]));
      const wq = Math.max(0.35, Math.round(w[i] * s.w * 4) / 4);
      const aq = Math.round(b.alpha * along * 10) / 10;
      const key = wq * 100 + aq;
      let p = buckets.get(key);
      if (!p) buckets.set(key, (p = { path: new Path2D(), w: wq, a: aq }));
      const X1 = (ax + x1 * L - s.ox) * k;
      const Y1 = (ay + y1 * L - s.oy) * k;
      const X2 = (ax + x2 * L - s.ox) * k;
      const Y2 = (ay + y2 * L - s.oy) * k;
      p.path.moveTo(X1, Y1);
      p.path.lineTo(X2, Y2);
      if (reveal < 1 && reveal - t2 < 0.06) {
        tip.moveTo(X1, Y1);
        tip.lineTo(X2, Y2);
      }
    }
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const ow = 1 + over * 0.9;
  const passes = s.palette || PALETTE;
  for (const P of passes) {
    if (P.blur) {
      ctx.shadowColor = `rgba(${P.c},${clamp(P.a * Math.min(I, 1.9))})`;
      ctx.shadowBlur = P.blur * k * (0.7 + 0.3 * Math.min(I, 1.9));
    }
    for (const p of buckets.values()) {
      const wpx = p.w * ow;
      if (P.min && wpx < P.min) continue;
      ctx.lineWidth = (wpx * P.mul + P.add) * k;
      const a = P.blur ? clamp(P.sa * p.a * Math.min(I, 1)) : clamp(P.a * p.a * (P.over ? Math.min(I, 1.9) : Math.min(I, 1)));
      ctx.strokeStyle = `rgba(${P.sc || P.c},${a})`;
      ctx.stroke(p.path);
    }
    if (P.blur) {
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    }
  }
  if (reveal < 1) {
    ctx.lineWidth = 2.6 * k;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.stroke(tip);
  }
}
/* blur-проходы: тень штриха даёт плавный ореол без «ступенек» */
const PALETTE = [
  { c: '255,40,28', blur: 46, a: 0.55, sc: '255,40,28', sa: 0.16, mul: 3, add: 2 },
  { c: '255,30,20', blur: 14, a: 0.9, sc: '255,32,22', sa: 0.92, mul: 2.1, add: 1 },
  { c: '255,160,140', mul: 1.25, add: 0.4, a: 0.95, min: 0.8 },
  { c: '255,255,255', mul: 0.8, add: 0.3, a: 1 },
];
/* на красном фоне — белая плазма */
const PALETTE_ON_RED = [
  { c: '255,240,235', blur: 40, a: 0.7, sc: '255,235,230', sa: 0.2, mul: 3, add: 2 },
  { c: '255,230,224', blur: 12, a: 0.95, sc: '255,214,206', sa: 0.9, mul: 1.9, add: 1 },
  { c: '255,255,255', mul: 1, add: 0.4, a: 1 },
];
const BURN = [
  { c: '255,90,40', mul: 3.2, add: 2, a: 0.22 },
  { c: '58,14,8', mul: 0.9, add: 0.6, a: 0.75 },
];

class Storm {
  constructor({ dpr } = {}) {
    this.dprCap = dpr ?? (matchMedia('(pointer: coarse)').matches ? 1.5 : 2);
    this.back = this.mkCanvas('storm storm--back');
    this.front = this.mkCanvas('storm storm--front');
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'storm-flash';
    this.flashEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.flashEl);
    this.bctx = this.back.getContext('2d');
    this.fctx = this.front.getContext('2d');
    this.effects = [];
    this.raf = 0;
    this.seed = 1;
    this.enabled = true;
    this.gentle = false;
    this.now = () => performance.now();
    this.resize = this.resize.bind(this);
    addEventListener('resize', this.resize);
    this.resize();
  }
  mkCanvas(cls) {
    const c = document.createElement('canvas');
    c.className = cls;
    c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    return c;
  }
  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.k = Math.min(devicePixelRatio || 1, this.dprCap);
    for (const c of [this.back, this.front]) {
      c.width = Math.round(w * this.k);
      c.height = Math.round(h * this.k);
    }
    this.vw = w;
    this.vh = h;
    this.kick();
  }

  /* удар: координаты страничные */
  strike(o) {
    if (!this.enabled && !o.force) return null;
    const seed = o.seed ?? this.seed++ * 13;
    const B = boltBetween(o.ax, o.ay, o.bx, o.by, { seed, branches: o.branches, sub: o.sub, bend: o.bend, reach: o.reach, step: o.step });
    const t0 = this.now();
    const e = {
      type: 'bolt',
      B,
      t0,
      w: o.width ?? 4,
      layer: o.layer === 'front' ? 'front' : 'back',
      palette: o.palette,
      burn: o.burn !== false,
      onHit: o.onHit,
      hit: false,
    };
    this.effects.push(e);
    const ix = o.bx;
    const iy = o.by;
    // последствия — в момент обратного удара
    e.after = () => {
      // «уменьшить движение» в системе: без вспышки на весь экран и без тряски, сам удар остаётся
      if (o.flash && !this.gentle) this.flash(o.flash);
      if (o.shake && !this.gentle) shake(o.shake, o.shakeAmp ?? 5);
      if (o.scorch !== false) this.effects.push({ type: 'scorch', x: ix, y: iy, r: (o.width ?? 4) * 7 + 10, t0: this.now() });
      if (o.sparks !== 0) this.sparks(ix, iy, o.sparks ?? 26, o.sparkDir);
      if (o.smoke !== false) this.smoke(ix, iy);
      o.onHit?.();
    };
    this.kick();
    return e;
  }
  sparks(x, y, n, dir = -Math.PI / 2) {
    const rand = mulberry32(this.seed++ * 31);
    const t0 = this.now();
    for (let i = 0; i < n; i++) {
      const a = dir + (rand() - 0.5) * Math.PI * 1.25;
      const v = 420 + rand() * 980;
      this.effects.push({
        type: 'spark',
        x,
        y,
        px: x,
        py: y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 320 + rand() * 640,
        w: 1.2 + rand() * 1.7,
        t0,
        last: t0,
      });
    }
  }
  smoke(x, y) {
    const rand = mulberry32(this.seed++ * 17);
    const t0 = this.now();
    for (let i = 0; i < 5; i++)
      this.effects.push({ type: 'smoke', x: x + (rand() - 0.5) * 16, y, dx: (rand() - 0.5) * 30, r0: 6 + rand() * 6, life: 1100 + rand() * 700, t0: t0 + i * 60 });
  }
  flash(a) {
    this.flashA = Math.max(this.flashA || 0, a);
    this.flashT = this.now();
    this.kick();
  }
  kick() {
    if (!this.raf) this.raf = requestAnimationFrame(() => this.frame());
  }
  frame() {
    this.raf = 0;
    const now = this.now();
    const k = this.k;
    const ox = scrollX;
    const oy = scrollY;
    const { bctx, fctx } = this;
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, this.back.width, this.back.height);
    fctx.clearRect(0, 0, this.front.width, this.front.height);
    const alive = [];
    for (const e of this.effects) {
      const el = now - e.t0;
      if (el < 0) {
        alive.push(e);
        continue;
      }
      if (e.type === 'bolt') {
        const ctx = e.layer === 'front' ? fctx : bctx;
        if (el < BOLT_LIFE) {
          const reveal = el < LEADER ? easeOut(el / LEADER) : 1;
          drawElectric(ctx, e.B, { k, ox, oy, w: e.w, reveal, I: curve(I_CURVE, el), palette: e.palette });
          if (el >= LEADER && !e.hit) {
            e.hit = true;
            e.after();
          }
        }
        // выжженный след главного канала: тлеет и остывает
        if (e.burn && el > 300 && el < 2400) {
          const q = (el - 300) / 2100;
          const ember = clamp(1 - (el - 300) / 500);
          drawElectric(bctx, e.B, {
            k,
            ox,
            oy,
            w: e.w * 0.55,
            I: (1 - q) * 0.9,
            mainOnly: true,
            palette: [
              { c: '255,90,40', mul: 3.4, add: 2, a: 0.32 * ember },
              { c: '255,60,30', mul: 1.4, add: 0.6, a: 0.8 * ember },
              BURN[1],
            ],
          });
        }
        if (el < 2400) alive.push(e);
      } else if (e.type === 'spark') {
        const dt = Math.min(0.05, (now - e.last) / 1000);
        e.last = now;
        e.px = e.x;
        e.py = e.y;
        const drag = Math.pow(0.35, dt);
        e.vy += 1500 * dt;
        e.vx *= drag;
        e.vy *= drag;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        const q = el / e.life;
        if (q < 1) {
          const g = 1 - q;
          const tx = e.x - e.vx * 0.042;
          const ty = e.y - e.vy * 0.042;
          fctx.lineCap = 'round';
          fctx.shadowColor = 'rgba(255,60,20,0.9)';
          fctx.shadowBlur = 8 * k;
          fctx.lineWidth = e.w * 2.4 * k;
          fctx.strokeStyle = `rgba(255,70,30,${0.7 * g})`;
          fctx.beginPath();
          fctx.moveTo((tx - ox) * k, (ty - oy) * k);
          fctx.lineTo((e.x - ox) * k, (e.y - oy) * k);
          fctx.stroke();
          fctx.shadowBlur = 0;
          fctx.lineWidth = e.w * k;
          fctx.strokeStyle = q < 0.35 ? `rgba(255,255,240,${g})` : `rgba(255,${Math.round(220 - q * 200)},${Math.round(150 - q * 140)},${g})`;
          fctx.stroke();
          alive.push(e);
        }
      } else if (e.type === 'scorch') {
        const q = el / 4200;
        if (q < 1) {
          const X = (e.x - ox) * k;
          const Y = (e.y - oy) * k;
          const R = e.r * k * (1 + 0.15 * easeOut(Math.min(1, el / 300)));
          const a = 1 - q * q;
          const g = bctx.createRadialGradient(X, Y, 0, X, Y, R);
          g.addColorStop(0, `rgba(28,8,4,${0.62 * a})`);
          g.addColorStop(0.35, `rgba(70,18,8,${0.32 * a})`);
          g.addColorStop(1, 'rgba(70,18,8,0)');
          bctx.fillStyle = g;
          bctx.fillRect(X - R, Y - R, R * 2, R * 2);
          const ember = clamp(1 - el / 900);
          if (ember > 0) {
            const g2 = bctx.createRadialGradient(X, Y, R * 0.15, X, Y, R * 0.9);
            g2.addColorStop(0, `rgba(255,120,40,${0.55 * ember})`);
            g2.addColorStop(0.6, `rgba(242,13,13,${0.22 * ember})`);
            g2.addColorStop(1, 'rgba(242,13,13,0)');
            bctx.fillStyle = g2;
            bctx.fillRect(X - R, Y - R, R * 2, R * 2);
          }
          alive.push(e);
        }
      } else if (e.type === 'smoke') {
        const q = el / e.life;
        if (q < 1) {
          const X = (e.x + e.dx * q - ox) * k;
          const Y = (e.y - 70 * easeOut(q) - oy) * k;
          const R = (e.r0 + 34 * q) * k;
          const g = bctx.createRadialGradient(X, Y, 0, X, Y, R);
          g.addColorStop(0, `rgba(70,66,62,${0.12 * (1 - q)})`);
          g.addColorStop(1, 'rgba(70,66,62,0)');
          bctx.fillStyle = g;
          bctx.fillRect(X - R, Y - R, R * 2, R * 2);
          alive.push(e);
        }
      }
    }
    this.effects = alive;
    // вспышка бумаги
    let fa = 0;
    if (this.flashA) {
      const el = now - this.flashT;
      fa = this.flashA * Math.max(0, 1 - el / 160) * (el < 40 ? 1 : 0.6);
      if (el > 160) this.flashA = 0;
    }
    this.flashEl.style.opacity = fa.toFixed(3);
    if (this.effects.length || this.flashA) this.kick();
  }

  /* фоновая гроза: пока зона видна, удары с паузой min..max мс; pick() → параметры удара или null */
  ambient(zone, pick, { min = 3200, max = 6500, first = 900 } = {}) {
    let visible = false;
    let timer = 0;
    const schedule = (d) => {
      clearTimeout(timer);
      timer = setTimeout(fire, d);
    };
    const fire = () => {
      if (!visible) return;
      if (this.enabled && !document.hidden) {
        const o = pick();
        if (o) this.strike(o);
      }
      schedule(min + Math.random() * (max - min));
    };
    new IntersectionObserver(
      (es) => {
        const v = es[0].isIntersecting;
        if (v && !visible) schedule(first);
        if (!v) clearTimeout(timer);
        visible = v;
      },
      { threshold: 0.15 }
    ).observe(zone);
  }
}

/* «дрожь» блока при ударе */
function shake(el, amp = 5) {
  if (!el?.animate) return;
  const r = () => (Math.random() * 2 - 1) * amp;
  el.animate(
    [
      { transform: 'translate(0,0)' },
      { transform: `translate(${r()}px,${r()}px)` },
      { transform: `translate(${r()}px,${r()}px)` },
      { transform: `translate(${r() * 0.5}px,${r() * 0.5}px)` },
      { transform: 'translate(0,0)' },
    ],
    { duration: 190, easing: 'linear' }
  );
}
return { boltBetween, PALETTE_ON_RED, Storm, shake, drawElectric };
})();

const __kb_ribbon_3 = (() => {
'use strict';
/*
 * КБ-13 · «Молния-лента».
 * Разряд растёт по полю страницы вслед за прокруткой: левая полоса → прыжок через полосу-разряд →
 * правая полоса → … до футера. У кончика — раскалённая голова с треском. Когда кончик проходит
 * отмеченные элементы, вызывается onTrigger(key, on) — люди въезжают, номера загораются и т. п.
 * Рисуется на одном fixed-canvas под контентом; считаются только видимые участки.
 */
const { mulberry32 } = __kb_lightning_1;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const gauss = (r) => (r() + r() + r() + r() - 2) * 1.2;

class Ribbon {
  constructor({ storm, reduced = false, onTrigger } = {}) {
    this.storm = storm;
    this.reduced = reduced;
    this.onTrigger = onTrigger || (() => {});
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'ribbon';
    this.canvas.setAttribute('aria-hidden', 'true');
    document.body.prepend(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.k = Math.min(devicePixelRatio || 1, 1.5);
    this.vel = 0;
    this.bandTop = null;
    this.triggers = [];
    this.taps = [];
    this.tip = null;
    this.raf = 0;
    this.last = performance.now();
    this.crackT = 0;
    this.cracks = [];
    this.pulseT = performance.now() + 1800;
    this.boost = [];
    this.frame = this.frame.bind(this);
    addEventListener('resize', () => this.measure());
    document.addEventListener('visibilitychange', () => this.kick());
    if ('ResizeObserver' in window) new ResizeObserver(() => this.measure()).observe(document.body);
  }

  /* trigger: { key, el, at: 'top'|'center', on } */
  watch(key, el, at = 'top') {
    if (el) this.triggers.push({ key, el, at, y: 0, on: false });
  }
  /* отвод от полосы к элементу (номер пакета): рисуется, когда кончик проходит его уровень */
  tap(key, el) {
    if (el) this.taps.push({ key, el, y: 0, x: 0, side: 'L', on: false, t0: 0 });
  }

  measure() {
    const vw = document.documentElement.clientWidth;
    this.vw = vw;
    this.vh = innerHeight;
    // холст не закреплён на экране, а лежит на странице и прокручивается вместе с ней — без отставания
    // на кадр; это полоса «экран + запас», которая переставляется, когда экран подходит к её краю
    this.pad = Math.round(this.vh * 0.4);
    this.H = this.vh + this.pad * 2;
    this.canvas.width = Math.round(vw * this.k);
    this.canvas.height = Math.round(this.H * this.k);
    this.canvas.style.width = vw + 'px';
    this.canvas.style.height = this.H + 'px';
    this.bandTop = null;
    const mobile = vw < 768;
    const inset = mobile ? 7 : vw < 1024 ? 14 : clamp((vw - 1328) / 2 - 40, 26, 64);
    this.xL = inset;
    this.xR = vw - inset;
    this.w = mobile ? 1.6 : 2.4;
    const sy = scrollY;
    const top = (el) => el.getBoundingClientRect().top + sy;
    const hero = document.getElementById('home');
    const foot = document.querySelector('.site-footer');
    if (!hero || !foot) return;
    this.start = top(hero) + (mobile ? 12 : 28);
    this.end = foot.getBoundingClientRect().bottom + sy - (mobile ? 40 : 64);
    this.pageEnd = foot.getBoundingClientRect().bottom + sy;
    const crosses = [...document.querySelectorAll('[data-cross]')].map((el) => {
      const r = el.getBoundingClientRect();
      return { y0: r.top + sy + r.height * 0.12, y1: r.top + sy + r.height * 0.88, el };
    });
    this.build(crosses);
    for (const t of this.triggers) {
      const r = t.el.getBoundingClientRect();
      t.y = r.top + sy + (t.at === 'center' ? r.height / 2 : Math.min(40, r.height * 0.2));
    }
    for (const t of this.taps) {
      const r = t.el.getBoundingClientRect();
      t.y = r.top + sy + r.height * 0.5;
      t.side = this.sideAt(t.y);
      t.x = t.side === 'L' ? r.left - 10 : r.right + 10;
    }
    if (this.tip == null) {
      this.tip = this.start;
      this.intro = this.reduced ? 0 : performance.now() + 300;
    }
    this.kick();
  }

  sideAt(y) {
    let side = 'L';
    for (const c of this.crossList || []) if (y > (c.y0 + c.y1) / 2) side = c.to;
    return side;
  }

  /* зубчатый разряд по «хребту»; пути только вниз (монотонно по y) */
  build(crosses) {
    const rand = mulberry32(1313);
    const X = [];
    const Y = [];
    const push = (x, y) => {
      X.push(x);
      Y.push(Math.max(y, Y.length ? Y[Y.length - 1] : y));
    };
    let side = 'L';
    let x = this.xL;
    let y = this.start;
    const amp = this.vw < 768 ? 2.2 : 3.4;
    const run = (y1) => {
      const base = side === 'L' ? this.xL : this.xR;
      while (y < y1 - 1) {
        const step = 14 + rand() * 22;
        y = Math.min(y1, y + step);
        // редкие изломы наружу (в поле), мелкая дрожь — постоянно
        const kink = rand() < 0.08 ? (side === 'L' ? -1 : 1) * (4 + rand() * 5) : 0;
        push(base + gauss(rand) * amp + kink, y);
      }
      x = base;
    };
    this.crossList = [];
    this.forks = [];
    push(x, y);
    for (const c of crosses) {
      if (c.y0 <= y + 20) continue;
      run(c.y0);
      const to = side === 'L' ? 'R' : 'L';
      const x0 = side === 'L' ? this.xL : this.xR;
      const x1 = to === 'L' ? this.xL : this.xR;
      const i0 = X.length - 1;
      // фирменный зигзаг через полосу: две «ступеньки», как в знаке
      const H = c.y1 - c.y0;
      const way = [
        [x0, c.y0],
        [x0 + (x1 - x0) * 0.33, c.y0 + H * 0.36],
        [x0 + (x1 - x0) * 0.31, c.y0 + H * 0.5],
        [x0 + (x1 - x0) * 0.62, c.y0 + H * 0.66],
        [x0 + (x1 - x0) * 0.6, c.y0 + H * 0.8],
        [x1, c.y1],
      ];
      for (let w = 1; w < way.length; w++) {
        const [ax, ay] = way[w - 1];
        const [bx, by] = way[w];
        const L = Math.hypot(bx - ax, by - ay);
        const n = Math.max(2, Math.round(L / 22));
        const nx = -(by - ay) / L;
        const ny = (bx - ax) / L;
        for (let k = 1; k <= n; k++) {
          const t = k / n;
          const off = k === n ? 0 : gauss(rand) * Math.min(9, L * 0.05);
          push(ax + (bx - ax) * t + nx * off, ay + (by - ay) * t + Math.max(0, ny * off));
        }
      }
      // пара коротких ответвлений у прыжка
      for (let f = 0; f < 3; f++) {
        const j = i0 + Math.floor((0.2 + rand() * 0.6) * (X.length - 1 - i0));
        const dir = rand() < 0.5 ? -1 : 1;
        const len = 18 + rand() * 40;
        const ang = Math.atan2(Y[j + 1] - Y[j], X[j + 1] - X[j]) + dir * (0.6 + rand() * 0.6);
        const pts = [[X[j], Y[j]]];
        for (let s = 1; s <= 3; s++) pts.push([X[j] + Math.cos(ang) * (len * s) / 3 + gauss(rand) * 3, Y[j] + Math.sin(ang) * (len * s) / 3 + gauss(rand) * 3]);
        this.forks.push({ i: j, pts });
      }
      this.crossList.push({ y0: c.y0, y1: c.y1, i0, i1: X.length - 1, to, el: c.el, passed: false });
      side = to;
      y = c.y1;
    }
    run(this.end);
    this.X = Float32Array.from(X);
    this.Y = Float32Array.from(Y);
    this.N = X.length;
  }

  /* индекс первой точки ниже y (Y монотонна) */
  idx(y) {
    let lo = 0;
    let hi = this.N - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (this.Y[m] < y) lo = m + 1;
      else hi = m;
    }
    return lo;
  }
  pointAt(y) {
    const i = this.idx(y);
    if (i === 0) return [this.X[0], this.Y[0]];
    const y0 = this.Y[i - 1];
    const y1 = this.Y[i];
    const f = y1 > y0 ? (y - y0) / (y1 - y0) : 1;
    return [this.X[i - 1] + (this.X[i] - this.X[i - 1]) * f, y];
  }

  kick() {
    if (!this.raf && !document.hidden) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  frame(now) {
    this.raf = 0;
    if (!this.N) return;
    const dt = Math.min(64, Math.max(1, now - this.last));
    this.last = now;
    const sy = scrollY;
    const vh = this.vh;
    const maxY = document.documentElement.scrollHeight - vh;
    let target = sy + vh * (this.vw < 768 ? 0.78 : 0.64);
    if (sy >= maxY - 2) target = this.end;
    target = clamp(target, this.start, this.end);
    let busy = !this.reduced;
    if (this.reduced) this.tip = this.end;
    else if (this.intro) {
      const p = clamp((now - this.intro) / 1300, 0, 1);
      this.tip = this.start + (target - this.start) * (1 - Math.pow(1 - p, 4));
      if (p >= 1) this.intro = 0;
    } else {
      // критически задемпфированная пружина: плавный разгон и торможение, без рывков и «отскока»
      const d = target - this.tip;
      if (Math.abs(d) > vh * 2.5) {
        // прыжок по ссылке меню: не ползти через полстраницы
        this.tip = target - Math.sign(d) * vh;
        this.vel = 0;
      }
      const W = 15;
      const t = dt / 1000;
      this.vel += (W * W * (target - this.tip) - 2 * W * this.vel) * t;
      this.tip += this.vel * t;
      if (Math.abs(target - this.tip) < 0.3 && Math.abs(this.vel) < 3) {
        this.tip = target;
        this.vel = 0;
      }
    }
    this.events(now);
    this.draw(now, sy);
    if (busy && !document.hidden) this.raf = requestAnimationFrame(this.frame);
  }

  events(now) {
    const tip = this.tip;
    for (const t of this.triggers) {
      if (!t.on && tip >= t.y) {
        t.on = true;
        this.onTrigger(t.key, true, t);
      } else if (t.on && tip < t.y - 30) {
        t.on = false;
        this.onTrigger(t.key, false, t);
      }
    }
    for (const t of this.taps) {
      if (!t.on && tip >= t.y) {
        t.on = true;
        t.t0 = now;
        this.onTrigger(t.key, true, t);
        if (!this.reduced && this.storm) this.storm.sparks(t.x, t.y, 10, t.side === 'L' ? 0 : Math.PI);
      } else if (t.on && tip < t.y - 30) {
        t.on = false;
        this.onTrigger(t.key, false, t);
      }
    }
    for (const c of this.crossList) {
      const mid = (c.y0 + c.y1) / 2;
      if (!c.passed && tip >= c.y1) {
        c.passed = true;
        this.onTrigger('cross', true, c);
        if (!this.reduced) {
          this.boost.push({ c, t0: now });
          if (this.storm) {
            this.storm.flash(0.16);
            const [mx, my] = this.pointAt(mid);
            this.storm.sparks(mx, my, 26);
          }
        }
      } else if (c.passed && tip < c.y0 - 40) c.passed = false;
    }
  }

  draw(now, sy) {
    const { ctx, k } = this;
    // полоса переставляется, только когда экран подходит к её краю
    if (this.bandTop == null || sy < this.bandTop + 24 || sy + this.vh > this.bandTop + this.H - 24) {
      this.bandTop = Math.round(clamp(sy - this.pad, 0, Math.max(0, (this.pageEnd || 0) - this.H)));
      this.canvas.style.transform = `translate3d(0, ${this.bandTop}px, 0)`;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(k, 0, 0, k, 0, -this.bandTop * k);
    const top = Math.max(this.start, this.bandTop);
    const bot = Math.min(this.tip, this.bandTop + this.H);
    // «живое» мерцание — плавное, без случайного скачка на каждом кадре
    const flick = this.reduced ? 1 : 0.9 + 0.1 * (0.5 + 0.5 * Math.sin(now * 0.011) * Math.sin(now * 0.0047 + 1.3));
    if (bot > top) {
      const i0 = Math.max(0, this.idx(top) - 1);
      const i1 = this.idx(bot);
      const path = new Path2D();
      path.moveTo(this.X[i0], this.Y[i0]);
      for (let i = i0 + 1; i < i1; i++) path.lineTo(this.X[i], this.Y[i]);
      const [tx, ty] = this.pointAt(bot);
      path.lineTo(tx, ty);
      for (const f of this.forks) {
        if (f.i < i0 || f.i > i1) continue;
        path.moveTo(f.pts[0][0], f.pts[0][1]);
        for (let j = 1; j < f.pts.length; j++) path.lineTo(f.pts[j][0], f.pts[j][1]);
      }
      this.stroke(path, this.w, flick);
    }
    // прыжки через полосы: вспышка при проходе
    this.boost = this.boost.filter((b) => now - b.t0 < 520);
    for (const b of this.boost) {
      const el = now - b.t0;
      const I = [1.9, 0.5, 1.4, 0.4, 1, 0.3][Math.min(5, Math.floor(el / 70))] * (1 - el / 520);
      const p = new Path2D();
      p.moveTo(this.X[b.c.i0], this.Y[b.c.i0]);
      for (let i = b.c.i0 + 1; i <= b.c.i1; i++) p.lineTo(this.X[i], this.Y[i]);
      this.stroke(p, this.w * (1.6 + I), Math.min(1, 0.4 + I));
    }
    // отводы к номерам пакетов
    for (const t of this.taps) {
      if (!t.on) continue;
      const g = this.reduced ? 1 : clamp((now - t.t0) / 260, 0, 1);
      const x0 = t.side === 'L' ? this.xL : this.xR;
      const p = new Path2D();
      const rand = mulberry32(Math.round(t.y));
      p.moveTo(x0, t.y);
      const n = 5;
      for (let s = 1; s <= n; s++) {
        const q = (s / n) * g;
        p.lineTo(x0 + (t.x - x0) * q, t.y + (s < n ? gauss(rand) * 3 : 0));
      }
      this.stroke(p, this.w * 0.9, flick);
    }
    this.endDot(sy);
    // голова и бегущий импульс
    if (!this.reduced && this.tip < this.end - 1 && this.tip > this.start + 4) {
      const [hx, hy] = this.pointAt(this.tip);
      // треск у головы: смещения относительно кончика, обновляются ~14 раз в секунду
      if (now - this.crackT > 70) {
        this.crackT = now;
        this.cracks = [];
        const n = 2 + Math.floor(Math.random() * 3);
        for (let c = 0; c < n; c++) {
          const a = Math.random() * Math.PI * 2;
          const L = 8 + Math.random() * 18;
          this.cracks.push([Math.cos(a) * L * 0.5 + (Math.random() - 0.5) * 6, Math.sin(a) * L * 0.5 + (Math.random() - 0.5) * 6, Math.cos(a) * L, Math.sin(a) * L]);
        }
      }
      const cp = new Path2D();
      for (const c of this.cracks) {
        cp.moveTo(hx, hy);
        cp.lineTo(hx + c[0], hy + c[1]);
        cp.lineTo(hx + c[2], hy + c[3]);
      }
      this.stroke(cp, 1.2, 1);
      const R = this.vw < 768 ? 16 : 24;
      const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, R);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.18, 'rgba(255,230,220,1)');
      g.addColorStop(0.36, 'rgba(255,40,24,0.8)');
      g.addColorStop(1, 'rgba(242,13,13,0)');
      ctx.fillStyle = g;
      ctx.fillRect(hx - R, hy - R, R * 2, R * 2);
      // импульс тока бежит по ленте к голове
      if (now > this.pulseT) {
        const q = (now - this.pulseT) / 900;
        if (q > 1) this.pulseT = now + 2600 + Math.random() * 2000;
        else {
          const py = this.tip - 700 * (1 - q);
          if (py > Math.max(this.start, this.bandTop)) {
            const a = this.idx(py - 40);
            const b = this.idx(py);
            const pp = new Path2D();
            pp.moveTo(this.X[a], this.Y[a]);
            for (let i = a + 1; i <= b; i++) pp.lineTo(this.X[i], this.Y[i]);
            this.stroke(pp, this.w * 2.2, 1);
          }
        }
      }
    }
  }

  /* точка-«заземление» в конце ленты */
  endDot(sy) {
    if (this.tip < this.end - 1 || this.end < this.bandTop - 30 || this.end > this.bandTop + this.H + 30) return;
    const [x, y] = this.pointAt(this.end);
    const g = this.ctx.createRadialGradient(x, y, 0, x, y, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,40,24,0.95)');
    g.addColorStop(1, 'rgba(242,13,13,0)');
    this.ctx.fillStyle = g;
    this.ctx.fillRect(x - 16, y - 16, 32, 32);
  }

  /* слои разряда для светлого фона: ореол → красное тело → горячая середина → белое ядро */
  stroke(path, w, I) {
    const ctx = this.ctx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = `rgba(255,30,20,${0.85 * I})`;
    ctx.shadowBlur = 14;
    ctx.lineWidth = w * 1.9 + 1;
    ctx.strokeStyle = `rgba(255,32,22,${0.88 * I})`;
    ctx.stroke(path);
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = w * 1.05;
    ctx.strokeStyle = `rgba(255,150,132,${0.95 * I})`;
    ctx.stroke(path);
    ctx.lineWidth = Math.max(0.6, w * 0.5);
    ctx.strokeStyle = `rgba(255,255,255,${I})`;
    ctx.stroke(path);
  }
}
return { Ribbon };
})();

(() => {
'use strict';
/*
 * КБ-13 · поведение страницы.
 * Без зависимостей. Всё содержимое видно и без JS; скрипт только добавляет взаимодействие и движение.
 */
const { LightningField, brandWaypoints, arcPath } = __kb_lightning_1;
const { Storm } = __kb_storm_2;
const { Ribbon } = __kb_ribbon_3;

const doc = document.documentElement;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const CFG = JSON.parse($('#kb-config')?.textContent || '{}');

/* страховка для старых браузеров: без этих API скрипт не должен падать целиком */
const nativeAnimate = 'animate' in Element.prototype;
if (!('IntersectionObserver' in window))
  window.IntersectionObserver = class {
    constructor(cb) {
      this.cb = cb;
    }
    observe(el) {
      setTimeout(() => this.cb([{ isIntersecting: true, intersectionRatio: 1, target: el }], this), 0);
    }
    unobserve() {}
    disconnect() {}
  };
if (!('ResizeObserver' in window))
  window.ResizeObserver = class {
    constructor(cb) {
      this.cb = cb;
    }
    observe() {
      addEventListener('resize', () => this.cb([], this));
    }
    unobserve() {}
    disconnect() {}
  };
if (!window.queueMicrotask) window.queueMicrotask = (f) => Promise.resolve().then(f);
if (!nativeAnimate)
  Element.prototype.animate = function () {
    const a = { cancel() {}, finish() {}, play() {}, pause() {}, finished: Promise.resolve(), onfinish: null };
    setTimeout(() => a.onfinish?.(), 0);
    return a;
  };

const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
const mqHover = matchMedia('(hover: hover) and (pointer: fine)');
const mqDesk = matchMedia('(min-width: 900px)');
/* Эффекты включены всегда (просьба заказчика): молнии, лазеры из глаз, въезд людей, автолистание.
   Полностью статичная страница — только по адресу с ?calm.
   Системная настройка «уменьшить движение» убирает лишь параллакс, тряску и вспышки на весь экран. */
const CALM = /[?&]calm\b/.test(location.search);
if (CALM) doc.classList.add('calm');
const reduce = () => CALM;
const gentle = () => CALM || mqReduce.matches;
const touch = () => !mqHover.matches;

if (/[?&]grid\b/.test(location.search)) doc.classList.add('show-grid');

const scrollToEl = (el) => el.scrollIntoView({ behavior: gentle() ? 'auto' : 'smooth', block: 'start' });

/* ---------- иконки: короткая анимация при каждом появлении (и при прокрутке вниз, и вверх) ---------- */
function playIcon(svg) {
  if (!svg || reduce()) return;
  svg.classList.remove('is-anim');
  void svg.getBoundingClientRect();
  svg.classList.add('is-anim');
  clearTimeout(svg._t);
  svg._t = setTimeout(() => svg.classList.remove('is-anim'), 700);
}
const iconIO = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting && !e.target._seen) playIcon(e.target);
      e.target._seen = e.isIntersecting;
    }
  },
  { threshold: 0.9, rootMargin: '-6% 0px -12% 0px' }
);
$$('.faq__icon, .btn__icon').forEach((svg) => {
  if (svg.closest('.site-header')) return; // телефон в шапке — только при наведении
  iconIO.observe(svg);
});

/* ---------- кнопки: разряд вдоль нижней кромки + иконка ---------- */
let arcSeed = 7;
function buttonArc(btn, rough = 0.16) {
  const host = btn.querySelector('.btn__arc');
  if (!host || reduce()) return;
  const w = btn.offsetWidth + 4;
  const d = arcPath(0, 7, w, 7, { seed: arcSeed++, rough, minSeg: 7 });
  host.innerHTML = `<svg viewBox="0 0 ${w} 14" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path class="arc-glow" d="${d}" pathLength="1"/><path class="arc-body" d="${d}" pathLength="1"/><path class="arc-core" d="${d}" pathLength="1"/></svg>`;
  host.classList.remove('is-on');
  void host.offsetWidth;
  host.classList.add('is-on');
}
document.addEventListener(
  'pointerenter',
  (e) => {
    if (!mqHover.matches || e.pointerType !== 'mouse') return;
    const btn = e.target.closest?.('.btn');
    if (!btn || e.target !== btn) return;
    buttonArc(btn);
    playIcon(btn.querySelector('.btn__icon'));
  },
  true
);

/* ---------- шапка ---------- */
const header = $('[data-header]');
const logoLink = $('[data-logo]');
logoLink?.addEventListener('pointerenter', () => {
  if (reduce()) return;
  logoLink.classList.remove('is-zap');
  void logoLink.offsetWidth;
  logoLink.classList.add('is-zap');
});

// подсветка текущего раздела
const navLinks = $$('.nav__link');
const spy = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const id = '#' + e.target.id;
      navLinks.forEach((a) => a.setAttribute('aria-current', String(a.getAttribute('href') === id)));
    }
  },
  { rootMargin: '-45% 0px -50% 0px' }
);
['home', 'about', 'questions', 'services', 'contact'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) spy.observe(el);
});

/* ---------- мобильное меню ---------- */
const menuBtn = $('[data-menu-toggle]');
const menu = $('#mobile-menu');
function setMenu(open, { focusBack = true } = {}) {
  if (!menu) return;
  menu.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  menuBtn.querySelector('use')?.setAttribute('href', open ? '#kb-close' : '#kb-menu');
  doc.style.overflow = open ? 'hidden' : '';
  if (open) menu.querySelector('a')?.focus();
  else if (focusBack) menuBtn.focus();
}
menuBtn?.addEventListener('click', () => setMenu(menu.hidden));
menu?.addEventListener('click', (e) => {
  if (e.target.closest('a')) setMenu(false, { focusBack: false });
});

/* ---------- «телефонировать» без номера: честная панель ---------- */
const phoneBtn = $('[data-phone-toggle]');
const phonePanel = $('#phone-panel');
function setPhone(open, { focusBack = true } = {}) {
  if (!phonePanel) return;
  phonePanel.hidden = !open;
  phoneBtn.setAttribute('aria-expanded', String(open));
  if (open) phonePanel.querySelector('a, button')?.focus();
  else if (focusBack) phoneBtn.focus();
}
phoneBtn?.addEventListener('click', () => setPhone(phonePanel.hidden));
$('[data-phone-close]')?.addEventListener('click', () => setPhone(false));
document.addEventListener('click', (e) => {
  if (phonePanel && !phonePanel.hidden && !e.target.closest('#phone-panel, [data-phone-toggle]')) setPhone(false, { focusBack: false });
});
$$('[data-phone-hover]').forEach((el) =>
  el.addEventListener('pointerenter', () => playIcon(el.querySelector('.icon--phone')))
);

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (menu && !menu.hidden) setMenu(false);
  else if (phonePanel && !phonePanel.hidden) setPhone(false);
  else if (chat && !chat.hidden) setChat(false);
});

/* ---------- переход к форме: прокрутка + фокус на заголовок формы ---------- */
const formTitle = $('#form-title');
$$('[data-to-form]').forEach((a) =>
  a.addEventListener('click', (e) => {
    e.preventDefault();
    if (phonePanel && !phonePanel.hidden) setPhone(false, { focusBack: false });
    if (chat && !chat.hidden) setChat(false, { focusBack: false });
    scrollToEl($('#contact'));
    formTitle?.focus({ preventScroll: true });
    history.replaceState(null, '', '#contact');
  })
);

/* =========================================================
   МОЛНИИ
   ========================================================= */
const fields = new Map();
function makeField(name, opts) {
  const host = $(`[data-bolt="${name}"]`);
  if (!host) return null;
  const f = new LightningField(host, Object.assign({ reveal: 0 }, opts));
  fields.set(name, f);
  return f;
}

/* ---------- прокрутка в обе стороны ----------
   Прогресс элемента: 0 — его верх у нижнего края экрана (start), 1 — верх поднялся до end.
   Вниз — молния раскрывается и в конце «бьёт», вверх — втягивается обратно; рисунки так же
   прорисовываются и стираются. При повторной прокрутке вниз всё проигрывается снова. */
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const scrubs = [];
const addScrub = (el, start, end, fn) => el && scrubs.push({ el, start, end, fn, p: -1 });
function scrubUpdate(force = false) {
  const vh = innerHeight;
  for (const s of scrubs) {
    const r = s.el.getBoundingClientRect();
    const p = clamp((s.start * vh - r.top) / ((s.start - s.end) * vh));
    if (!force && Math.abs(p - s.p) < 0.002) continue;
    s.p = p;
    s.fn(p);
  }
}
function boltScrub(f, el, { start = 0.95, end = 0.42, from = 0, to = 1, flash = true } = {}) {
  if (!f) return;
  if (reduce()) return f.settle(1);
  f._armed = true;
  addScrub(el, start, end, (p) => {
    const r = clamp((p - from) / (to - from));
    if (r < 0.985) {
      if (f.anim) f.stop();
      f._armed = true;
      f.setReveal(r);
    } else if (f._armed) {
      f._armed = false;
      f.strike({ from: Math.min(f.reveal, 0.985), to: 1, leader: 70, flash: flash && !touch() && !gentle() });
    }
  });
}
function drawDoodle(svg, p) {
  const paths = svg._paths || (svg._paths = [...svg.querySelectorAll('path')]);
  const st = 0.22;
  paths.forEach((path, i) => {
    const q = clamp(p * (1 + st * (paths.length - 1)) - i * st);
    path.style.strokeDasharray = '1';
    path.style.strokeDashoffset = String(1 - q);
    if (path.classList.contains('dd-fill')) path.style.fillOpacity = String(clamp((q - 0.6) * 2.5));
  });
}
function doodleScrub(svg, el, { start = 0.95, end = 0.45, span = 1 } = {}) {
  if (!svg) return;
  if (reduce()) return svg.classList.add('is-drawn');
  addScrub(el, start, end, (p) => drawDoodle(svg, clamp(p / span)));
}

/* Hero: человек справа слегка поднимается при прокрутке, текст уходит параллаксом. Молнии за ним нет. */
const hero = $('#home');
const heroPerson = $('[data-hero-person]');
let heroTop = 0;
let heroH = 1;
let heroVisible = true;
const measureHero = () => {
  const r = hero.getBoundingClientRect();
  heroTop = r.top + scrollY;
  heroH = r.height;
};
const heroLinked = () => mqDesk.matches && !gentle();
function heroUpdate() {
  const p = Math.min(1, Math.max(0, (scrollY - heroTop + (header?.offsetHeight || 0)) / Math.max(1, 0.8 * heroH)));
  if (heroPerson) heroPerson.style.transform = heroLinked() && p > 0 ? `translate3d(0, ${(-16 * p).toFixed(2)}px, 0)` : '';
  const copy = $('.hero__copy');
  if (copy && !gentle()) copy.style.transform = scrollY > 0 ? `translate3d(0, ${(Math.min(scrollY, heroH) * 0.08).toFixed(1)}px, 0)` : '';
}
/* лазеры из глаз человека на баннере в заголовок смысла; контур вспыхивает, как от разряда */
function heroZap(target, delay = 0) {
  const w = $('[data-who="hero"]');
  if (!w || !target || reduce()) return;
  setTimeout(() => {
    w.querySelector('.who__glow')?.animate(
      [{ opacity: 0.8 }, { opacity: 1, filter: 'brightness(1.6)', offset: 0.15 }, { opacity: 0.35, offset: 0.3 }, { opacity: 1, offset: 0.45 }, { opacity: 0.8 }],
      { duration: 700, easing: 'steps(1, end)' }
    );
    // на телефоне человек стоит под текстом — лучи шли бы через весь текст, поэтому только вспышка контура
    if (mqDesk.matches) fireBeams(w, target);
  }, delay);
}
if (hero) {
  measureHero();
  new ResizeObserver(() => {
    measureHero();
    heroUpdate();
  }).observe(hero);
  new IntersectionObserver((es) => {
    heroVisible = es[0].isIntersecting;
    heroUpdate();
  }).observe(hero);
}

let ticking = false;
addEventListener(
  'scroll',
  () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      if (heroVisible || scrollY < heroTop + heroH + 80) heroUpdate();
      spineUpdate();
      scrubUpdate();
      header?.classList.toggle('is-scrolled', scrollY > 24);
      toTopUpdate();
    });
  },
  { passive: true }
);

/* Два событийных разряда между секциями. */
const bands = [
  makeField('band-1', {
    seed: 5,
    waypoints: [
      [0.0, 0.62],
      [0.3, 0.38],
      [0.62, 0.58],
      [1, 0.34],
    ],
    branches: 13,
    sub: 2,
    twigs: 1,
    width: 3.1,
    widthRef: 120,
    minW: 0.5,
    maxW: 1.15,
    reach: 0.12,
    spread: 1.2,
    step: 0.06,
    rest: 0.9,
  }),
  makeField('band-2', {
    seed: 61,
    waypoints: [
      [0.0, 0.4],
      [0.36, 0.62],
      [0.7, 0.36],
      [1, 0.6],
    ],
    branches: 13,
    sub: 2,
    twigs: 1,
    width: 3.1,
    widthRef: 120,
    minW: 0.5,
    maxW: 1.15,
    reach: 0.12,
    spread: 1.2,
    step: 0.06,
    rest: 0.9,
  }),
];
bands.forEach((f) => f && boltScrub(f, f.host, { start: 0.98, end: 0.5 }));

/* Вопросы: «головная боль» — разряд из-за виска плачущего человека. */
/* из тучки (рисунок) в макушку: конец канала уходит за волосы — фигура лежит выше слоя молнии */
const pain = makeField('pain', {
  seed: 3,
  waypoints: [
    [0.52, 0.26],
    [0.5, 0.48],
    [0.44, 0.78],
  ],
  branches: 6,
  sub: 1,
  twigs: 1,
  width: 3,
  widthRef: 160,
  minW: 0.7,
  maxW: 1.2,
  reach: 0.3,
  spread: 0.9,
  step: 0.07,
  rest: 0.9,
});
// сначала прорисовывается тучка, со второй половины прогресса из неё бьёт молния
const painVisual = $('.questions__visual');
doodleScrub($('.doodle--storm'), painVisual, { start: 1.05, end: 0.35, span: 0.5 });
boltScrub(pain, painVisual, { start: 1.05, end: 0.35, from: 0.5, to: 1 });

/* Услуги: «Разбор полётов» — разряд на листе заканчивается у кончика карандаша. */
const pencil = makeField('pencil', {
  seed: 17,
  waypoints: () => brandWaypoints([0.2, 0.84], [0.638, 0.452]),
  branches: 3,
  sub: 0,
  twigs: 0,
  width: 2.8,
  widthRef: 420,
  reach: 0.22,
  rest: 0.92,
});
boltScrub(pencil, pencil?.host, { start: 0.95, end: 0.4, flash: false });

/* Кабели: короткая дуга между двумя адаптерами. */
const cables = makeField('cables', {
  seed: 41,
  waypoints: [
    [0.912, 0.326],
    [0.918, 0.49],
  ],
  branches: 4,
  sub: 0,
  twigs: 0,
  width: 2.4,
  widthRef: 400,
  reach: 0.25,
  spread: 1.3,
  step: 0.05,
  rest: 0.9,
});
boltScrub(cables, cables?.host, { start: 0.9, end: 0.45, flash: false });

/* Рисунки поверх изображений: прорисовываются по прокрутке и стираются при прокрутке назад. */
$$('[data-doodle]:not(.doodle--storm)').forEach((svg) => doodleScrub(svg, svg.parentElement, { start: 0.98, end: 0.5 }));


/* Услуги: линия-заряд связывает три уровня; номера «заряжаются», когда фронт до них доходит. */
const pkgWrap = $('.packages-wrap');
const spineEl = $('.packages__spine');
const pkgs = $$('[data-pkg]');
let spineStops = [];
let sparkT = 0;
const measureSpine = () => {
  if (!pkgWrap) return;
  const r = pkgWrap.getBoundingClientRect();
  spineStops = pkgs.map((p) => (p.getBoundingClientRect().top - r.top + 40) / r.height);
};
function spineUpdate() {
  if (!pkgWrap || !spineEl) return;
  const r = pkgWrap.getBoundingClientRect();
  if (r.bottom < -200 || r.top > innerHeight + 200) return;
  const p = reduce() ? 1 : Math.min(1, Math.max(0, (innerHeight * 0.62 - r.top) / r.height));
  spineEl.style.setProperty('--p', p.toFixed(4));
  pkgs.forEach((el, i) => el.classList.toggle('is-charged', p >= (spineStops[i] ?? 1)));
  if (!reduce() && p > 0 && p < 1) {
    spineEl.style.setProperty('--spark', '1');
    clearTimeout(sparkT);
    sparkT = setTimeout(() => spineEl.style.setProperty('--spark', '0'), 420);
  }
}
if (pkgWrap) {
  measureSpine();
  new ResizeObserver(() => {
    measureSpine();
    spineUpdate();
  }).observe(pkgWrap);
  spineUpdate();
}

/* ---------- слайдер hero ---------- */
const slider = $('[data-slider]');
const slides = $$('[data-slide]');
const counter = $('[data-current]');
const ticks = $$('.slider-ctrl__ticks i');
let current = 0;
let lastFlip = 0;
function setSlide(i) {
  const n = slides.length;
  i = (i + n) % n;
  if (i === current) return;
  const dir = i > current || (current === n - 1 && i === 0) ? 1 : -1;
  // частые нажатия (чаще раза в 0,7 с): слайд меняется сразу, без проявления
  const now = performance.now();
  const quick = now - lastFlip < 700;
  lastFlip = now;
  // недоигранные проявления предыдущих переключений доводятся до конца — текст всегда на месте
  slides.forEach((s) => {
    s.classList.remove('is-entering');
    s.querySelectorAll('.hero__title, .roll, .hero__lead').forEach((r) => r.getAnimations?.().forEach((a) => a.cancel()));
  });
  const prev = slides[current];
  prev.classList.remove('is-active');
  prev.inert = true;
  prev.setAttribute('aria-hidden', 'true');
  const next = slides[i];
  next.inert = false;
  next.removeAttribute('aria-hidden');
  next.classList.add('is-active');
  current = i;
  if (counter) counter.textContent = String(i + 1);
  ticks.forEach((t, k) => t.classList.toggle('is-on', k === i));
  queueMicrotask(() => autoSchedule?.());
  if (reduce() || quick) return;
  // простое проявление: без обрезки рамкой и без отдельного слоя — заголовок не может «застрять» невидимым.
  // Кнопки внизу не двигаются: колонка заранее держит высоту самого длинного слайда.
  try {
    const E = 'cubic-bezier(.2,.8,.2,1)';
    next.querySelector('.hero__title')?.animate([{ opacity: 0, transform: `translateX(${18 * dir}px)` }, { opacity: 1, transform: 'none' }], { duration: 420, easing: E });
    next.querySelector('.hero__lead')?.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 110, easing: E, fill: 'backwards' });
    heroZap(next.querySelector('.roll'), 480);
  } catch {
    /* эффекты не обязательны: слайд уже переключён */
  }
}
/* баннер не меняет высоту при смене смыслов: блок текста заранее занимает место самого длинного
   слайда, а запас уходит вниз, под кнопки (заголовок всегда сверху, без пустоты посередине) */
function fitHero() {
  const copy = $('.hero__copy');
  const foot = $('.hero__foot');
  if (!slider || !copy || !foot) return;
  const cs = getComputedStyle(copy);
  const maxH = Math.max(...slides.map((s) => s.offsetHeight));
  copy.style.minHeight = Math.ceil(maxH + foot.offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)) + 'px';
}
if (slider) {
  fitHero();
  addEventListener('resize', fitHero);
  (document.fonts?.ready || Promise.resolve()).then(fitHero);
  slides.forEach((s, k) => {
    if (k) {
      s.inert = true;
      s.setAttribute('aria-hidden', 'true');
    }
  });
  $('[data-prev]')?.addEventListener('click', () => setSlide(current - 1));
  $('[data-next]')?.addEventListener('click', () => setSlide(current + 1));
  $('.hero__copy')?.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight') setSlide(current + 1);
    if (e.key === 'ArrowLeft') setSlide(current - 1);
  });
  let sx = null;
  let sy = null;
  slider.addEventListener('touchstart', (e) => ((sx = e.touches[0].clientX), (sy = e.touches[0].clientY)), { passive: true });
  slider.addEventListener(
    'touchend',
    (e) => {
      if (sx == null) return;
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) setSlide(current + (dx < 0 ? 1 : -1));
      sx = null;
    },
    { passive: true }
  );
}

/* ---------- вопросы: аккордеон (можно открыть несколько) ---------- */
let painSeed = 3;
$$('[data-faq-item]').forEach((item) => {
  const btn = item.querySelector('.faq__btn');
  btn.addEventListener('click', () => {
    const open = !item.classList.contains('is-open');
    item.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      playIcon(item.querySelector('.faq__icon'));
      if (pain && !reduce() && !pain.anim && pain.reveal > 0.98) pain.strike({ leader: 120, flash: false, seed: (painSeed += 11) });
    }
  });
  btn.addEventListener('pointerenter', () => {
    if (mqHover.matches) playIcon(item.querySelector('.faq__icon'));
  });
});

/* ---------- модальные окна ---------- */
let opener = null;
const modalBolts = new WeakMap();
function openModal(dlg, from) {
  if (!dlg || dlg.open) return;
  opener = from || document.activeElement;
  dlg.showModal();
  doc.style.overflow = 'hidden';
  const host = dlg.querySelector('.modal__bolt');
  if (host && !reduce()) {
    let f = modalBolts.get(host);
    if (!f) {
      f = new LightningField(host, {
        seed: 9,
        waypoints: [
          [0.0, 0.5],
          [0.35, 0.42],
          [0.7, 0.58],
          [1, 0.48],
        ],
        branches: 6,
        sub: 1,
        twigs: 0,
        width: 2.2,
        widthRef: 52,
        minW: 1,
        maxW: 1,
        reach: 0.06,
        spread: 1.3,
        step: 0.12,
        rest: 0,
        glow: 1,
      });
      modalBolts.set(host, f);
    }
    f.strike({ leader: 140, flash: false, seed: Math.floor(Math.random() * 999) });
  }
  setTimeout(() => dlg.querySelector('input')?.focus(), 30);
}
$$('dialog.modal').forEach((dlg) => {
  dlg.addEventListener('close', () => {
    doc.style.overflow = '';
    opener?.focus?.();
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
  dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
});
$$('[data-open]').forEach((b) => b.addEventListener('click', () => openModal(document.getElementById(b.dataset.open), b)));

/* ---------- чат: провайдер не выбран — честное состояние ---------- */
const chat = $('#chat-panel');
let chatOpener = null;
function setChat(open, { focusBack = true } = {}) {
  if (!chat) return;
  chat.hidden = !open;
  $$('[data-open-chat]').forEach((b) => b.setAttribute('aria-expanded', String(open)));
  if (open) {
    chatOpener = document.activeElement;
    chat.querySelector('[data-chat-close]')?.focus();
  } else if (focusBack) chatOpener?.focus?.();
}
$$('[data-open-chat]').forEach((b) => b.addEventListener('click', () => setChat(chat.hidden)));
$('[data-chat-close]')?.addEventListener('click', () => setChat(false));

/* ---------- формы ---------- */
const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const rePhone = /^\+?[\d\s()\-]{7,20}$/;
const digits = (v) => v.replace(/\D/g, '').length;
const isPhone = (v) => rePhone.test(v) && digits(v) >= 10 && digits(v) <= 15;
const MSG = {
  required: 'Заполните это поле.',
  name: 'Напишите имя — хотя бы две буквы.',
  email: 'Проверьте адрес почты: например, name@mail.ru.',
  phone: 'Проверьте номер: 10–15 цифр, например +7 900 000-00-00.',
  'phone-or-email': 'Укажите телефон (10–15 цифр) или почту вида name@mail.ru.',
};
function validateField(input) {
  const v = input.value.trim();
  const rule = input.dataset.validate;
  let err = '';
  if (input.required && !v) err = MSG.required;
  else if (input.name === 'name' && v.length < 2) err = MSG.name;
  else if (v && rule === 'email' && !reEmail.test(v)) err = MSG.email;
  else if (v && rule === 'phone' && !isPhone(v)) err = MSG.phone;
  else if (v && rule === 'phone-or-email' && !(reEmail.test(v) || isPhone(v))) err = MSG['phone-or-email'];
  const box = document.getElementById(input.getAttribute('aria-describedby'));
  if (err) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
  if (box) box.textContent = err;
  return !err;
}
const DEMO = {
  contact: 'Демо-режим: приём заявок ещё не подключён, поэтому заявка не отправлена. Введённые данные остались в форме.',
  lead: 'Демо-режим: приём заявок ещё не подключён, поэтому заявка не отправлена. Данные остались в форме.',
  checklist: 'Доставка чек-листа ещё не подключена — письмо не отправлено. Адрес остался в поле.',
  brief: 'Демо-режим: приём брифов ещё не подключён, поэтому бриф не отправлен. Ответы и контакты остались в форме.',
};
const OK = {
  contact: 'Заявка отправлена. Ответим по указанному контакту.',
  lead: 'Заявка отправлена. Ответим по указанному телефону.',
  checklist: 'Готово: чек-лист отправлен на указанную почту.',
  brief: 'Бриф отправлен. Вернёмся с предложением по указанному контакту.',
};
$$('form[data-form]').forEach((form) => {
  const kind = form.dataset.form;
  const status = form.querySelector('.form__status');
  const submit = form.querySelector('[type="submit"]');
  const inputs = $$('input[required], input[data-validate]', form);
  inputs.forEach((i) => {
    i.addEventListener('blur', () => i.value && validateField(i));
    i.addEventListener('input', () => i.getAttribute('aria-invalid') && validateField(i));
  });
  const setStatus = (text, cls) => {
    status.className = 'form__status' + (cls ? ' ' + cls : '');
    status.textContent = text;
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submit.getAttribute('aria-busy') === 'true') return;
    const bad = inputs.filter((i) => !validateField(i));
    if (bad.length) {
      setStatus('');
      bad[0].focus();
      return;
    }
    const endpoint = CFG.endpoints?.[kind];
    if (!endpoint) {
      setStatus(DEMO[kind], 'is-demo');
      return;
    }
    submit.setAttribute('aria-busy', 'true');
    submit.disabled = true;
    setStatus('Отправляем…');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus(OK[kind], 'is-ok');
      form.reset();
    } catch {
      setStatus('Не получилось отправить: проблема с соединением или сервером. Данные сохранены — попробуйте ещё раз.', 'is-error');
    } finally {
      submit.removeAttribute('aria-busy');
      submit.disabled = false;
    }
  });
});

/* ---------- скачивания без файла ---------- */
$$('[data-missing-file]').forEach((b) =>
  b.addEventListener('click', () => {
    const box = document.getElementById(b.getAttribute('aria-describedby'));
    const label = b.querySelector('.btn__label')?.textContent || 'документ';
    if (box) box.textContent = `Файл «${label}» ещё не загружен на сайт — скачать пока нечего.`;
  })
);

/* ---------- копирование контактов ---------- */
$$('[data-copy]').forEach((b) =>
  b.addEventListener('click', async () => {
    const span = b.querySelector('span');
    try {
      await navigator.clipboard.writeText(b.dataset.copy);
      span.textContent = 'Скопировано';
    } catch {
      span.textContent = 'Не удалось скопировать';
    }
    setTimeout(() => (span.textContent = 'Скопировать'), 2200);
  })
);

/* ---------- таблица: подсветка колонки, подсказка о прокрутке ---------- */
const table = $('[data-table]');
if (table) {
  const hint = $('#table-hint');
  const cells = $$('[data-col]', table);
  const mark = (col) => cells.forEach((c) => c.classList.toggle('is-col', c.dataset.col === col));
  table.addEventListener('pointerover', (e) => {
    const c = e.target.closest('[data-col]');
    mark(c ? c.dataset.col : null);
  });
  table.addEventListener('pointerleave', () => mark(null));
  const fit = () => hint && (hint.hidden = table.scrollWidth <= table.clientWidth + 1);
  new ResizeObserver(fit).observe(table);
}

/* ---------- видео: старт только по действию ---------- */
const videoBox = $('[data-video]');
const videoEl = videoBox?.querySelector('video');
const playBtn = videoBox?.querySelector('[data-video-play]');
if (videoEl && playBtn) {
  videoEl.removeAttribute('controls');
  playBtn.addEventListener('click', () => {
    videoEl.setAttribute('controls', '');
    videoBox.classList.add('is-playing');
    videoEl.play().catch(() => {});
    videoEl.focus();
  });
}

/* ---------- кнопка «Наверх» ---------- */
const toTop = $('[data-to-top]');
let toTopShown = false;
function toTopUpdate() {
  if (!toTop) return;
  const show = scrollY > innerHeight * 0.75;
  if (show === toTopShown) return;
  toTopShown = show;
  if (show) {
    toTop.hidden = false;
    requestAnimationFrame(() => toTop.classList.add('is-shown'));
  } else {
    toTop.classList.remove('is-shown');
    setTimeout(() => !toTopShown && (toTop.hidden = true), 300);
  }
}
toTop?.addEventListener('click', () => {
  scrollToEl($('#home'));
  const title = $('.hero__slide.is-active .hero__title');
  title?.setAttribute('tabindex', '-1');
  title?.focus({ preventScroll: true });
});

/* =========================================================
   v3: гроза, молния-лента, молнии из глаз, лента по скорости, появления, «говорящий» чат
   ========================================================= */
const storm = new Storm();
storm.enabled = !reduce();
storm.gentle = gentle();
mqReduce.addEventListener?.('change', () => (storm.gentle = gentle()));
const pageXY = (r, fx = 0.5, fy = 0.5) => ({ x: r.left + scrollX + r.width * fx, y: r.top + scrollY + r.height * fy });

/* молнии из глаз персонажа в заголовок: зубчатые лучи, заголовок вспыхивает, на цели — искры */
function fireBeams(whoEl, target, { delay = 0 } = {}) {
  if (!whoEl || !target || reduce()) return;
  const svg = whoEl.querySelector('.who__beams');
  const eyes = (whoEl.dataset.eyes || '').split(',').map(Number);
  if (!svg || eyes.length < 4) return;
  setTimeout(() => {
    const rc = svg.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    if (!rc.width || !tr.width) return;
    const sc = 1024 / rc.width;
    [...svg.querySelectorAll('.beam')].forEach((g, e) => {
      const ex = eyes[e * 2];
      const ey = eyes[e * 2 + 1];
      const tx = (tr.left + tr.width * (e ? 0.62 : 0.38) - rc.left) * sc;
      const ty = (tr.top + tr.height * 0.5 - rc.top) * sc;
      const dx = tx - ex;
      const dy = ty - ey;
      const L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L;
      const ny = dx / L;
      const pts = [];
      const n = 8;
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const off = k === 0 || k === n ? 0 : (Math.random() - 0.5) * Math.min(90, L * 0.05);
        pts.push(`${(ex + dx * t + nx * off).toFixed(0)},${(ey + dy * t + ny * off).toFixed(0)}`);
      }
      g.querySelectorAll('polyline').forEach((pl) => {
        pl.setAttribute('points', pts.join(' '));
        pl.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0, offset: 0.3 }, { strokeDashoffset: 0, offset: 0.72 }, { strokeDashoffset: -1 }], {
          duration: 1400,
          delay: e * 60,
          easing: 'cubic-bezier(.3,.7,.2,1)',
        });
      });
    });
    // попадание: заголовок раскаляется красным свечением
    target.animate(
      [
        { textShadow: '0 0 0 rgba(242,13,13,0)' },
        { textShadow: '0 0 18px rgba(242,13,13,.9), 0 0 56px rgba(242,13,13,.45)', offset: 0.35 },
        { textShadow: '0 0 10px rgba(242,13,13,.4)', offset: 0.7 },
        { textShadow: '0 0 0 rgba(242,13,13,0)' },
      ],
      { duration: 1800, delay: 320, easing: 'ease-out' }
    );
    setTimeout(() => {
      const r = target.getBoundingClientRect();
      [0.38, 0.62].forEach((f) => {
        const p = pageXY(r, f, 0.5);
        storm.sparks(p.x, p.y, 12);
      });
    }, 430);
  }, delay);
}

/* въезд персонажей и вспышка заголовков — по кончику ленты */
const whoTarget = { services: '#services-title', comparison: '#comparison-title', contact: '#contact-title' };
$('[data-who="hero"]')?.classList.add('is-on');
if (reduce()) $$('[data-who]').forEach((w) => w.classList.add('is-on'));
const zapTitle = (el) => {
  if (!el || reduce()) return;
  el.animate(
    [{ color: '#0B0B0B' }, { color: '#F20D0D', offset: 0.12 }, { color: '#0B0B0B', offset: 0.26 }, { color: '#F20D0D', offset: 0.4 }, { color: '#0B0B0B' }],
    { duration: 520, easing: 'steps(1, end)' }
  );
};
const ribbon = new Ribbon({
  storm,
  reduced: reduce(),
  onTrigger(key, on, t) {
    if (key.startsWith('who:')) {
      const w = t.el;
      w.classList.toggle('is-on', on);
      if (on) fireBeams(w, $(whoTarget[key.slice(4)]), { delay: 950 });
    } else if (key.startsWith('pkg-')) {
      document.getElementById(key)?.classList.toggle('is-charged', on);
      // зачёркивание «Сам себе режиссёр» — разряд пробегает по линии, на конце искры
      const strike = on && !reduce() && document.querySelector(`#${key} .strike`);
      if (strike)
        setTimeout(() => {
          const r = strike.getBoundingClientRect();
          storm.sparks(r.right + scrollX, r.top + scrollY + r.height * 0.5, 14, -Math.PI / 4);
        }, 520);
    } else if (key.startsWith('pro:')) {
      t.el.classList.toggle('is-on', on);
      if (on) playIcon(t.el.querySelector('.pro__icon'));
    } else if (key.startsWith('h:') && on) {
      zapTitle(t.el);
      const r = t.el.getBoundingClientRect();
      storm.sparks(r.left + scrollX, r.top + scrollY + r.height * 0.5, 8, Math.PI);
    }
  },
});
['services', 'comparison', 'contact'].forEach((k) => ribbon.watch(`who:${k}`, $(`[data-who="${k}"]`)));
$$('[data-tap]').forEach((el) => ribbon.tap(el.dataset.tap, el));
$$('[data-pro]').forEach((el, i) => ribbon.watch(`pro:${i}`, el));
$$('.section__title').forEach((el) => ribbon.watch(`h:${el.id}`, el));
const measureAll = () => ribbon.measure();
(document.fonts?.ready || Promise.resolve()).then(() => {
  measureAll();
  setTimeout(measureAll, 600);
  // баннер: первый залп лазеров из глаз в заголовок
  heroZap($('.hero__slide.is-active .roll'), 1500);
});
addEventListener('load', measureAll);
addEventListener('scroll', () => ribbon.kick(), { passive: true });

/* удар по клику/тапу на пустом месте */
const hint = $('[data-hint]');
document.addEventListener('click', (e) => {
  if (!storm.enabled || e.button !== 0) return;
  if (e.target.closest('a, button, input, textarea, select, label, video, dialog, .chat, .phone-panel, .mobile-menu, .table-scroll, .pros, summary')) return;
  if (String(getSelection?.() || '').length) return;
  const bx = e.clientX + scrollX;
  const by = e.clientY + scrollY;
  storm.strike({ ax: bx + (Math.random() - 0.5) * 400, ay: scrollY - 12, bx, by, width: innerWidth < 700 ? 3.6 : 4.8, layer: 'front', flash: 0.22, sparks: 34 });
  hint?.classList.add('is-done');
});

/* бегущая лента: скорость и направление следуют за прокруткой, наклон — от скорости */
const mq = $('[data-mq]');
const mqTrack = $('[data-mq-track]');
if (mq && mqTrack) {
  let vis = false;
  let x = 0;
  let dir = 1;
  let vel = 0;
  let skew = 0;
  let lastY = scrollY;
  let last = performance.now();
  let raf = 0;
  const loop = (now) => {
    raf = 0;
    const dt = Math.min(64, Math.max(1, now - last)) / 1000;
    last = now;
    const v = (scrollY - lastY) / dt;
    lastY = scrollY;
    vel += (v - vel) * 0.2;
    if (Math.abs(v) > 20) dir = v > 0 ? 1 : -1;
    const third = mqTrack.scrollWidth / 3 || 1;
    const sp = reduce() ? 0 : 60 + Math.min(900, Math.abs(vel) * 0.5);
    x = (((x + dir * sp * dt) % third) + third) % third;
    const sk = gentle() ? 0 : Math.max(-10, Math.min(10, -vel * 0.006));
    skew += (sk - skew) * 0.15;
    mqTrack.style.transform = `translate3d(${(-x).toFixed(1)}px,0,0) skewX(${skew.toFixed(2)}deg)`;
    mq.classList.toggle('is-fast', Math.abs(vel) > 1200);
    if (vis && !document.hidden && !reduce()) raf = requestAnimationFrame(loop);
  };
  new IntersectionObserver((es) => {
    vis = es[0].isIntersecting;
    if (vis && !raf) {
      last = performance.now();
      lastY = scrollY;
      raf = requestAnimationFrame(loop);
    }
  }).observe(mq);
  document.addEventListener('visibilitychange', () => vis && !raf && !document.hidden && (raf = requestAnimationFrame(loop)));
}

/* появления: заголовки вырастают из маски, остальное поднимается; по очереди */
if (!reduce() && nativeAnimate) {
  const items = [];
  const add = (el, kind) => {
    if (!el || el.__m) return;
    el.__m = kind;
    el.style.opacity = '0';
    items.push(el);
  };
  $$('.section__title, .form__title, .about__punch').forEach((el) => add(el, 'mask'));
  $$(
    '.about__lead, .about__p, .about__cta, .about__media, .services__lead, .pkg__head, .pkg__photo, .pkg__body, .questions__cta, .comparison__actions, .table-scroll, .contact__group, .contact-form .field, .contact-form .form__submit, .site-footer__grid > *, .pro, .quiz__lead, .quiz__box, .cases__lead, .cases__nav, .case'
  ).forEach((el) => add(el, 'up'));
  const E = 'cubic-bezier(.16,1,.3,1)';
  const play = (el, delay) => {
    el.style.opacity = '';
    const kf =
      el.__m === 'mask'
        ? [
            { transform: 'translateY(105%)', clipPath: 'inset(0 0 105% 0)' },
            { transform: 'translateY(0)', clipPath: 'inset(-20% -5% -20% -5%)' },
          ]
        : [
            { opacity: 0, transform: 'translate3d(0,40px,0)' },
            { opacity: 1, transform: 'translate3d(0,0,0)' },
          ];
    el.animate(kf, { duration: el.__m === 'mask' ? 1150 : 950, delay, easing: E, fill: 'backwards' });
  };
  const io = new IntersectionObserver(
    (es) => {
      const vis = es.filter((e) => e.isIntersecting).map((e) => e.target);
      vis.sort((a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1));
      vis.forEach((el, i) => {
        io.unobserve(el);
        play(el, Math.min(i, 4) * 80);
      });
    },
    { rootMargin: '0px 0px -6% 0px', threshold: 0.01 }
  );
  items.forEach((el) => io.observe(el));
  const revealRest = () => {
    if (scrollY + innerHeight < document.documentElement.scrollHeight - 8) return;
    items.forEach((el) => {
      if (el.style.opacity === '0') {
        io.unobserve(el);
        el.style.opacity = '';
      }
    });
  };
  addEventListener('scroll', revealRest, { passive: true });
}

/* «говорящая» кнопка чата: появляется, время от времени «говорит» */
const talk = $('[data-talk]');
if (talk) {
  const phrases = JSON.parse($('#kb-talk')?.textContent || '[]');
  const bubble = talk.querySelector('.talk__bubble');
  const text = talk.querySelector('[data-talk-text]');
  const face = talk.querySelector('.talk__face');
  const waves = talk.querySelector('.talk__waves');
  let n = 0;
  let hover = false;
  const foot = $('.site-footer');
  if (foot) new IntersectionObserver((es) => talk.classList.toggle('is-quiet', es[0].isIntersecting), { threshold: 0.05 }).observe(foot);
  talk.addEventListener('pointerenter', () => (hover = true));
  talk.addEventListener('pointerleave', () => (hover = false));
  if (!reduce() && face.animate) {
    const S = 'cubic-bezier(.34,1.56,.64,1)';
    face.animate([{ transform: 'translateY(18px) scale(.5)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 720, delay: 900, easing: S, fill: 'backwards' });
    setInterval(() => {
      if (document.hidden || hover) return;
      face.animate([{ transform: 'none' }, { transform: 'rotate(-7deg) translateY(-2px)', offset: 0.25 }, { transform: 'rotate(4deg)', offset: 0.5 }, { transform: 'rotate(-3deg)', offset: 0.75 }, { transform: 'none' }], { duration: 900, easing: 'ease-in-out' });
      waves.animate([{ opacity: 0, transform: 'translateX(4px) scale(.6)' }, { opacity: 1, transform: 'none', offset: 0.3 }, { opacity: 1, offset: 0.7 }, { opacity: 0, transform: 'translateX(-2px)' }], { duration: 1100, easing: 'ease-out' });
    }, 6000);
  }
}

/* карточки «За и против» на телефоне: счётчик свайпа */
const prosTrack = $('[data-pros]');
const prosNow = $('[data-pros-current]');
prosTrack?.addEventListener(
  'scroll',
  () => {
    const c = prosTrack.querySelector('.pro');
    if (c && prosNow) prosNow.textContent = String(Math.round(prosTrack.scrollLeft / (c.offsetWidth + 12)) + 1);
  },
  { passive: true }
);
$$('.pro').forEach((card) =>
  card.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    buttonArc(card, 0.035);
    playIcon(card.querySelector('.pro__icon'));
  })
);

/* сравнение на телефоне: вкладки пакетов, переключение — с искрой */
const tabs = $$('.cmp__tab');
function selectTab(i, focus = false) {
  tabs.forEach((t, k) => {
    const on = k === i;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    const panel = document.getElementById(t.getAttribute('aria-controls'));
    if (panel) {
      panel.hidden = !on;
      if (on && !reduce()) {
        panel.classList.remove('is-flash');
        void panel.offsetWidth;
        panel.classList.add('is-flash');
      }
    }
  });
  if (focus) tabs[i].focus();
  const r = tabs[i].getBoundingClientRect();
  storm.strike({ ax: r.left + scrollX + r.width / 2 + (Math.random() - 0.5) * 80, ay: scrollY - 10, bx: r.left + scrollX + r.width / 2, by: r.top + scrollY + 4, width: 2.6, layer: 'front', sparks: 14, flash: 0, scorch: false, smoke: false });
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(i));
  t.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') selectTab((i + 1) % tabs.length, true);
    if (e.key === 'ArrowLeft') selectTab((i + tabs.length - 1) % tabs.length, true);
  });
});

/* услуги: слова слетаются, плавают, уворачиваются от курсора; между ними проскакивают разряды */
const drift = $('[data-drift]');
if (drift) {
  const words = $$('.drift__w', drift);
  if (reduce()) drift.classList.add('is-in');
  else {
    new IntersectionObserver(
      (es) => {
        for (const e of es) if (e.isIntersecting) drift.classList.add('is-in');
      },
      { threshold: 0.25 }
    ).observe(drift);
    const zone = drift.closest('.services__intro') || drift;
    if (mqHover.matches) {
      zone.addEventListener('pointermove', (e) => {
        for (const w of words) {
          const r = w.getBoundingClientRect();
          const dx = r.left + r.width / 2 - e.clientX;
          const dy = r.top + r.height / 2 - e.clientY;
          const d = Math.hypot(dx, dy) || 1;
          const f = Math.max(0, 1 - d / 220) * 12;
          w.style.translate = `${((dx / d) * f).toFixed(1)}px ${((dy / d) * f).toFixed(1)}px`;
        }
      });
      zone.addEventListener('pointerleave', () => words.forEach((w) => (w.style.translate = '')));
    }
    let last = -1;
    storm.ambient(
      drift,
      () => {
        if (words.length < 2) return null;
        let a = Math.floor(Math.random() * words.length);
        if (a === last) a = (a + 1) % words.length;
        let b = (a + 1 + Math.floor(Math.random() * (words.length - 1))) % words.length;
        last = b;
        const ra = words[a].firstElementChild.getBoundingClientRect();
        const rb = words[b].firstElementChild.getBoundingClientRect();
        const from = pageXY(ra, ra.left < rb.left ? 0.92 : 0.08, 0.5);
        const to = pageXY(rb, ra.left < rb.left ? 0.08 : 0.92, 0.5);
        return {
          ax: from.x,
          ay: from.y,
          bx: to.x,
          by: to.y,
          width: 2.2,
          branches: 2,
          sub: 0,
          layer: 'front',
          sparks: 10,
          flash: 0,
          scorch: false,
          smoke: false,
          onHit: () => {
            words[b].classList.add('is-zapped');
            setTimeout(() => words[b].classList.remove('is-zapped'), 480);
          },
        };
      },
      { min: 1800, max: 3600, first: 900 }
    );
  }
}

/* баннер листается сам: пауза при наведении, фокусе, скрытой вкладке и вне экрана; кнопка паузы */
const AUTO_MS = 6500;
const sliderCtrl = $('[data-slider-ctrl]');
const autoBtn = $('[data-autoplay]');
const liveCount = $('.slider-ctrl__count');
let autoOn = !reduce();
let autoHold = false;
let autoVisible = true;
let autoT = 0;
function autoSchedule() {
  clearTimeout(autoT);
  if (!sliderCtrl || slides.length < 2) return;
  const run = autoOn && !autoHold && autoVisible && !document.hidden;
  sliderCtrl.classList.remove('is-auto');
  if (run) {
    void sliderCtrl.offsetWidth;
    sliderCtrl.classList.add('is-auto');
    autoT = setTimeout(() => setSlide(current + 1), AUTO_MS);
  }
  autoBtn?.setAttribute('aria-pressed', String(autoOn));
  autoBtn?.setAttribute('aria-label', autoOn ? 'Остановить автопрокрутку' : 'Включить автопрокрутку');
  liveCount?.setAttribute('aria-live', autoOn ? 'off' : 'polite');
}
if (sliderCtrl) {
  sliderCtrl.style.setProperty('--auto', AUTO_MS + 'ms');
  autoBtn?.addEventListener('click', () => {
    autoOn = !autoOn;
    autoSchedule();
  });
  const zone = sliderCtrl; // пауза при наведении — только на кнопки слайдера, а не на весь экран
  if (mqHover.matches) {
    zone?.addEventListener('pointerenter', () => ((autoHold = true), autoSchedule()));
    zone?.addEventListener('pointerleave', () => ((autoHold = false), autoSchedule()));
  }
  $('.hero__copy')?.addEventListener('focusin', () => ((autoHold = true), autoSchedule()));
  $('.hero__copy')?.addEventListener('focusout', (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) (autoHold = false), autoSchedule();
  });
  document.addEventListener('visibilitychange', autoSchedule);
  new IntersectionObserver((es) => ((autoVisible = es[0].isIntersecting), autoSchedule()), { threshold: 0.3 }).observe($('#home'));
  autoSchedule();
}

/* ---------- мини-бриф: по шагу за раз, выбор мышью сразу ведёт дальше, клавиатурой — кнопкой «Дальше» ---------- */
const quiz = $('[data-quiz]');
if (quiz) {
  const steps = $$('[data-step]', quiz);
  const last = steps.length - 1;
  const nEl = $('[data-quiz-n]', quiz);
  const countEl = nEl?.parentElement;
  const qTicks = $$('.quiz__ticks i', quiz);
  const back = $('[data-quiz-back]', quiz);
  const next = $('[data-quiz-next]', quiz);
  const pkgInput = quiz.querySelector('input[name="package"]');
  let at = 0;
  let byPointer = false;
  const answered = (k) => k >= last || !!steps[k].querySelector('input:checked');
  const sync = () => $$('.quiz__opt', quiz).forEach((o) => o.classList.toggle('is-checked', !!o.querySelector('input:checked')));
  function showResult() {
    const pick = quiz.querySelector('input[data-package]:checked')?.dataset.package || 'consultation';
    $$('[data-pkg]', quiz).forEach((el) => (el.hidden = el.dataset.pkg !== pick));
    const shown = quiz.querySelector(`[data-pkg="${pick}"]`);
    if (pkgInput) pkgInput.value = shown?.querySelector('.quiz__pkg-title')?.textContent || pick;
    const t = shown?.querySelector('.quiz__pkg-title');
    if (t && !reduce()) {
      setTimeout(() => {
        zapTitle(t);
        const r = t.getBoundingClientRect();
        storm.strike({ ax: r.left + scrollX + r.width * 0.3 + (Math.random() - 0.5) * 120, ay: r.top + scrollY - 160, bx: r.left + scrollX + r.width * 0.3, by: r.top + scrollY + 6, width: 2.6, layer: 'front', sparks: 16, flash: 0, scorch: false, smoke: false });
      }, 260);
    }
  }
  function go(k, { focus = false } = {}) {
    k = Math.max(0, Math.min(last, k));
    const dir = k >= at ? 1 : -1;
    steps.forEach((st, i) => {
      const on = i === k;
      st.classList.toggle('is-active', on);
      st.inert = !on;
    });
    at = k;
    if (nEl) nEl.textContent = String(Math.min(k + 1, last));
    countEl?.classList.toggle('is-done', k === last);
    qTicks.forEach((t, i) => t.classList.toggle('is-on', i <= k));
    back.hidden = k === 0;
    next.hidden = k === last;
    next.disabled = !answered(k);
    if (k === last) showResult();
    if (!reduce()) steps[k].animate([{ opacity: 0, transform: `translateX(${3 * dir}%)` }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
    if (focus) (steps[k].querySelector('input:checked') || steps[k].querySelector('input'))?.focus({ preventScroll: true });
  }
  quiz.addEventListener('pointerdown', (e) => (byPointer = !!e.target.closest('.quiz__opt')));
  quiz.addEventListener('keydown', () => (byPointer = false));
  quiz.addEventListener('change', (e) => {
    const inp = e.target;
    if (inp.type !== 'radio') return;
    sync();
    next.disabled = false;
    const r = inp.closest('.quiz__opt').getBoundingClientRect();
    if (!reduce()) storm.sparks(r.right + scrollX - 28, r.top + scrollY + r.height / 2, 12);
    if (byPointer) {
      clearTimeout(quiz._t);
      quiz._t = setTimeout(() => go(at + 1), reduce() ? 0 : 420);
    }
  });
  back.addEventListener('click', () => go(at - 1, { focus: true }));
  next.addEventListener('click', () => go(at + 1, { focus: true }));
  $('[data-quiz-restart]', quiz)?.addEventListener('click', () => {
    $$('input[type="radio"]', quiz).forEach((i) => (i.checked = false));
    sync();
    go(0, { focus: true });
  });
  quiz.classList.add('is-live');
  go(0);
}

/* ---------- кейсы: лента «дел», печать ставится при появлении, полный текст — в окне ---------- */
const casesTrack = $('[data-cases]');
if (casesTrack) {
  const cards = $$('[data-case]', casesTrack);
  const prevB = $('[data-cases-prev]');
  const nextB = $('[data-cases-next]');
  const stepW = () => (cards[1] ? cards[1].offsetLeft - cards[0].offsetLeft : casesTrack.clientWidth);
  // без цифр: стрелки просто листают ленту и гаснут на её краях
  const upd = () => {
    const max = casesTrack.scrollWidth - casesTrack.clientWidth;
    prevB?.setAttribute('aria-disabled', String(casesTrack.scrollLeft <= 4));
    nextB?.setAttribute('aria-disabled', String(casesTrack.scrollLeft >= max - 4));
  };
  upd();
  addEventListener('resize', upd);
  casesTrack.addEventListener('scroll', () => requestAnimationFrame(upd), { passive: true });
  const move = (d) => casesTrack.scrollBy({ left: d * stepW(), behavior: gentle() ? 'auto' : 'smooth' });
  prevB?.addEventListener('click', () => move(-1));
  nextB?.addEventListener('click', () => move(1));
  casesTrack.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') (e.preventDefault(), move(1));
    if (e.key === 'ArrowLeft') (e.preventDefault(), move(-1));
  });
  // мышью ленту можно тянуть, как пальцем; после перетаскивания клик по карточке не срабатывает
  let drag = null;
  casesTrack.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag = { x: e.clientX, left: casesTrack.scrollLeft, moved: false };
  });
  addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 6) {
      drag.moved = true;
      casesTrack.classList.add('is-dragging');
    }
    if (drag.moved) casesTrack.scrollLeft = drag.left - dx;
  });
  addEventListener('pointerup', () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (!moved) return;
    casesTrack.classList.remove('is-dragging');
    // доводка до ближайшей карточки
    const w = stepW();
    casesTrack.scrollTo({ left: Math.round(casesTrack.scrollLeft / w) * w, behavior: gentle() ? 'auto' : 'smooth' });
    const stop = (ev) => (ev.preventDefault(), ev.stopPropagation());
    casesTrack.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => casesTrack.removeEventListener('click', stop, { capture: true }), 0);
  });
  // печать «Выполнено» с хлопком и искрами — каждый раз, когда карточка появляется
  const stampIO = new IntersectionObserver(
    (es) =>
      es.forEach((e) => {
        const c = e.target;
        if (e.isIntersecting && !c.classList.contains('is-stamped')) {
          setTimeout(() => {
            c.classList.add('is-stamped');
            if (reduce()) return;
            setTimeout(() => {
              const r = c.querySelector('.case__stamp').getBoundingClientRect();
              storm.sparks(r.left + scrollX + r.width / 2, r.top + scrollY + r.height / 2, 14);
            }, 220);
          }, 160 + (cards.indexOf(c) % 3) * 140);
        } else if (!e.isIntersecting && e.boundingClientRect.top > innerHeight) c.classList.remove('is-stamped');
      }),
    { threshold: 0.45 }
  );
  if (reduce()) cards.forEach((c) => c.classList.add('is-stamped'));
  else cards.forEach((c) => stampIO.observe(c));
  // окно дела
  const dlg = $('#case-dialog');
  $$('[data-case-open]').forEach((b) =>
    b.addEventListener('click', () => {
      const card = b.closest('[data-case]');
      if (!dlg || !card) return;
      $('[data-case-no]', dlg).textContent = card.querySelector('.case__no').textContent + ' · ' + card.querySelector('.case__tag').textContent;
      $('[data-case-title]', dlg).textContent = card.querySelector('.case__title').textContent;
      const m = $('[data-case-metric]', dlg);
      m.innerHTML = '';
      const big = document.createElement('b');
      big.textContent = card.querySelector('.case__big').textContent;
      m.append(big, document.createTextNode(card.querySelector('.case__cap').textContent));
      $('[data-case-body]', dlg).innerHTML = card.querySelector('.case__full').innerHTML;
      openModal(dlg, b);
      setTimeout(() => dlg.querySelector('.modal__close')?.focus(), 40);
    })
  );
}

/* ---------- старт ---------- */
header?.classList.toggle('is-scrolled', scrollY > 24);
toTopUpdate();
scrubUpdate(true);
addEventListener('resize', () => scrubUpdate(true));
})();
})();
