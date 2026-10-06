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

export function mulberry32(seed) {
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
export const BRAND_PATH = [
  [0, 1],
  [0.3235, 0.665],
  [0.3235, 0.585],
  [0.589, 0.437],
  [0.589, 0.35],
  [1, 0],
];

/* Перенос опорных точек знака в прямоугольник поля: from/to — концы диагонали. */
export function brandWaypoints(from, to, { steps = true } = {}) {
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
export function generateBolt(o) {
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

export function drawBolt(ctx, bolt, s) {
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
export const clock = { now: () => performance.now() };

/**
 * Поле молнии внутри host-элемента: два canvas (свечение + канал).
 * opts: generateBolt-опции + { rest, glow, flash, dpr, glowBlur, reveal, widthRef }
 */
export class LightningField {
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
export function arcPath(x1, y1, x2, y2, { seed = 1, rough = 0.12, minSeg = 6 } = {}) {
  const rand = mulberry32(seed);
  const pts = [x1, y1];
  subdivide(x1, y1, x2, y2, Math.hypot(x2 - x1, y2 - y1) * rough, minSeg, 0.55, rand, pts);
  let d = `M${pts[0].toFixed(1)} ${pts[1].toFixed(1)}`;
  for (let i = 2; i < pts.length; i += 2) d += `L${pts[i].toFixed(1)} ${pts[i + 1].toFixed(1)}`;
  return d;
}
