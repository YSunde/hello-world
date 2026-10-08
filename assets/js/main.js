/*
 * КБ-13 · поведение страницы.
 * Без зависимостей. Всё содержимое видно и без JS; скрипт только добавляет взаимодействие и движение.
 */
import { LightningField, brandWaypoints, arcPath } from './lightning.js';
import { Storm } from './storm.js';
import { Ribbon } from './ribbon.js';

const doc = document.documentElement;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const CFG = JSON.parse($('#kb-config')?.textContent || '{}');

const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
const mqHover = matchMedia('(hover: hover) and (pointer: fine)');
const mqDesk = matchMedia('(min-width: 900px)');
const reduce = () => mqReduce.matches;
const touch = () => !mqHover.matches;

if (/[?&]grid\b/.test(location.search)) doc.classList.add('show-grid');

const scrollToEl = (el) => el.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'start' });

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
      f.strike({ from: Math.min(f.reveal, 0.985), to: 1, leader: 70, flash: flash && !touch() });
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

/* Hero: разряд за человеком с табличкой; открывается при прокрутке. */
const hero = $('#home');
const placard = $('[data-placard]');
const HERO_BASE = 0.42;
const heroSeeds = [13, 29, 47];
const heroBolt = makeField('hero', {
  seed: heroSeeds[0],
  waypoints: () => brandWaypoints([0.03, 0.985], [0.985, 0.02]),
  branches: 4,
  sub: 1,
  twigs: 0,
  step: 0.06,
  jag: 0.6,
  width: 5.4,
  widthRef: 860,
  reach: 0.26,
  rest: 0.92,
});
let heroP = 0;
let heroTop = 0;
let heroH = 1;
let heroVisible = true;
const measureHero = () => {
  const r = hero.getBoundingClientRect();
  heroTop = r.top + scrollY;
  heroH = r.height;
};
const heroLinked = () => mqDesk.matches && !reduce();
function heroUpdate() {
  const p = Math.min(1, Math.max(0, (scrollY - heroTop + (header?.offsetHeight || 0)) / Math.max(1, 0.8 * heroH)));
  heroP = p;
  if (heroBolt && heroIntroDone && heroLinked()) heroBolt.setReveal(HERO_BASE + (1 - HERO_BASE) * p);
  if (placard) placard.style.transform = heroLinked() ? `translate3d(0, ${(-16 * p).toFixed(2)}px, 0)` : '';
  const copy = $('.hero__copy');
  if (copy && !reduce()) copy.style.transform = scrollY > 0 ? `translate3d(0, ${(Math.min(scrollY, heroH) * 0.08).toFixed(1)}px, 0)` : '';
}
let heroIntroDone = false;
if (heroBolt) {
  measureHero();
  new ResizeObserver(() => {
    measureHero();
    heroUpdate();
  }).observe(hero);
  new IntersectionObserver((es) => {
    heroVisible = es[0].isIntersecting;
    heroUpdate();
  }).observe(hero);
  const intro = () => {
    if (reduce()) {
      heroBolt.settle(1);
      heroIntroDone = true;
      return;
    }
    const to = heroLinked() ? Math.max(HERO_BASE, HERO_BASE + (1 - HERO_BASE) * heroP) : 1;
    heroBolt.strike({ from: 0, to, leader: 220, flash: !touch() }).then(() => {
      heroIntroDone = true;
      heroUpdate();
    });
  };
  (document.fonts?.ready || Promise.resolve()).then(() => setTimeout(intro, 260));
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

/* Контакты: разряд от красной трубки в свободное поле. */
const phoneBolt = makeField('phone', {
  seed: 23,
  waypoints: () => brandWaypoints([0.12, 0.86], [0.98, 0.04]),
  branches: 3,
  sub: 1,
  twigs: 0,
  step: 0.08,
  jag: 0.6,
  width: 3.2,
  widthRef: 300,
  reach: 0.26,
  rest: 0.9,
});
boltScrub(phoneBolt, $('.contact__visual'), { start: 1, end: 0.45 });

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
function setSlide(i, { strike = true } = {}) {
  const n = slides.length;
  i = (i + n) % n;
  if (i === current) return;
  // быстрые повторные переключения: недоигранные «барабаны» отменяются, текст всегда на месте
  slides.forEach((s) => s.querySelectorAll('.roll').forEach((r) => r.getAnimations?.().forEach((a) => a.cancel())));
  const prev = slides[current];
  prev.classList.remove('is-active', 'is-entering');
  prev.inert = true;
  prev.setAttribute('aria-hidden', 'true');
  const next = slides[i];
  next.inert = false;
  next.removeAttribute('aria-hidden');
  next.classList.add('is-active');
  if (!reduce()) {
    next.classList.remove('is-entering');
    void next.offsetWidth;
    next.classList.add('is-entering');
    const dir = i > current || (current === n - 1 && i === 0) ? 1 : -1;
    const E = 'cubic-bezier(.7,0,.2,1)';
    prev.querySelector('.roll')?.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${-105 * dir}%)` }], { duration: 420, easing: E });
    next.querySelector('.roll')?.animate(
      [{ transform: `translateY(${105 * dir}%)` }, { transform: `translateY(${-6 * dir}%)`, offset: 0.78 }, { transform: 'translateY(0)' }],
      { duration: 640, easing: E }
    );
    setTimeout(() => fireBeams($('[data-who="hero"]'), next.querySelector('.roll')), 480);
  }
  queueMicrotask(() => autoSchedule?.());
  current = i;
  if (counter) counter.textContent = String(i + 1);
  ticks.forEach((t, k) => t.classList.toggle('is-on', k === i));
  if (heroBolt && strike) {
    if (reduce()) {
      heroBolt.build(heroSeeds[i]);
      heroBolt.settle(1);
    } else {
      const to = heroLinked() ? HERO_BASE + (1 - HERO_BASE) * heroP : 1;
      heroIntroDone = false;
      heroBolt
        .fade(110)
        .then(() => heroBolt.strike({ from: 0, to, leader: 170, flash: !touch(), seed: heroSeeds[i] }))
        .then(() => {
          heroIntroDone = true;
          heroUpdate();
        });
    }
  }
}
if (slider) {
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
};
const OK = {
  contact: 'Заявка отправлена. Ответим по указанному контакту.',
  lead: 'Заявка отправлена. Ответим по указанному телефону.',
  checklist: 'Готово: чек-лист отправлен на указанную почту.',
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
const heroWho = $('[data-who="hero"]');
heroWho?.classList.add('is-on');
if (reduce()) $$('[data-who]').forEach((w) => w.classList.add('is-on'));
const zapTitle = (el) => {
  if (!el || reduce()) return;
  el.animate(
    [{ color: 'var(--ink)' }, { color: 'var(--red)', textShadow: '0 0 14px rgba(242,13,13,.55)', offset: 0.12 }, { color: 'var(--ink)', offset: 0.26 }, { color: 'var(--red)', offset: 0.4 }, { color: 'var(--ink)' }],
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
  // герой: молния из глаз в заголовок после первого удара
  setTimeout(() => fireBeams(heroWho, $('.hero__slide.is-active .roll')), 1700);
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
    const sk = reduce() ? 0 : Math.max(-10, Math.min(10, -vel * 0.006));
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
if (!reduce() && 'animate' in Element.prototype) {
  const items = [];
  const add = (el, kind) => {
    if (!el || el.__m) return;
    el.__m = kind;
    el.style.opacity = '0';
    items.push(el);
  };
  $$('.section__title, .form__title, .about__punch').forEach((el) => add(el, 'mask'));
  $$(
    '.about__lead, .about__p, .about__cta, .about__media, .services__lead, .pkg__head, .pkg__photo, .pkg__body, .questions__cta, .comparison__actions, .table-scroll, .contact__group, .contact-form .field, .contact-form .form__submit, .site-footer__grid > *, .pro'
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

/* ---------- старт ---------- */
header?.classList.toggle('is-scrolled', scrollY > 24);
toTopUpdate();
scrubUpdate(true);
addEventListener('resize', () => scrubUpdate(true));
mqReduce.addEventListener?.('change', () => fields.forEach((f) => f.settle(f.reveal || 1)));
