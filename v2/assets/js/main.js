/*
 * КБ-13 · поведение страницы (v2 «Гроза на бумаге»).
 * Без зависимостей. Всё содержимое видно и без JS; скрипт только добавляет взаимодействие и движение.
 */
import { arcPath } from './lightning.js';
import { Storm } from './storm.js';
import { Rift } from './rift.js';

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
function buttonArc(btn) {
  const host = btn.querySelector('.btn__arc');
  if (!host || reduce()) return;
  const w = btn.offsetWidth + 4;
  const d = arcPath(0, 7, w, 7, { seed: arcSeed++, rough: 0.16, minSeg: 7 });
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

/* =========================================================
   ГРОЗА (v2): фон, удары по тапу, зоны с постоянной динамикой
   ========================================================= */
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const pageRect = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
};
/* точка в пикселях исходного кадра → координаты страницы (img с object-fit: contain) */
function imgPoint(img, fx, fy) {
  const r = img.getBoundingClientRect();
  const iw = +img.getAttribute('width');
  const ih = +img.getAttribute('height');
  const s = Math.min(r.width / iw, r.height / ih);
  const pos = getComputedStyle(img).objectPosition.split(' ').map(parseFloat);
  const ox = (r.width - iw * s) * ((isNaN(pos[0]) ? 50 : pos[0]) / 100);
  const oy = (r.height - ih * s) * ((isNaN(pos[1]) ? 50 : pos[1]) / 100);
  return { x: r.left + scrollX + ox + fx * s, y: r.top + scrollY + oy + fy * s };
}
const inView = (el, m = 0) => {
  const r = el.getBoundingClientRect();
  return r.bottom > m && r.top < innerHeight - m;
};

const storm = new Storm();
let stormPref = 'on';
try {
  stormPref = localStorage.getItem('kb13-storm') || (reduce() ? 'off' : 'on');
} catch {
  stormPref = reduce() ? 'off' : 'on';
}
const toggleBtn = $('[data-storm-toggle]');
function setStorm(on, save = true) {
  storm.enabled = on;
  toggleBtn?.setAttribute('aria-pressed', String(on));
  toggleBtn?.setAttribute('aria-label', on ? 'Гроза: включена' : 'Гроза: выключена');
  if (save)
    try {
      localStorage.setItem('kb13-storm', on ? 'on' : 'off');
    } catch {}
}
setStorm(stormPref !== 'off', false);
toggleBtn?.addEventListener('click', () => {
  setStorm(!storm.enabled);
  if (storm.enabled) {
    const r = toggleBtn.getBoundingClientRect();
    storm.strike({ ax: r.left + scrollX + r.width / 2 - 120, ay: scrollY - 10, bx: r.left + scrollX + r.width / 2, by: r.bottom + scrollY - 6, width: 3, layer: 'front', flash: 0.12, sparks: 18, scorch: false });
  }
});

/* Hero: удары в «землю» рядом с человеком и в заголовок */
const hero = $('#home');
const heroTitle = $('#hero-title');
const placardImg = $('.placard__img');
const zap = (el) => {
  if (!el) return;
  el.classList.remove('zap');
  void el.offsetWidth;
  el.classList.add('zap');
};
function pickHero() {
  const H = pageRect(hero);
  const mobile = innerWidth < 900;
  if (Math.random() < 0.4) {
    const t = pageRect(heroTitle);
    const bx = t.x + rnd(0.1, 0.9) * t.w;
    const by = t.y + rnd(0.25, 0.85) * t.h;
    return { ax: bx + rnd(-160, 160), ay: H.y - 4, bx, by, width: mobile ? 3.4 : 4.6, flash: 0.16, sparks: 24, shake: heroTitle, onHit: () => zap(heroTitle), scorch: false };
  }
  const p = pageRect(placardImg);
  const side = Math.random() < 0.5 ? -1 : 1;
  const bx = side < 0 ? p.x + rnd(-0.12, 0.12) * p.w : p.x + p.w * rnd(0.88, 1.08);
  const by = H.y + H.h - 3;
  return { ax: p.x + p.w * rnd(0.2, 0.8), ay: H.y - 4, bx, by, width: mobile ? 3.6 : 5, flash: 0.2, sparks: 30, shake: $('[data-placard]'), sparkDir: -Math.PI / 2 };
}
storm.ambient(hero, pickHero, { min: 2600, max: 5200, first: 650 });

/* Удар по тапу/клику на пустом месте */
const hint = $('[data-hint]');
document.addEventListener('click', (e) => {
  if (!storm.enabled || e.button !== 0) return;
  if (e.target.closest('a, button, input, textarea, select, label, video, dialog, .chat, .phone-panel, .mobile-menu, [role="tab"], .table-scroll, .pkgs__track, summary')) return;
  if (getSelection && String(getSelection()).length) return;
  const bx = e.clientX + scrollX;
  const by = e.clientY + scrollY;
  storm.strike({ ax: bx + rnd(-200, 200), ay: scrollY - 12, bx, by, width: innerWidth < 700 ? 3.8 : 5, layer: 'front', flash: 0.24, sparks: 36, shake: e.target.closest('section, footer, .ticker') });
  hint?.classList.add('is-done');
});

/* «Решим проблемы за 13 минут»: молния спускается по проводу в трубку */
const callout = $('.callout');
const receiverImg = $('.callout__img');
if (callout && receiverImg)
  storm.ambient(
    callout,
    () => {
      const top = imgPoint(receiverImg, 1085, 0);
      const hit = imgPoint(receiverImg, rnd(960, 1060), rnd(220, 300));
      const vis = pageRect(receiverImg);
      return { ax: top.x + rnd(-30, 30), ay: Math.max(pageRect(callout).y, vis.y) - 4, bx: hit.x, by: hit.y, width: innerWidth < 700 ? 3.4 : 4.6, layer: 'front', flash: 0.06, sparks: 30, scorch: false, shake: $('[data-receiver]') };
    },
    { min: 2400, max: 4600, first: 500 }
  );
$('.callout__btn')?.addEventListener('pointerenter', (e) => {
  if (e.pointerType !== 'mouse' || !storm.enabled) return;
  const r = pageRect(e.currentTarget);
  storm.strike({ ax: r.x + r.w * rnd(0.2, 0.8), ay: pageRect(callout).y - 4, bx: r.x + r.w * rnd(0.3, 0.9), by: r.y + r.h * 0.9, width: 3.2, layer: 'front', flash: 0.05, sparks: 20, scorch: false });
});

/* Контакты: удар в трубку из-за спины */
const contact = $('#contact');
const contactImg = $('.contact__person');
if (contact && contactImg)
  storm.ambient(
    contact,
    () => {
      if (!inView(contactImg, 60)) return null;
      const hit = imgPoint(contactImg, 380, 340);
      return { ax: hit.x + rnd(-80, 140), ay: pageRect(contact).y + 8, bx: hit.x, by: hit.y, width: 3.4, flash: 0.1, sparks: 24, scorch: false };
    },
    { min: 3800, max: 7000, first: 900 }
  );

/* Пакеты: карандаш рисует разряд, «идея» бьёт в блокнот, ток по кабелям */
const pencilImg = $('#pkg-consultation .pkg__photo img');
const chairImg = $('#pkg-mentorship .pkg__photo img');
const cablesImg = $('#pkg-partnership .pkg__photo img');
const hitPkg = (id) => {
  const el = document.getElementById(id);
  el?.classList.add('is-hit');
  setTimeout(() => el?.classList.remove('is-hit'), 380);
};
if (pencilImg)
  storm.ambient(
    pencilImg.closest('.pkg__photo'),
    () => {
      const tip = imgPoint(pencilImg, 994, 456);
      const from = imgPoint(pencilImg, rnd(260, 420), rnd(780, 900));
      return { ax: from.x, ay: from.y, bx: tip.x, by: tip.y, width: 3.2, layer: 'front', sparks: 12, scorch: false, flash: 0, onHit: () => hitPkg('pkg-consultation') };
    },
    { min: 3200, max: 6000, first: 500 }
  );
if (chairImg)
  storm.ambient(
    chairImg.closest('.pkg__photo'),
    () => {
      const hit = imgPoint(chairImg, rnd(900, 1040), rnd(440, 470));
      const p = pageRect(chairImg.closest('.pkg__photo'));
      return { ax: hit.x + rnd(-60, 60), ay: p.y - 24, bx: hit.x, by: hit.y, width: 3.6, layer: 'front', sparks: 16, scorch: false, flash: 0, onHit: () => hitPkg('pkg-mentorship') };
    },
    { min: 3000, max: 5600, first: 800 }
  );
if (cablesImg) {
  const fig = cablesImg.closest('.pkg__photo');
  new IntersectionObserver((es) => fig.classList.toggle('is-live', es[0].isIntersecting && !reduce()), { threshold: 0.3 }).observe(fig);
  storm.ambient(
    fig,
    () => {
      const a = imgPoint(cablesImg, 1395, 338);
      const b = imgPoint(cablesImg, 1405, 502);
      return { ax: a.x, ay: a.y, bx: b.x, by: b.y, width: 2.4, layer: 'front', sparks: 12, scorch: false, flash: 0, smoke: false, onHit: () => hitPkg('pkg-partnership') };
    },
    { min: 2200, max: 4200, first: 600 }
  );
}

/* ---------- разрыв ---------- */
const riftEl = $('[data-rift]');
let rift = null;
if (riftEl) {
  if (reduce()) riftEl.classList.add('is-static');
  else rift = new Rift(riftEl, { storm });
}

/* ---------- лента: движется прокруткой; на быстрой прокрутке искрит ---------- */
const ticker = $('[data-ticker]');
const tickerTrack = ticker?.querySelector('.ticker__track');
let lastY = scrollY;
function tickerUpdate() {
  if (!ticker || !inView(ticker, -200)) return;
  const cycle = tickerTrack.scrollWidth / 4;
  const off = ((scrollY * 0.55) % cycle + cycle) % cycle;
  tickerTrack.style.transform = `translate3d(${-off.toFixed(1)}px,0,0)`;
  const v = Math.abs(scrollY - lastY);
  ticker.classList.toggle('is-fast', v > 40);
}

/* ---------- рисунки: прорисовка по прокрутке в обе стороны ---------- */
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
function drawDoodle(svg, p) {
  const paths = svg._paths || (svg._paths = [...svg.querySelectorAll('path')]);
  const st = 0.2;
  paths.forEach((path, i) => {
    const q = clamp(p * (1 + st * (paths.length - 1)) - i * st);
    path.style.strokeDasharray = '1';
    path.style.strokeDashoffset = String(1 - q);
    if (path.classList.contains('dd-fill')) path.style.fillOpacity = String(clamp((q - 0.6) * 2.5));
  });
}
$$('[data-doodle]').forEach((svg) => {
  if (reduce()) return;
  addScrub(svg.parentElement, 1, 0.5, (p) => drawDoodle(svg, p));
});

/* ---------- вопросы: молния из тучки в открытый вопрос; 6 ответов — тучка рассеивается ---------- */
const cloudSvg = $('[data-cloud-svg]');
const cryImg = $('.questions__person');
const spent = new Set();
$$('[data-faq-item]').forEach((item, idx) => {
  const btn = item.querySelector('.faq__btn');
  btn.addEventListener('click', () => {
    const open = !item.classList.contains('is-open');
    item.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
    if (!open) return;
    playIcon(item.querySelector('.faq__icon'));
    const ic = item.querySelector('.faq__icon').getBoundingClientRect();
    const to = { x: ic.left + scrollX + ic.width / 2, y: ic.top + scrollY + ic.height / 2 };
    let from = { x: to.x + rnd(-120, 120), y: scrollY - 10 };
    if (cryImg && inView(cryImg)) from = imgPoint(cryImg, 470, -112);
    storm.strike({ ax: from.x, ay: from.y, bx: to.x, by: to.y, width: 3.4, layer: 'front', flash: 0.1, sparks: 20, scorch: false, smoke: false, force: true, onHit: () => {
      item.classList.add('is-hit');
      setTimeout(() => item.classList.remove('is-hit'), 600);
    } });
    if (cloudSvg && !spent.has(idx)) {
      spent.add(idx);
      cloudSvg.querySelector(`[data-charge="${spent.size - 1}"]`)?.classList.add('is-spent');
      cloudSvg.classList.remove('is-hit');
      void cloudSvg.getBoundingClientRect();
      cloudSvg.classList.add('is-hit');
      if (spent.size === 6) setTimeout(() => cloudSvg.classList.add('is-clear'), 450);
    }
  });
  btn.addEventListener('pointerenter', () => mqHover.matches && playIcon(item.querySelector('.faq__icon')));
});

/* ---------- пакеты: свайп на телефоне, «Подробнее» ---------- */
const pkgTrack = $('[data-pkgs-track]');
const pkgNow = $('[data-pkgs-current]');
const pkgDots = $$('.pkgs__dots i');
pkgTrack?.addEventListener(
  'scroll',
  () => {
    const card = pkgTrack.querySelector('.pkg');
    if (!card) return;
    const i = Math.round(pkgTrack.scrollLeft / (card.offsetWidth + 12));
    if (pkgNow) pkgNow.textContent = String(i + 1);
    pkgDots.forEach((d, k) => d.classList.toggle('is-on', k === i));
  },
  { passive: true }
);
$$('[data-more]').forEach((b) =>
  b.addEventListener('click', () => {
    const more = document.getElementById(b.getAttribute('aria-controls'));
    const open = b.getAttribute('aria-expanded') !== 'true';
    more?.classList.toggle('is-open', open);
    b.setAttribute('aria-expanded', String(open));
    b.textContent = open ? 'Свернуть' : 'Подробнее';
  })
);

/* ---------- сравнение на телефоне: вкладки пакетов ---------- */
const tabs = $$('.cmp__tab');
function selectTab(i, focus = false) {
  tabs.forEach((t, k) => {
    const on = k === i;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    const panel = document.getElementById(t.getAttribute('aria-controls'));
    if (panel) {
      panel.hidden = !on;
      if (on) {
        panel.classList.remove('is-flash');
        void panel.offsetWidth;
        panel.classList.add('is-flash');
      }
    }
  });
  if (focus) tabs[i].focus();
  const r = tabs[i].getBoundingClientRect();
  storm.strike({ ax: r.left + scrollX + r.width / 2 + rnd(-40, 40), ay: scrollY - 10, bx: r.left + scrollX + r.width / 2, by: r.top + scrollY + 4, width: 2.6, layer: 'front', sparks: 14, flash: 0, scorch: false, smoke: false });
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(i));
  t.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') selectTab((i + 1) % tabs.length, true);
    if (e.key === 'ArrowLeft') selectTab((i + tabs.length - 1) % tabs.length, true);
  });
});

/* ---------- модальное окно заявки ---------- */
let opener = null;
function openModal(dlg, from) {
  if (!dlg || dlg.open) return;
  opener = from || document.activeElement;
  dlg.showModal();
  doc.style.overflow = 'hidden';
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

/* ---------- общий обработчик прокрутки ---------- */
let ticking = false;
addEventListener(
  'scroll',
  () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      rift?.update();
      tickerUpdate();
      scrubUpdate();
      header?.classList.toggle('is-scrolled', scrollY > 24);
      toTopUpdate();
      lastY = scrollY;
    });
  },
  { passive: true }
);
addEventListener('resize', () => {
  rift?.measure();
  scrubUpdate(true);
});
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
header?.classList.toggle('is-scrolled', scrollY > 24);
toTopUpdate();
rift?.update();
tickerUpdate();
scrubUpdate(true);
