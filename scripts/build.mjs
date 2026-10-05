#!/usr/bin/env node
/*
 * КБ-13 · сборка статической страницы.
 * Маркетинговый текст — только из content.ru.json, данные интеграций — из site.config.json,
 * изображения — по assets/img/IMAGE_MAP.json. Результат: index.html (готов для GitHub Pages).
 *   node scripts/build.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const C = JSON.parse(read('content.ru.json'));
const CFG = JSON.parse(read('site.config.json'));
const IMG = Object.fromEntries(JSON.parse(read('assets/img/IMAGE_MAP.json')).images.map((i) => [i.id, i]));
const ICONS = JSON.parse(read('assets/icons/icons.json'));
const VERSION = Date.now().toString(36);

/* ---------- helpers ---------- */
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const attr = esc;
const rub = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} руб`;

const STROKE = 'fill="none" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"';

/* иконка из спрайта (UI) */
const icon = (name, cls = '') =>
  `<svg class="icon ${cls}" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><use href="#kb-${name}"/></svg>`;

/* иконка целиком в разметке — нужна для анимации конкретного экземпляра */
const iconInline = (name, cls = '') => {
  const i = ICONS[name];
  const base = i.base.map((d) => `<path d="${d}"/>`).join('');
  const acc = i.accent.map((d) => `<path d="${d}" pathLength="1"/>`).join('');
  return (
    `<svg class="icon icon--${name} ${cls}" viewBox="0 0 48 48" aria-hidden="true" focusable="false">` +
    `<g ${STROKE} stroke="currentColor">${base}</g>` +
    (acc ? `<g ${STROKE} class="i-accent">${acc}</g>` : '') +
    `</svg>`
  );
};

const sprite = () => {
  const syms = Object.entries(ICONS)
    .map(([k, i]) => {
      const base = i.base.map((d) => `<path d="${d}"/>`).join('');
      const acc = i.accent.map((d) => `<path d="${d}"/>`).join('');
      return (
        `<symbol id="kb-${k}" viewBox="0 0 48 48"><g ${STROKE} stroke="currentColor">${base}</g>` +
        (acc ? `<g ${STROKE} class="i-accent">${acc}</g>` : '') +
        `</symbol>`
      );
    })
    .join('');
  const bolt = read('assets/brand/icon.svg').match(/<path[^>]+>/g).join('').replace(/ class="cls-1"/g, '');
  return (
    `<svg class="sprite" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><defs>${syms}` +
    `<symbol id="kb-bolt" viewBox="0 0 2000 1278.16">${bolt}</symbol></defs></svg>`
  );
};

const logo = (cls = '') => {
  const svg = read('assets/brand/logo.svg')
    .replace(/<\?xml[^>]*>\s*/, '')
    .replace(/<defs>[\s\S]*?<\/defs>\s*/, '')
    .replace(/ id="[^"]*"| data-name="[^"]*"/g, '')
    .replace(/class="cls-1"/g, 'class="logo-ink"')
    .replace(/class="cls-2"/g, 'class="logo-bolt"')
    .replace('<svg ', `<svg class="logo ${cls}" aria-hidden="true" focusable="false" `);
  return svg.replace(/\n\s*/g, '');
};

/* персонаж с прозрачностью: <img> в контейнере 2:3 */
const person = (id, { cls = '', eager = false, sizes = '(min-width: 1024px) 34vw, 70vw', alt } = {}) => {
  const i = IMG[id];
  return (
    `<img class="${cls}" src="assets/img/${id}-768.webp" ` +
    `srcset="assets/img/${id}-768.webp 768w, assets/img/${id}.webp ${i.width}w" sizes="${sizes}" ` +
    `width="${i.width}" height="${i.height}" alt="${attr(alt ?? i.alt)}" ` +
    (eager ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"') +
    '>'
  );
};
const photo = (id, { cls = '', sizes = '(min-width: 1024px) 40vw, 92vw', alt } = {}) => {
  const i = IMG[id];
  return (
    `<img class="${cls}" src="assets/img/${id}-768.webp" ` +
    `srcset="assets/img/${id}-768.webp 768w, assets/img/${id}.webp ${i.width}w" sizes="${sizes}" ` +
    `width="${i.width}" height="${i.height}" alt="${attr(alt ?? i.alt)}" loading="lazy" decoding="async" ` +
    `style="object-position:${i.object_position}">`
  );
};

const btn = (label, { cls = 'btn--primary', attrs = '', ic, tag = 'button', href } = {}) => {
  const inner = `<span class="btn__label">${esc(label)}</span>${ic ? iconInline(ic, 'btn__icon') : ''}<span class="btn__arc" aria-hidden="true"></span>`;
  if (tag === 'a') return `<a class="btn ${cls}" href="${attr(href)}" ${attrs}>${inner}</a>`;
  return `<button class="btn ${cls}" type="button" ${attrs}>${inner}</button>`;
};

/* скачивание: настоящий файл либо честное «файл не загружен» */
const download = (label, url, id) =>
  url
    ? btn(label, { tag: 'a', href: url, cls: 'btn--ghost', ic: 'download', attrs: `download data-icon-anim` })
    : `${btn(label, {
        cls: 'btn--ghost',
        ic: 'download',
        attrs: `data-missing-file aria-describedby="${id}-status"`,
      })}<p class="file-status" id="${id}-status" role="status"></p>`;

/* ---------- графика поверх изображений ----------
   Координаты — в пикселях исходного кадра (viewBox = размер изображения). */
const star = (x, y, r) =>
  `M${x} ${y - r}C${x + r * 0.12} ${y - r * 0.12} ${x + r * 0.12} ${y - r * 0.12} ${x + r} ${y}C${x + r * 0.12} ${y + r * 0.12} ${x + r * 0.12} ${y + r * 0.12} ${x} ${y + r}C${x - r * 0.12} ${y + r * 0.12} ${x - r * 0.12} ${y + r * 0.12} ${x - r} ${y}C${x - r * 0.12} ${y - r * 0.12} ${x - r * 0.12} ${y - r * 0.12} ${x} ${y - r}Z`;
const zig = (x, y, s = 1) => `M${x} ${y}l${-9 * s} ${22 * s}h${14 * s}l${-10 * s} ${26 * s}`;
const DOODLES = {
  placard: {
    box: [0, 0, 1024, 1536],
    paths: [
      { d: 'M318 990C392 974 462 1000 534 984S676 972 712 992', c: 'red', w: 2.6 },
      { d: 'M88 742 52 716M80 792H38M88 842 52 868', w: 2 },
      { d: 'M942 742 978 716M950 792H992M942 842 978 868', w: 2 },
      { d: star(300, 214, 30), w: 1.8 },
      { d: star(752, 150, 20), c: 'red', w: 1.8 },
    ],
  },
  present: {
    box: [0, 0, 1024, 1536],
    paths: [
      { d: star(92, 420, 34), c: 'red', w: 2 },
      { d: star(196, 360, 20), w: 1.8 },
      { d: star(150, 470, 12), w: 1.6 },
      { d: 'M120 700C52 820 34 978 84 1132', c: 'red', w: 2.6 },
      { d: 'M48 1094 84 1134 118 1098', c: 'red', w: 2.6 },
    ],
  },
  point: {
    box: [0, 0, 1700, 1536],
    paths: [
      { d: 'M1036 492C1250 456 1430 640 1452 972', c: 'red', w: 2.6 },
      { d: 'M1414 934 1454 978 1490 930', c: 'red', w: 2.6 },
    ],
  },
  ring: {
    box: [0, 0, 1024, 1536],
    paths: [
      { d: 'M150 300A182 182 0 0 1 214 182', c: 'red', w: 2.4 },
      { d: 'M92 300A240 240 0 0 1 174 120', c: 'red', w: 2.4 },
    ],
  },
  chair: {
    box: [0, 0, 1536, 1024],
    paths: [{ d: 'M1352 690 1404 650M1370 732 1430 724M1330 660 1352 608', c: 'red', w: 2.4 }],
  },
  receiver: {
    box: [0, 0, 1536, 1024],
    paths: [
      { d: 'M862 318A150 150 0 0 1 906 178', c: 'red', w: 2.6 },
      { d: 'M796 330A215 215 0 0 1 858 112', c: 'red', w: 2.6 },
      { d: 'M1196 318A150 150 0 0 0 1156 178', c: 'red', w: 2.6 },
    ],
  },
  checklist: {
    box: [0, 0, 1024, 1536],
    paths: [
      { d: 'M112 646 300 616 330 846 142 876Z', w: 2.2, fill: true },
      { d: 'M140 690 150 700 168 676', c: 'red', w: 2.4 },
      { d: 'M182 684 290 668', w: 2 },
      { d: 'M146 744 156 754 174 730', c: 'red', w: 2.4 },
      { d: 'M188 738 296 722', w: 2 },
      { d: 'M152 798 162 808 180 784', c: 'red', w: 2.4 },
      { d: 'M194 792 302 776', w: 2 },
      { d: star(340, 582, 18), c: 'red', w: 1.8 },
    ],
  },
};
const doodle = (name, cls = '') => {
  const D = DOODLES[name];
  const [x, y, w, h] = D.box;
  const paths = D.paths
    .map((p, i) => `<path d="${p.d}" pathLength="1" style="--i:${i}" class="${p.c === 'red' ? 'dd-red' : 'dd-ink'}${p.fill ? ' dd-fill' : ''}" stroke-width="${p.w || 2}"/>`)
    .join('');
  return `<svg class="doodle doodle--${name} ${cls}" viewBox="${x} ${y} ${w} ${h}" aria-hidden="true" focusable="false" data-doodle>${paths}</svg>`;
};
/* грозовая тучка над плачущим: 6 «зарядов» по числу вопросов; после всех ответов — солнце */
const cloud = () => {
  const charges = Array.from({ length: 6 }, (_, i) => `<path class="dd-red cloud__charge" data-charge="${i}" d="${zig(392 + i * 34, -110, 0.9)}" stroke-width="2.2"/>`).join('');
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    const r1 = 62;
    const r2 = 90;
    return `M${(470 + Math.cos(a) * r1).toFixed(1)} ${(-200 + Math.sin(a) * r1).toFixed(1)}L${(470 + Math.cos(a) * r2).toFixed(1)} ${(-200 + Math.sin(a) * r2).toFixed(1)}`;
  }).join('');
  return `<svg class="doodle cloud" viewBox="0 -340 1024 1876" aria-hidden="true" focusable="false" data-cloud-svg>
          <g class="cloud__storm"><path class="dd-ink dd-fill" stroke-width="2.4" d="M318 -118C262 -118 250 -196 316 -204 312 -276 410 -294 446 -238 478 -310 604 -300 600 -214 664 -224 690 -128 620 -118Z"/><path class="dd-ink" stroke-width="1.8" d="M374 -146C392 -160 410 -160 428 -146"/><path class="dd-ink" stroke-width="4" d="M386 -184h1M418 -184h1"/>${charges}</g>
          <g class="cloud__sun"><circle class="dd-red" cx="470" cy="-200" r="46" stroke-width="2.6" fill="none"/><path class="dd-red" stroke-width="2.6" d="${rays}"/><path class="dd-ink" stroke-width="1.8" d="M452 -192C462 -180 478 -180 488 -192"/><path class="dd-ink" stroke-width="4" d="M456 -214h1M484 -214h1"/></g>
        </svg>`;
};
/* ток по красным кабелям «Всё включено!» — пути в пикселях кадра 1536×1024 */
const CABLES = [
  'M232 642C236 480 330 330 560 306C700 296 800 360 880 440C950 505 1060 570 1196 598',
  'M478 642C470 520 540 400 690 392C820 388 900 470 960 560C1020 650 1100 720 1180 715C1230 710 1262 680 1282 650',
  'M772 642C790 520 820 420 900 365C980 312 1090 295 1192 285',
];
const current = () =>
  `<svg class="current" viewBox="0 0 1536 1024" aria-hidden="true" focusable="false">${CABLES.map(
    (d, i) => `<path class="current__glow" d="${d}" pathLength="1" style="--i:${i}"/><path class="current__core" d="${d}" pathLength="1" style="--i:${i}"/>`
  ).join('')}</svg>`;
const shadow = (id, [cx, cy, rx, ry]) => {
  const i = IMG[id];
  return `<svg class="cut-shadow" viewBox="0 0 ${i.width} ${i.height}" aria-hidden="true" focusable="false"><defs><radialGradient id="sh-${id}"><stop offset="0" stop-color="#0b0b0b" stop-opacity=".22"/><stop offset=".55" stop-color="#0b0b0b" stop-opacity=".08"/><stop offset="1" stop-color="#0b0b0b" stop-opacity="0"/></radialGradient></defs><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#sh-${id})"/></svg>`;
};

/* ---------- данные ---------- */
const H = C.hero;
const A = C.about;
const Q = C.questions;
const S = C.services;
const T = C.comparison;
const K = C.contact;
const O = C.overlays;
const faqIcons = ['contract-shield', 'parallel', 'new-angle', 'dialogue', 'time', 'results'];
const pkgPhotos = { consultation: '02-strategy-desk', mentorship: '03-mentorship-chair', partnership: '05-partnership-system' };
const priceRow = T.rows.find((r) => r[0] === 'Цена пакета');
const splitTitle = (t) => {
  const m = t.match(/^(Пакет \d)\s+(.*)$/);
  return m ? [m[1], m[2]] : ['', t];
};
/* короткий анонс пакета: первые предложения до ~90 знаков; остальное — по кнопке «Подробнее» */
const splitText = (t) => {
  const parts = t.match(/[^.!?]+[.!?]+(\s|$)/g) || [t];
  let head = '';
  let i = 0;
  while (i < parts.length && (head.length < 90 || i === 0)) head += parts[i++];
  return [head.trim(), parts.slice(i).join('').trim()];
};
const nb = (s) => esc(s).replace(/ ([–-]) /g, '&nbsp;$1 ');

const phoneControl = () =>
  CFG.phone
    ? `<a class="btn btn--primary header__call" href="tel:${attr(CFG.phone.replace(/[^\d+]/g, ''))}" data-phone-hover>${iconInline('phone', 'btn__icon')}<span class="btn__label header__call-label">${esc(C.navigation.phone_label)}</span><span class="btn__arc" aria-hidden="true"></span></a>`
    : `<button class="btn btn--primary header__call" type="button" aria-haspopup="dialog" aria-controls="phone-panel" aria-expanded="false" aria-label="${attr(C.navigation.phone_label)}" data-phone-toggle data-phone-hover>${iconInline('phone', 'btn__icon')}<span class="btn__label header__call-label" aria-hidden="true">${esc(C.navigation.phone_label)}</span><span class="btn__arc" aria-hidden="true"></span></button>`;
const contactList = (items, empty) =>
  items.length
    ? `<ul class="contact__items">${items
        .map((x) => `<li><a href="${attr(x.href)}">${esc(x.label)}</a>${x.copy ? `<button class="copy" type="button" data-copy="${attr(x.copy)}">${icon('copy')}<span>Скопировать</span></button>` : ''}</li>`)
        .join('')}</ul>`
    : `<p class="contact__empty">${esc(empty)}</p>`;
const phones = CFG.contacts.phones.map((p) => ({ label: p, href: `tel:${p.replace(/[^\d+]/g, '')}`, copy: p }));
const emails = CFG.contacts.emails.map((e) => ({ label: e, href: `mailto:${e}`, copy: e }));
const socials = CFG.contacts.socials.map((s) => ({ label: s.label, href: s.url }));
const video = CFG.video && CFG.video.url;
const tickerWords = [...H.topics, ...H.topics, ...H.topics, ...H.topics];

const html = `<!doctype html>
<html lang="ru" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>КБ-13 — креативное бюро</title>
<meta name="description" content="${attr(H.lead)}">
<meta name="theme-color" content="#F5F4F0">
<link rel="icon" href="assets/brand/icon.svg" type="image/svg+xml">
<link rel="preload" href="assets/fonts/sofia-sans-xcond-cyrillic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="assets/fonts/manrope-cyrillic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" as="image" href="assets/img/07-hero-facts-person-768.webp" imagesrcset="assets/img/07-hero-facts-person-768.webp 768w, assets/img/07-hero-facts-person.webp 1024w" imagesizes="(min-width: 1024px) 34vw, 60vw" fetchpriority="high">
<link rel="stylesheet" href="assets/css/main.css?v=${VERSION}">
<script>document.documentElement.className='js';</script>
<script type="application/json" id="kb-config">${JSON.stringify({ phone: CFG.phone, endpoints: CFG.endpoints, chat: CFG.chat }).replace(/</g, '\\u003c')}</script>
<script type="module" src="assets/js/main.js?v=${VERSION}"></script>
</head>
<body>
${sprite()}
<a class="skip-link" href="#main">Перейти к содержанию</a>

<header class="site-header" data-header>
  <div class="wrap site-header__row">
    <a class="site-header__logo" href="#home" aria-label="КБ-13, креативное бюро — на главную" data-logo>${logo()}</a>
    <nav class="nav" aria-label="Основная навигация">
      <ul class="nav__list">
        ${C.navigation.items.map((n) => `<li><a class="nav__link" href="${n.anchor}">${esc(n.label)}</a></li>`).join('\n        ')}
      </ul>
    </nav>
    <div class="site-header__actions">
      <button class="icon-btn storm-toggle" type="button" aria-pressed="true" aria-label="Гроза: включена" data-storm-toggle><svg class="icon storm-toggle__icon" viewBox="0 0 2000 1278.16" aria-hidden="true" focusable="false"><use href="#kb-bolt"/></svg></button>
      ${phoneControl()}
      <button class="icon-btn menu-btn" type="button" aria-expanded="false" aria-controls="mobile-menu" aria-label="Открыть меню" data-menu-toggle>${icon('menu')}</button>
    </div>
  </div>
  <div class="phone-panel" id="phone-panel" role="dialog" aria-labelledby="phone-panel-title" hidden>
    <p class="phone-panel__title" id="phone-panel-title">${esc(C.navigation.phone_label)}</p>
    <p class="phone-panel__text">Номер телефона ещё не задан. Пока можно оставить контакт в форме — мы перезвоним.</p>
    <a class="btn btn--primary btn--small" href="#contact" data-to-form><span class="btn__label">Перейти к форме</span><span class="btn__arc" aria-hidden="true"></span></a>
    <button class="icon-btn phone-panel__close" type="button" aria-label="Закрыть" data-phone-close>${icon('close')}</button>
  </div>
  <div class="mobile-menu" id="mobile-menu" hidden>
    <nav aria-label="Меню">
      <ul class="mobile-menu__list">
        ${C.navigation.items.map((n) => `<li><a class="mobile-menu__link" href="${n.anchor}">${esc(n.label)}</a></li>`).join('\n        ')}
      </ul>
    </nav>
  </div>
</header>

<main id="main">

<section class="hero" id="home" aria-labelledby="hero-title" data-zone="hero">
  <div class="wrap hero__grid">
    <div class="hero__copy">
      <h1 class="display hero__title" id="hero-title" tabindex="-1">${nb(H.title).replace('. ', '.<br> ')}</h1>
      <p class="hero__lead">${esc(H.lead)}</p>
      <div class="hero__actions">
        ${btn(H.cta, { tag: 'a', href: '#contact', attrs: 'data-to-form' })}
        <p class="hero__hint" data-hint><svg class="icon" viewBox="0 0 2000 1278.16" aria-hidden="true" focusable="false"><use href="#kb-bolt"/></svg><span class="hint--mouse">Кликните по пустому месту — ударит молния</span><span class="hint--touch">Коснитесь пустого места — ударит молния</span></p>
      </div>
    </div>
    <div class="hero__visual">
      <div class="placard" data-placard>
        ${person('07-hero-facts-person', { cls: 'placard__img', eager: true, sizes: '(min-width: 1024px) 34vw, 60vw', alt: 'Постановочный персонаж держит табличку' })}
        <p class="placard__text"><span>${esc(H.system_line)}</span></p>
        ${doodle('placard')}
      </div>
    </div>
  </div>
</section>

<section class="rift" id="meaning" aria-label="Смыслы" data-rift>
  <div class="rift__stage">
    <canvas class="rift__canvas" aria-hidden="true"></canvas>
    ${[H.slides[1], H.slides[2]]
      .map(
        (s) => `<div class="rift__text"><div class="rift__inner">
      <h2 class="display rift__title">${nb(s.title)}</h2>
      <p class="rift__lead">${esc(s.text)}</p>
    </div></div>`
      )
      .join('\n    ')}
    <p class="rift__hint" aria-hidden="true">листайте</p>
  </div>
</section>

<div class="ticker" data-ticker>
  <ul class="ticker__track" aria-label="Направления">
    ${tickerWords
      .map(
        (w, i) =>
          `<li class="ticker__word${i % 2 ? ' ticker__word--outline' : ''}"${i >= H.topics.length ? ' aria-hidden="true"' : ''}>${esc(w)}</li><li class="ticker__sep" aria-hidden="true"><svg viewBox="0 0 2000 1278.16" focusable="false"><use href="#kb-bolt"/></svg></li>`
      )
      .join('')}
  </ul>
</div>

<section class="about section" id="about" aria-labelledby="about-title">
  <div class="wrap about__grid">
    <div class="about__text">
      <h2 class="display section__title" id="about-title" tabindex="-1">${esc(A.title)}</h2>
      <p class="about__lead">${esc(A.paragraphs[0])}</p>
      <p class="about__punch">${esc(A.paragraphs[2])}</p>
    </div>
    <div class="about__media">
      <div class="video" data-video>
        ${
          video
            ? `<video class="video__el" controls preload="none" playsinline poster="${attr(CFG.video.poster)}" aria-label="${attr(CFG.video.title)}" title="${attr(CFG.video.title)}" width="1920" height="1080"><source src="${attr(CFG.video.url)}" type="video/mp4"></video>
        <button class="video__play" type="button" data-video-play aria-label="Смотреть: ${attr(CFG.video.title)}">${icon('play')}<span>Смотреть</span></button>`
            : `${photo('04-content-camera', { cls: 'video__poster' })}<p class="video__note">Видео-визитка появится здесь после передачи ролика.</p>`
        }
      </div>
    </div>
  </div>
</section>

<section class="questions section" id="questions" aria-labelledby="questions-title">
  <div class="wrap questions__grid">
    <h2 class="display section__title questions__title" id="questions-title" tabindex="-1">${esc(Q.title)}</h2>
    <div class="questions__visual" data-cloud>
      ${person('09-questions-crying-person', { cls: 'questions__person', sizes: '(min-width: 1024px) 26vw, 40vw' })}
      ${cloud()}
    </div>
    <ul class="faq" data-faq>
      ${Q.items
        .map(
          (q, i) => `<li class="faq__item" data-faq-item>
        <h3 class="faq__q"><button class="faq__btn" type="button" id="faq-q-${i + 1}" aria-expanded="false" aria-controls="faq-a-${i + 1}">${iconInline(faqIcons[i], 'faq__icon')}<span class="faq__text">${esc(q.question)}</span><span class="faq__toggle" aria-hidden="true">${iconInline('plus')}</span></button></h3>
        <div class="faq__a" id="faq-a-${i + 1}" role="region" aria-labelledby="faq-q-${i + 1}"><div class="faq__a-inner"><p>${esc(q.answer)}</p></div></div>
      </li>`
        )
        .join('\n      ')}
    </ul>
  </div>
</section>

<section class="callout" aria-labelledby="callout-title" data-zone="callout">
  <div class="wrap callout__grid">
    <h2 class="callout__title" id="callout-title"><button class="callout__btn" type="button" aria-haspopup="dialog" data-open="lead-dialog"><span class="display">${esc(A.cta)}</span>${icon('arrow-right', 'callout__arrow')}</button></h2>
    <div class="callout__visual" data-receiver>
      ${photo('06-contact-phone', { cls: 'callout__img', sizes: '(min-width: 1024px) 40vw, 90vw' })}
      ${doodle('receiver')}
    </div>
  </div>
</section>

<section class="services section" id="services" aria-labelledby="services-title">
  <div class="wrap">
    <div class="services__intro">
      <div class="services__intro-text">
        <h2 class="display section__title" id="services-title" tabindex="-1">${esc(S.title)}</h2>
        <p class="services__lead">${esc(S.intro)}</p>
      </div>
      <div class="services__presenter">${person('10-services-presenter-person', { cls: 'services__person', sizes: '(min-width: 1024px) 22vw, 40vw' })}${doodle('present')}</div>
    </div>
    <div class="pkgs" data-pkgs>
      <ol class="pkgs__track" data-pkgs-track>
        ${S.packages
          .map((p, i) => {
            const [kicker, name] = splitTitle(p.title);
            const [lead, more] = splitText(p.text);
            const art =
              p.id === 'consultation'
                ? ''
                : p.id === 'mentorship'
                  ? `${shadow('03-mentorship-chair', [900, 948, 360, 34])}`
                  : `${shadow('05-partnership-system', [660, 792, 470, 26])}`;
            return `<li class="pkg pkg--${p.id}" id="pkg-${p.id}" data-pkg="${p.id}">
          <div class="pkg__top"><span class="pkg__num" aria-hidden="true">${p.number}</span><h3 class="pkg__title"><span class="pkg__kicker">${esc(kicker)}</span> <span class="pkg__name">${esc(name)}</span></h3></div>
          <figure class="pkg__photo" data-pkg-photo>${art}${photo(pkgPhotos[p.id], { sizes: '(min-width: 1024px) 30vw, 80vw' })}${p.id === 'partnership' ? current() : ''}${p.id === 'mentorship' ? doodle('chair') : ''}</figure>
          <dl class="pkg__meta">
            <div><dt>Формат</dt><dd>${esc(p.format)}</dd></div>
            <div><dt>Срок</dt><dd>${p.days} дней</dd></div>
            <div class="pkg__price"><dt>${esc(priceRow[0])}</dt><dd>${esc(priceRow[i + 1])}</dd></div>
          </dl>
          <div class="pkg__text"><p>${esc(lead)}${more ? ` <span class="pkg__more" id="pkg-more-${p.id}">${esc(more)}</span>` : ''}</p>${more ? `<button class="pkg__toggle" type="button" aria-expanded="false" aria-controls="pkg-more-${p.id}" data-more>Подробнее</button>` : ''}</div>
          <div class="pkg__action">${download(p.download_label, CFG.downloads[p.id], `dl-${p.id}`)}</div>
        </li>`;
          })
          .join('\n        ')}
      </ol>
      <div class="pkgs__nav" aria-hidden="true"><span><span data-pkgs-current>1</span>&nbsp;/&nbsp;${S.packages.length}</span><span class="pkgs__dots">${S.packages.map((_, i) => `<i${i === 0 ? ' class="is-on"' : ''}></i>`).join('')}</span></div>
    </div>
  </div>
</section>

<section class="comparison section" id="comparison" aria-labelledby="comparison-title">
  <div class="wrap">
    <div class="comparison__intro">
      <div class="comparison__presenter">${person('11-comparison-presenter-person', { cls: 'comparison__person', sizes: '(min-width: 1024px) 18vw, 30vw' })}${doodle('point')}</div>
      <h2 class="display section__title comparison__title" id="comparison-title">${esc(T.title)}</h2>
    </div>
    <div class="cmp" data-cmp>
      <div class="cmp__tabs" role="tablist" aria-label="Пакеты">
        ${T.columns
          .slice(1)
          .map((c, i) => `<button class="cmp__tab" type="button" role="tab" id="cmp-tab-${i}" aria-controls="cmp-panel-${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(c)}</button>`)
          .join('')}
      </div>
      ${T.columns
        .slice(1)
        .map(
          (c, i) => `<div class="cmp__panel" role="tabpanel" id="cmp-panel-${i}" aria-labelledby="cmp-tab-${i}"${i ? ' hidden' : ''}>
        <dl class="cmp__list">${T.rows.map((r) => `<div class="cmp__row${r[0] === 'Цена пакета' ? ' is-price' : ''}"><dt>${esc(r[0])}</dt><dd>${esc(r[i + 1])}</dd></div>`).join('')}</dl>
      </div>`
        )
        .join('\n      ')}
    </div>
    <div class="table-scroll" tabindex="0" role="region" aria-labelledby="comparison-title" data-table>
      <table class="compare">
        <caption class="sr-only">${esc(T.title)}: сравнение трёх пакетов</caption>
        <colgroup><col class="compare__c0"><col><col><col></colgroup>
        <thead><tr>${T.columns.map((c, i) => `<th scope="col"${i ? ` data-col="${i}"` : ''}>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>
          ${T.rows
            .map((r, ri) => `<tr${ri === T.rows.length - 1 ? ' class="is-price"' : ''}><th scope="row">${esc(r[0])}</th>${r.slice(1).map((c, i) => `<td data-col="${i + 1}">${esc(c)}</td>`).join('')}</tr>`)
            .join('\n          ')}
        </tbody>
      </table>
    </div>
    <div class="comparison__actions">
      <div class="comparison__action">${download(T.download_label, CFG.downloads.full_offer, 'dl-full')}</div>
      ${btn(T.chat_label, { cls: 'btn--primary', ic: 'send', attrs: 'aria-haspopup="dialog" aria-controls="chat-panel" data-open-chat' })}
    </div>
  </div>
</section>

<section class="checklist section" id="checklist" aria-labelledby="checklist-title">
  <div class="wrap checklist__grid">
    <div class="checklist__visual">
      ${person('08-about-friendly-person', { cls: 'checklist__person', sizes: '(min-width: 1024px) 24vw, 46vw' })}
      ${doodle('checklist')}
    </div>
    <form class="form checklist__form" novalidate data-form="checklist" aria-labelledby="checklist-title">
      <h2 class="display section__title checklist__title" id="checklist-title">${esc(O.checklist.title)}</h2>
      <p class="checklist__desc">${esc(O.checklist.description)}</p>
      <div class="field">
        <label class="field__label" for="ck-email">${esc(O.checklist.email_label)}</label>
        <input class="field__input" id="ck-email" name="email" type="email" autocomplete="email" inputmode="email" required data-validate="email" aria-describedby="ck-email-err">
        <p class="field__error" id="ck-email-err"></p>
      </div>
      <p class="checklist__consent">Здесь будет утверждённый текст согласия на рассылку со ссылкой на документ.</p>
      <div class="form__submit"><button class="btn btn--primary btn--wide" type="submit"><span class="btn__label">${esc(O.checklist.submit)}</span>${iconInline('download', 'btn__icon')}<span class="btn__arc" aria-hidden="true"></span></button></div>
      <p class="form__status" role="status" aria-live="polite"></p>
    </form>
  </div>
</section>

<section class="contact section" id="contact" aria-labelledby="contact-title" data-zone="contact">
  <div class="wrap contact__grid">
    <div class="contact__side">
      <h2 class="display section__title contact__title" id="contact-title">${esc(K.title)}</h2>
      <div class="contact__media">
        <div class="contact__visual" data-contact-visual>
          ${person('12-contact-phone-person', { cls: 'contact__person', sizes: '(min-width: 1024px) 18vw, 40vw' })}
          ${doodle('ring')}
        </div>
        <div class="contact__lists">
          <div class="contact__group"><h3 class="contact__h">${esc(K.labels.contacts)}</h3>${contactList([...phones, ...emails], 'Телефон и почта появятся здесь после передачи данных.')}</div>
          <div class="contact__group"><h3 class="contact__h">${esc(K.labels.social)}</h3>${contactList(socials, 'Ссылки на соцсети появятся здесь после передачи данных.')}</div>
        </div>
      </div>
    </div>
    <form class="form contact-form" id="contact-form" novalidate data-form="contact" aria-labelledby="form-title">
      <h3 class="form__title" id="form-title" tabindex="-1">${esc(K.labels.form)}</h3>
      <div class="field">
        <label class="field__label" for="cf-name">${esc(K.labels.name)}</label>
        <input class="field__input" id="cf-name" name="name" type="text" autocomplete="name" required aria-describedby="cf-name-err">
        <p class="field__error" id="cf-name-err"></p>
      </div>
      <div class="field">
        <label class="field__label" for="cf-contact">${esc(K.labels.contact)}</label>
        <input class="field__input" id="cf-contact" name="contact" type="text" autocomplete="email" inputmode="email" required data-validate="phone-or-email" aria-describedby="cf-contact-err">
        <p class="field__error" id="cf-contact-err"></p>
      </div>
      <div class="field">
        <label class="field__label" for="cf-task">${esc(K.labels.task)}</label>
        <textarea class="field__input field__input--area" id="cf-task" name="task" rows="3"></textarea>
      </div>
      <div class="form__submit"><button class="btn btn--primary btn--wide" type="submit"><span class="btn__label">${esc(K.labels.submit)}</span>${iconInline('send', 'btn__icon')}<span class="btn__arc" aria-hidden="true"></span></button></div>
      <p class="form__status" role="status" aria-live="polite"></p>
    </form>
  </div>
</section>

</main>

<footer class="site-footer">
  <div class="wrap site-footer__grid">
    <a class="site-footer__logo" href="#home" aria-label="КБ-13 — наверх страницы">${logo()}</a>
    <nav class="site-footer__nav" aria-label="Навигация в подвале"><ul>${C.navigation.items.map((n) => `<li><a href="${n.anchor}">${esc(n.label)}</a></li>`).join('')}</ul></nav>
    <div class="site-footer__legal">
      <p>КБ-13 · креативное бюро</p>
      <p class="site-footer__muted">Реквизиты, политика конфиденциальности и согласие на рассылку будут опубликованы после утверждения текстов.</p>
    </div>
  </div>
</footer>

<button class="to-top" type="button" aria-label="Наверх" data-to-top hidden>${icon('back-to-top')}</button>

<div class="chat" id="chat-panel" role="dialog" aria-modal="false" aria-labelledby="chat-title" hidden>
  <div class="chat__head"><p class="chat__title" id="chat-title">${esc(O.chat.title)}</p><button class="icon-btn" type="button" aria-label="Закрыть чат" data-chat-close>${icon('close')}</button></div>
  <div class="chat__body">
    <p class="chat__state">Чат ещё не подключён: сообщения отсюда пока никуда не уходят. Оставьте контакт в форме обращения — это работает.</p>
    <label class="sr-only" for="chat-msg">${esc(O.chat.message_placeholder)}</label>
    <textarea class="field__input chat__input" id="chat-msg" rows="2" placeholder="${attr(O.chat.message_placeholder)}" disabled></textarea>
    <a class="btn btn--primary btn--wide" href="#contact" data-to-form><span class="btn__label">Перейти к форме</span><span class="btn__arc" aria-hidden="true"></span></a>
  </div>
</div>

<dialog class="modal" id="lead-dialog" aria-labelledby="lead-title">
  <form class="form modal__form" method="dialog" novalidate data-form="lead">
    <div class="modal__head"><h2 class="modal__title display" id="lead-title">${esc(O.lead.title)}</h2><button class="icon-btn modal__close" type="button" aria-label="Закрыть" data-close>${icon('close')}</button></div>
    <div class="field">
      <label class="field__label" for="lf-name">${esc(O.lead.labels[0])}</label>
      <input class="field__input" id="lf-name" name="name" type="text" autocomplete="name" required aria-describedby="lf-name-err">
      <p class="field__error" id="lf-name-err"></p>
    </div>
    <div class="field">
      <label class="field__label" for="lf-phone">${esc(O.lead.labels[1])}</label>
      <input class="field__input" id="lf-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required data-validate="phone" aria-describedby="lf-phone-err">
      <p class="field__error" id="lf-phone-err"></p>
    </div>
    <div class="form__submit"><button class="btn btn--primary btn--wide" type="submit"><span class="btn__label">${esc(O.lead.submit)}</span>${iconInline('send', 'btn__icon')}<span class="btn__arc" aria-hidden="true"></span></button></div>
    <p class="form__status" role="status" aria-live="polite"></p>
  </form>
</dialog>

<noscript><style>.faq__a{grid-template-rows:1fr!important}.pkg__more{display:inline!important}.rift__text{clip-path:none!important;opacity:1!important}</style></noscript>
</body>
</html>
`;

writeFileSync(join(root, 'index.html'), html);
console.log(`index.html: ${(html.length / 1024).toFixed(1)} KB`);
