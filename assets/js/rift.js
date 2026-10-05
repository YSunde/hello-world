/*
 * КБ-13 · «Разрыв» — скроллворлд.
 * Закреплённая сцена: при прокрутке бумага трескается по молнии, удар рвёт её, половины
 * расходятся, в красном разломе проходят два смысла, между краями прыгают разряды;
 * в конце половины сходятся и удар «сваривает» шов — остаётся выжженный след.
 * Прокрутка в обе стороны: всё обратимо. Текст — настоящий HTML, обрезается по разлому.
 */
import { generateBolt, mulberry32 } from './lightning.js';
import { drawElectric, PALETTE_ON_RED, boltBetween } from './storm.js';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const seg = (p, a, b) => clamp((p - a) / (b - a));

/* таймлайн прогресса секции */
const T = {
  strike: 0.035,
  open1: [0.04, 0.22],
  hold1: [0.26, 0.48],
  swap: [0.48, 0.56],
  hold2: [0.56, 0.76],
  close: [0.78, 0.92],
  weld: 0.925,
};

export class Rift {
  constructor(section, { storm } = {}) {
    this.sec = section;
    this.stage = section.querySelector('.rift__stage');
    this.canvas = section.querySelector('.rift__canvas');
    this.ctx = this.canvas.getContext('2d');
    this.texts = [...section.querySelectorAll('.rift__text')];
    this.hint = section.querySelector('.rift__hint');
    this.storm = storm;
    this.p = 0;
    this.arcs = [];
    this.events = { strike: false, weld: false, swap: false };
    this.flashes = [];
    this.weldT = -1e9;
    this.raf = 0;
    this.visible = false;
    this.k = Math.min(devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.5 : 2);
    this.onResize = () => this.resize();
    addEventListener('resize', this.onResize);
    new IntersectionObserver((es) => {
      this.visible = es[0].isIntersecting;
      if (this.visible) this.kick();
    }).observe(section);
    this.resize();
  }

  resize() {
    const r = this.stage.getBoundingClientRect();
    this.W = Math.round(r.width);
    this.H = Math.round(r.height);
    this.canvas.width = Math.round(this.W * this.k);
    this.canvas.height = Math.round(this.H * this.k);
    this.mobile = this.W < 700;
    this.buildEdges();
    this.measure();
    this.kick();
  }

  measure() {
    const r = this.sec.getBoundingClientRect();
    this.top = r.top + scrollY;
    this.len = Math.max(1, r.height - innerHeight);
  }

  /* линия разрыва: зигзаг молнии сверху вниз + «волокна» бумаги у каждой половины */
  buildEdges() {
    const { W, H } = this;
    const rand = mulberry32(1313);
    const a = (this.mobile ? 0.07 : 0.07) * W;
    // неровный разрыв: случайные шаги по вертикали, крупные изломы чередуются с мелкими
    this.macro = [[W / 2, -0.04 * H]];
    let y = -0.04 * H;
    let side = 1;
    while (y < 1.04 * H) {
      y += H * (0.045 + rand() * 0.09);
      const big = rand() < 0.45;
      side = big ? -side : rand() < 0.5 ? side : -side;
      this.macro.push([W / 2 + side * a * (big ? 0.7 + rand() * 0.5 : 0.15 + rand() * 0.3), Math.min(y, 1.04 * H)]);
    }
    const fiber = (seed) => {
      const r = mulberry32(seed);
      const pts = [];
      for (let i = 0; i < this.macro.length - 1; i++) {
        const [x1, y1] = this.macro[i];
        const [x2, y2] = this.macro[i + 1];
        const n = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 5));
        for (let j = 0; j < n; j++) {
          const t = j / n;
          pts.push([lerp(x1, x2, t) + (r() - 0.5) * 3.2 + (r() < 0.08 ? (r() - 0.5) * 7 : 0), lerp(y1, y2, t) + (r() - 0.5) * 2]);
        }
      }
      pts.push(this.macro[this.macro.length - 1]);
      return pts;
    };
    this.edgeL = fiber(71);
    this.edgeR = fiber(97);
    // молния по линии разрыва
    const L = H;
    const wp = this.macro.map(([x, y]) => [x / L, y / L]);
    this.edgeL[0] = this.macro[0];
    this.crackBolt = { bolt: generateBolt({ seed: 13, aspect: 1, waypoints: wp, branches: 5, sub: 1, twigs: 0, width: 1, taper: 0.7, rough: 0.03, minSeg: 0.02, step: 0.05, jag: 0.35, reach: 0.12, spread: 0.9 }), L, ax: 0, ay: 0 };
  }

  edgeX(edge, y) {
    for (let i = 1; i < edge.length; i++) {
      if (edge[i][1] >= y) {
        const [x1, y1] = edge[i - 1];
        const [x2, y2] = edge[i];
        return lerp(x1, x2, (y - y1) / Math.max(1e-6, y2 - y1));
      }
    }
    return edge[edge.length - 1][0];
  }

  /* раскрытие разлома: смещение каждой половины, px */
  gapAt(p) {
    const { W } = this;
    const full = this.mobile ? W * 0.52 : Math.min(W * 0.4, 620);
    const narrow = full * 0.82;
    if (p < T.open1[0]) return 0;
    if (p < T.open1[1]) return ease(seg(p, ...T.open1)) * full;
    if (p < T.swap[0]) return full;
    if (p < T.swap[1]) {
      const q = seg(p, ...T.swap);
      return lerp(full, narrow, Math.sin(q * Math.PI));
    }
    if (p < T.close[0]) return full;
    if (p < T.close[1]) return (1 - ease(seg(p, ...T.close))) * full;
    return 0;
  }

  update() {
    // трещина растёт, пока секция въезжает в экран
    this.enter = clamp((scrollY - (this.top - innerHeight)) / innerHeight);
    const p = clamp((scrollY - this.top) / this.len);
    const prev = this.p;
    this.p = p;
    const down = p > prev;
    const now = performance.now();
    // события при прокрутке вниз; при обратной — сбрасываются
    if (down && prev < T.strike && p >= T.strike) this.fire('strike', now);
    if (down && prev < (T.swap[0] + T.swap[1]) / 2 && p >= (T.swap[0] + T.swap[1]) / 2) this.fire('swap', now);
    if (down && prev < T.weld && p >= T.weld) this.fire('weld', now);
    if (!down && p < T.weld - 0.02) this.weldT = -1e9;
    this.kick();
  }

  fire(kind, now) {
    const rect = this.stage.getBoundingClientRect();
    const pageY = rect.top + scrollY;
    if (kind === 'strike' || kind === 'weld') {
      this.flashes.push({ t0: now, kind });
      if (kind === 'weld') this.weldT = now;
      if (this.storm) {
        this.storm.flash(kind === 'weld' ? 0.32 : 0.26);
        const pts = kind === 'weld' ? [0.3, 0.55, 0.8] : [0.45];
        for (const f of pts) {
          const y = this.H * f;
          this.storm.sparks(rect.left + this.edgeX(this.macro, y), pageY + y, kind === 'weld' ? 14 : 22);
        }
      }
    } else if (kind === 'swap') {
      for (let i = 0; i < 4; i++) this.spawnArc(now + i * 40, 3.2);
    }
  }

  spawnArc(t0, w = 2.2) {
    const d = this.gapAt(this.p);
    if (d < 24) return;
    const r = Math.random;
    const y = this.H * (0.12 + r() * 0.76);
    const y2 = y + (r() - 0.5) * this.H * 0.12;
    const xl = this.edgeX(this.edgeL, y) - d + 3;
    const xr = this.edgeX(this.edgeR, y2) + d - 3;
    this.arcs.push({ B: boltBetween(xl, y, xr, y2, { seed: Math.floor(r() * 1e6), branches: 2, sub: 0, bend: 0.1, step: 0.11 }), t0, w });
  }

  kick() {
    if (!this.raf) this.raf = requestAnimationFrame(() => this.frame());
  }

  frame() {
    this.raf = 0;
    const now = performance.now();
    const { ctx, W, H, k, p } = this;
    const d = this.gapAt(p);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // красный слой
    if (d > 0.5) {
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, '#f20d0d');
      g.addColorStop(1, '#a8040c');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // разряды между краями
      if (this.visible && d > 40 && Math.random() < 0.06) this.spawnArc(now, 1.6 + Math.random() * 1.6);
    }
    this.arcs = this.arcs.filter((a) => now - a.t0 < 300);
    for (const a of this.arcs) {
      const el = now - a.t0;
      if (el < 0) continue;
      const I = el < 50 ? el / 50 : [1.5, 0.4, 1.1, 0.3, 0.8][Math.min(4, Math.floor((el - 50) / 50))] * (1 - el / 300);
      drawElectric(ctx, a.B, { k: 1, ox: 0, oy: 0, w: a.w, reveal: clamp(el / 50), I, palette: PALETTE_ON_RED });
    }

    // половины бумаги
    const half = (edge, dx, side) => {
      ctx.save();
      ctx.beginPath();
      const outer = side < 0 ? -40 : W + 40;
      ctx.moveTo(outer, -40);
      for (const [x, y] of edge) ctx.lineTo(x + dx, y);
      ctx.lineTo(outer, H + 40);
      ctx.closePath();
      if (d > 0.5) {
        ctx.shadowColor = 'rgba(40,0,0,0.38)';
        ctx.shadowBlur = 26;
        ctx.shadowOffsetX = -side * 8;
      }
      ctx.fillStyle = '#f5f4f0';
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      if (d > 0.5) {
        // затенение у загнутой кромки + белые волокна
        ctx.clip();
        ctx.beginPath();
        edge.forEach(([x, y], i) => (i ? ctx.lineTo(x + dx, y) : ctx.moveTo(x + dx, y)));
        ctx.lineWidth = 26;
        ctx.strokeStyle = 'rgba(120,108,96,0.10)';
        ctx.stroke();
        ctx.lineWidth = 9;
        ctx.strokeStyle = 'rgba(120,108,96,0.08)';
        ctx.stroke();
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
      ctx.restore();
    };
    half(this.edgeL, -d, -1);
    half(this.edgeR, d, 1);

    // трещина: тянется по линии разрыва, пока секция въезжает; на кончике — искрящий фронт
    const crack = this.p > 0 ? 1 : this.enter ?? 0;
    if (crack > 0.01 && d < 0.5) {
      const n = this.edgeL.length;
      const upto = Math.max(1, Math.floor(crack * (n - 1)));
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i <= upto; i++) {
        const [x, y] = this.edgeL[i];
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.stroke();
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = 'rgba(11,11,11,0.85)';
      ctx.stroke();
      if (crack < 1) {
        const [tx, ty] = this.edgeL[upto];
        const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, 22);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.25, 'rgba(255,60,30,0.9)');
        g.addColorStop(1, 'rgba(242,13,13,0)');
        ctx.fillStyle = g;
        ctx.fillRect(tx - 22, ty - 22, 44, 44);
      }
      ctx.restore();
    }

    // вспышки удара по линии разрыва
    this.flashes = this.flashes.filter((f) => now - f.t0 < 520);
    for (const f of this.flashes) {
      const el = now - f.t0;
      const I = el < 60 ? 0.6 : [1.9, 0.4, 1.3, 0.35, 0.9, 0.2, 0.5][Math.min(6, Math.floor((el - 60) / 60))] * (1 - el / 520);
      drawElectric(ctx, this.crackBolt, { k: 1, ox: 0, oy: 0, w: 5.5, reveal: clamp(el / 60), I });
    }

    // сварной шов: тлеющая кромка остывает в выжженный след
    if (p >= T.weld - 0.005 && d < 0.5) {
      const el = now - this.weldT;
      const ember = clamp(1 - el / 1400);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      this.edgeL.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (ember > 0) {
        ctx.shadowColor = `rgba(255,70,30,${0.9 * ember})`;
        ctx.shadowBlur = 16;
        ctx.lineWidth = 4;
        ctx.strokeStyle = `rgba(255,90,40,${0.85 * ember})`;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = 'rgba(60,14,8,0.8)';
      ctx.stroke();
      ctx.restore();
    }

    // тексты: обрезка по разлому
    if (this.texts.length) {
      const pts = [];
      const step = Math.max(1, Math.floor(this.edgeL.length / 40));
      for (let i = 0; i < this.edgeL.length; i += step) pts.push(`${(this.edgeL[i][0] - d + 2).toFixed(1)}px ${this.edgeL[i][1].toFixed(1)}px`);
      for (let i = this.edgeR.length - 1; i >= 0; i -= step) pts.push(`${(this.edgeR[i][0] + d - 2).toFixed(1)}px ${this.edgeR[i][1].toFixed(1)}px`);
      const clip = d > 1 ? `polygon(${pts.join(',')})` : 'polygon(0 0,0 0,0 0)';
      const o1 = p < T.swap[0] ? 1 : 1 - seg(p, T.swap[0], (T.swap[0] + T.swap[1]) / 2);
      const o2 = p < (T.swap[0] + T.swap[1]) / 2 ? 0 : seg(p, (T.swap[0] + T.swap[1]) / 2, T.swap[1]);
      this.texts.forEach((t, i) => {
        t.style.clipPath = clip;
        const o = i === 0 ? o1 : o2;
        t.style.opacity = o.toFixed(3);
        t.style.transform = `translateY(${((1 - o) * (i === 0 ? -14 : 14)).toFixed(1)}px)`;
        t.toggleAttribute('aria-hidden', false);
      });
    }
    if (this.hint) this.hint.style.opacity = String(1 - seg(p, 0, 0.03));

    if (this.visible && (d > 0.5 || this.flashes.length || this.arcs.length || now - this.weldT < 1500 || ((this.enter ?? 1) < 1 && this.p === 0))) this.kick();
  }
}
