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
import { generateBolt, mulberry32 } from './lightning.js';

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
export function boltBetween(ax, ay, bx, by, o = {}) {
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
export const PALETTE_ON_RED = [
  { c: '255,240,235', blur: 40, a: 0.7, sc: '255,235,230', sa: 0.2, mul: 3, add: 2 },
  { c: '255,230,224', blur: 12, a: 0.95, sc: '255,214,206', sa: 0.9, mul: 1.9, add: 1 },
  { c: '255,255,255', mul: 1, add: 0.4, a: 1 },
];
const BURN = [
  { c: '255,90,40', mul: 3.2, add: 2, a: 0.22 },
  { c: '58,14,8', mul: 0.9, add: 0.6, a: 0.75 },
];

export class Storm {
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
      if (o.flash) this.flash(o.flash);
      if (o.shake) shake(o.shake, o.shakeAmp ?? 5);
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
export function shake(el, amp = 5) {
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

export { drawElectric };
