/*
 * КБ-13 · «Молния-лента».
 * Разряд растёт по полю страницы вслед за прокруткой: левая полоса → прыжок через полосу-разряд →
 * правая полоса → … до футера. У кончика — раскалённая голова с треском. Когда кончик проходит
 * отмеченные элементы, вызывается onTrigger(key, on) — люди въезжают, номера загораются и т. п.
 * Рисуется на одном fixed-canvas под контентом; считаются только видимые участки.
 */
import { mulberry32 } from './lightning.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const gauss = (r) => (r() + r() + r() + r() - 2) * 1.2;

export class Ribbon {
  constructor({ storm, reduced = false, onTrigger } = {}) {
    this.storm = storm;
    this.reduced = reduced;
    this.onTrigger = onTrigger || (() => {});
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'ribbon';
    this.canvas.setAttribute('aria-hidden', 'true');
    document.body.prepend(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.k = Math.min(devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.5 : 2);
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
    this.canvas.width = Math.round(vw * this.k);
    this.canvas.height = Math.round(this.vh * this.k);
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
      this.tip += (target - this.tip) * (1 - Math.pow(0.72, dt / 16.67));
      if (Math.abs(target - this.tip) < 0.3) this.tip = target;
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
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(k, 0, 0, k, 0, -sy * k);
    const top = Math.max(this.start, sy - 60);
    const bot = Math.min(this.tip, sy + this.vh + 60);
    const flick = this.reduced ? 1 : 0.86 + Math.random() * 0.14;
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
          if (py > Math.max(this.start, sy - 40)) {
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
    if (this.tip < this.end - 1 || this.end < sy - 30 || this.end > sy + this.vh + 30) return;
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
