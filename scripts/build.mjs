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

/* ---------- графика поверх изображений («приколы») ----------
   Координаты — в пикселях исходного кадра (viewBox = размер изображения), поэтому рисунок
   масштабируется вместе с картинкой. path с pathLength=1 прорисовывается один раз при появлении. */
const star = (x, y, r) =>
  `M${x} ${y - r}C${x + r * 0.12} ${y - r * 0.12} ${x + r * 0.12} ${y - r * 0.12} ${x + r} ${y}C${x + r * 0.12} ${y + r * 0.12} ${x + r * 0.12} ${y + r * 0.12} ${x} ${y + r}C${x - r * 0.12} ${y + r * 0.12} ${x - r * 0.12} ${y + r * 0.12} ${x - r} ${y}C${x - r * 0.12} ${y - r * 0.12} ${x - r * 0.12} ${y - r * 0.12} ${x} ${y - r}Z`;
const drop = (x, y, h) => `M${x} ${y}C${x - h * 0.42} ${y + h * 0.55} ${x - h * 0.4} ${y + h} ${x} ${y + h}C${x + h * 0.4} ${y + h} ${x + h * 0.42} ${y + h * 0.55} ${x} ${y}Z`;
const DOODLES = {
  // табличка: красное «рукописное» подчёркивание под текстом и «та-дам» у рук
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
  // плачущий: грозовая тучка над головой и капли
  storm: {
    box: [0, -340, 1024, 1876],
    paths: [
      {
        d: 'M318 -118C262 -118 250 -196 316 -204 312 -276 410 -294 446 -238 478 -310 604 -300 600 -214 664 -224 690 -128 620 -118Z',
        w: 2.4,
        fill: true,
      },
      { d: 'M374 -146C392 -160 410 -160 428 -146', w: 1.8 },
      { d: 'M386 -184h1M418 -184h1', w: 4 },
      { d: drop(652, 286, 40), w: 1.8 },
      { d: drop(690, 368, 30), w: 1.8 },
    ],
  },
  // ведущая услуг: искры над ладонью и стрелка вниз — к тарифам
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
  // ведущий сравнения: стрелка от жеста к заголовку таблицы
  point: {
    box: [0, 0, 1700, 1536],
    wide: true,
    paths: [
      { d: 'M1036 492C1250 456 1430 640 1452 972', c: 'red', w: 2.6 },
      { d: 'M1414 934 1454 978 1490 930', c: 'red', w: 2.6 },
    ],
  },
  // трубка: «звонок» — дуги у уха
  ring: {
    box: [0, 0, 1024, 1536],
    paths: [
      { d: 'M150 300A182 182 0 0 1 214 182', c: 'red', w: 2.4 },
      { d: 'M92 300A240 240 0 0 1 174 120', c: 'red', w: 2.4 },
    ],
  },
  // кресло режиссёра: «идея» над блокнотом и хлопок хлопушки
  chair: {
    box: [0, 0, 1536, 1024],
    paths: [
      { d: star(978, 330, 34), w: 2 },
      { d: star(1078, 268, 18), c: 'red', w: 2 },
      { d: 'M1352 690 1404 650M1370 732 1430 724M1330 660 1352 608', c: 'red', w: 2.4 },
    ],
  },
  // кабели: «бзз» вокруг разряда между адаптерами
};
const doodle = (name, cls = '') => {
  const D = DOODLES[name];
  const [x, y, w, h] = D.box;
  const paths = D.paths
    .map(
      (p, i) =>
        `<path d="${p.d}" pathLength="1" style="--i:${i}" class="${p.c === 'red' ? 'dd-red' : 'dd-ink'}${p.fill ? ' dd-fill' : ''}" stroke-width="${p.w || 2}"/>`
    )
    .join('');
  return `<svg class="doodle doodle--${name} ${cls}" viewBox="${x} ${y} ${w} ${h}" aria-hidden="true" focusable="false" data-doodle>${paths}</svg>`;
};
/* мягкая тень под вырезанным предметом: [cx, cy, rx, ry] в пикселях кадра */
const shadow = (id, [cx, cy, rx, ry]) => {
  const i = IMG[id];
  return `<svg class="cut-shadow" viewBox="0 0 ${i.width} ${i.height}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><defs><radialGradient id="sh-${id}"><stop offset="0" stop-color="#0b0b0b" stop-opacity=".22"/><stop offset=".55" stop-color="#0b0b0b" stop-opacity=".08"/><stop offset="1" stop-color="#0b0b0b" stop-opacity="0"/></radialGradient></defs><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#sh-${id})"/></svg>`;
};

/* ---------- данные ---------- */
const H = C.hero;
const A = C.about;
const Q = C.questions;
const S = C.services;
const T = C.comparison;
const K = C.contact;
const O = C.overlays;
/* Порядок слайдов hero (индексы content.hero.slides). По просьбе заказчика 1-й и 2-й поменяны местами:
   первым показывается «Внимание – новая валюта!». Первый слайд в этом порядке получает H1. */
const HERO_ORDER = [1, 0, 2];
const faqIcons = ['contract-shield', 'parallel', 'new-angle', 'dialogue', 'time', 'results'];
const pkgPhotos = { consultation: '02-strategy-desk', mentorship: '03-mentorship-chair', partnership: '05-partnership-system' };
const PKG_ART = {
  consultation: { bolt: 'pencil' },
  mentorship: { shadow: [900, 948, 360, 34], doodle: 'chair' },
  partnership: { shadow: [660, 792, 470, 26], bolt: 'cables' },
};
const priceByIndex = T.rows.find((r) => r[0] === 'Цена пакета').slice(1);

/* название пакета: «Пакет N» отдельной строкой, остальное — крупно; текст источника не меняется */
const splitTitle = (t) => {
  const m = t.match(/^(Пакет \d)\s+(.*)$/);
  return m ? [m[1], m[2]] : ['', t];
};

const phoneControl = () =>
  CFG.phone
    ? `<a class="btn btn--primary header__call" href="tel:${attr(CFG.phone.replace(/[^\d+]/g, ''))}" data-phone-hover>${iconInline('phone', 'btn__icon btn__icon--lead')}<span class="btn__label header__call-label">${esc(C.navigation.phone_label)}</span><span class="btn__arc" aria-hidden="true"></span></a>`
    : `<button class="btn btn--primary header__call" type="button" aria-haspopup="dialog" aria-controls="phone-panel" aria-expanded="false" aria-label="${attr(C.navigation.phone_label)}" data-phone-toggle data-phone-hover>${iconInline('phone', 'btn__icon btn__icon--lead')}<span class="btn__label header__call-label" aria-hidden="true">${esc(C.navigation.phone_label)}</span><span class="btn__arc" aria-hidden="true"></span></button>`;

const contactList = (items, empty) =>
  items.length
    ? `<ul class="contact__items">${items
        .map(
          (x) =>
            `<li><a href="${attr(x.href)}">${esc(x.label)}</a>${x.copy ? `<button class="copy" type="button" data-copy="${attr(x.copy)}">${icon('copy')}<span>Скопировать</span></button>` : ''}</li>`
        )
        .join('')}</ul>`
    : `<p class="contact__empty">${esc(empty)}</p>`;

const phones = CFG.contacts.phones.map((p) => ({ label: p, href: `tel:${p.replace(/[^\d+]/g, '')}`, copy: p }));
const emails = CFG.contacts.emails.map((e) => ({ label: e, href: `mailto:${e}`, copy: e }));
const socials = CFG.contacts.socials.map((s) => ({ label: s.label, href: s.url }));

const video = CFG.video && CFG.video.url;

/* ---------- разметка ---------- */
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
<link rel="preload" as="image" href="assets/img/07-hero-facts-person-768.webp" imagesrcset="assets/img/07-hero-facts-person-768.webp 768w, assets/img/07-hero-facts-person.webp 1024w" imagesizes="(min-width: 1024px) 34vw, 70vw" fetchpriority="high">
<link rel="stylesheet" href="assets/css/main.css?v=${VERSION}">
<script>document.documentElement.className='js';</script>
<script type="application/json" id="kb-config">${JSON.stringify({
  phone: CFG.phone,
  endpoints: CFG.endpoints,
  chat: CFG.chat,
}).replace(/</g, '\\u003c')}</script>
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

<section class="hero" id="home" aria-labelledby="hero-title">
  <div class="wrap hero__grid">
    <div class="hero__copy">
      <div class="hero__slides" data-slider aria-roledescription="карусель" aria-label="Главные смыслы">
        ${HERO_ORDER.map((src) => H.slides[src])
          .map((s, i) => {
            const id = `hero-slide-${i + 1}`;
            const src = HERO_ORDER[i];
            // тире не начинает строку: неразрывный пробел перед ним (текст источника не меняется)
            const title = esc(s.title).replace(/ ([–-]) /g, '&nbsp;$1 ').replace('. ', '.<br> ');
            const t =
              i === 0
                ? `<h1 class="display hero__title" id="hero-title" tabindex="-1">${title}</h1>`
                : `<h2 class="display hero__title" tabindex="-1">${title}</h2>`;
            // у смысла «Эмоции - людям…» — главный lead; короткий дубль остаётся только в данных
            const lead = src === 0 ? H.lead : s.text;
            return `<div class="hero__slide${i === 0 ? ' is-active' : ''}" id="${id}" role="group" aria-roledescription="слайд" aria-label="${i + 1} из ${H.slides.length}" data-slide="${i}">
          ${t}
          <p class="hero__lead">${esc(lead)}</p>${s.support ? `\n          <p class="hero__support">${esc(s.support)}</p>` : ''}
        </div>`;
          })
          .join('\n        ')}
      </div>
      <ul class="hero__topics" aria-label="Направления">${H.topics.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <div class="hero__actions">
        ${btn(H.cta, { tag: 'a', href: '#contact', attrs: 'data-to-form' })}
        <div class="slider-ctrl" data-slider-ctrl>
          <button class="icon-btn slider-ctrl__btn" type="button" aria-controls="hero-slide-1 hero-slide-2 hero-slide-3" aria-label="Предыдущий смысл" data-prev>${icon('arrow-left')}</button>
          <p class="slider-ctrl__count" aria-live="polite"><span class="sr-only">Смысл </span><span data-current>1</span><span aria-hidden="true"> / </span><span class="sr-only"> из </span><span>${H.slides.length}</span></p>
          <button class="icon-btn slider-ctrl__btn" type="button" aria-controls="hero-slide-1 hero-slide-2 hero-slide-3" aria-label="Следующий смысл" data-next>${icon('arrow-right')}</button>
          <span class="slider-ctrl__ticks" aria-hidden="true">${H.slides.map((_, i) => `<i${i === 0 ? ' class="is-on"' : ''}></i>`).join('')}</span>
        </div>
      </div>
    </div>
    <div class="hero__visual">
      <div class="bolt-field hero__bolt" data-bolt="hero" aria-hidden="true"></div>
      <div class="placard" data-placard>
        ${person('07-hero-facts-person', { cls: 'placard__img', eager: true, alt: 'Постановочный персонаж держит табличку' })}
        <p class="placard__text"><span>${esc(H.system_line)}</span></p>
        ${doodle('placard')}
      </div>
    </div>
  </div>
</section>

<section class="about section" id="about" aria-labelledby="about-title">
  <div class="wrap">
    <h2 class="display section__title about__title" id="about-title" tabindex="-1">${esc(A.title)}</h2>
    <div class="about__grid">
      <div class="about__text">
        ${A.paragraphs.map((p, i) => `<p class="${i === 0 ? 'about__lead' : 'about__p'}">${esc(p)}</p>`).join('\n        ')}
        <div class="about__cta">${btn(A.cta, { attrs: 'aria-haspopup="dialog" data-open="lead-dialog"' })}</div>
      </div>
      <div class="about__media">
        <div class="video" data-video>
          ${
            video
              ? `<video class="video__el" controls preload="none" playsinline poster="${attr(CFG.video.poster)}" aria-label="${attr(CFG.video.title)}" title="${attr(CFG.video.title)}" width="1920" height="1080">
            <source src="${attr(CFG.video.url)}" type="video/mp4">
          </video>
          <button class="video__play" type="button" data-video-play aria-label="Смотреть: ${attr(CFG.video.title)}">${icon('play')}<span>Смотреть</span></button>
          <svg class="video__focus" viewBox="0 0 160 90" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M6 18V6H18M142 6H154V18M154 72V84H142"/></svg>`
              : `${photo('04-content-camera', { cls: 'video__poster', sizes: '(min-width: 1024px) 46vw, 92vw' })}
          <p class="video__note">Видео-визитка появится здесь после передачи ролика.</p>`
          }
        </div>
      </div>
    </div>
  </div>
</section>

<div class="discharge" aria-hidden="true"><div class="wrap"><div class="bolt-field discharge__field" data-bolt="band-1"></div></div></div>

<section class="questions section" id="questions" aria-labelledby="questions-title">
  <div class="wrap">
    <h2 class="display section__title" id="questions-title" tabindex="-1">${esc(Q.title)}</h2>
    <div class="questions__grid">
      <div class="questions__visual">
        <div class="bolt-field questions__bolt" data-bolt="pain" aria-hidden="true"></div>
        ${person('09-questions-crying-person', { cls: 'questions__person', sizes: '(min-width: 1024px) 28vw, 60vw' })}
        ${doodle('storm')}
      </div>
      <div class="questions__list">
        <ul class="faq" data-faq>
          ${Q.items
            .map(
              (q, i) => `<li class="faq__item${i === 0 ? ' is-open' : ''}" data-faq-item>
            <h3 class="faq__q">
              <button class="faq__btn" type="button" id="faq-q-${i + 1}" aria-expanded="${i === 0}" aria-controls="faq-a-${i + 1}" data-icon-anim>
                ${iconInline(faqIcons[i], 'faq__icon')}
                <span class="faq__text">${esc(q.question)}</span>
                <span class="faq__toggle" aria-hidden="true">${iconInline('plus')}</span>
              </button>
            </h3>
            <div class="faq__a" id="faq-a-${i + 1}" role="region" aria-labelledby="faq-q-${i + 1}"><div class="faq__a-inner"><p>${esc(q.answer)}</p></div></div>
          </li>`
            )
            .join('\n          ')}
        </ul>
        <div class="questions__cta">${btn(Q.cta, { attrs: 'aria-haspopup="dialog" data-open="checklist-dialog"', ic: 'download' })}</div>
      </div>
    </div>
  </div>
</section>

<section class="services section" id="services" aria-labelledby="services-title">
  <div class="wrap">
    <div class="services__intro">
      <div class="services__intro-text">
        <h2 class="display section__title services__title" id="services-title" tabindex="-1">${esc(S.title)}</h2>
        <p class="services__lead">${esc(S.intro)}</p>
      </div>
      <div class="services__presenter">${person('10-services-presenter-person', { cls: 'services__person', sizes: '(min-width: 1024px) 26vw, 60vw' })}${doodle('present')}</div>
    </div>
    <div class="packages-wrap">
    <div class="packages__spine" aria-hidden="true"><i class="packages__charge"></i><i class="packages__spark"></i></div>
    <ol class="packages" data-packages>
      ${S.packages
        .map((p, i) => {
          const [kicker, name] = splitTitle(p.title);
          return `<li class="pkg" id="pkg-${p.id}" data-pkg>
        <div class="pkg__num" aria-hidden="true"><span>${p.number}</span></div>
        <div class="pkg__head">
          <h3 class="pkg__title"><span class="pkg__kicker">${esc(kicker)}</span> <span class="pkg__name">${esc(name)}</span></h3>
          <dl class="pkg__meta">
            <div><dt>Формат:</dt> <dd>${esc(p.format)}</dd></div>
            <div><dt>Срок:</dt> <dd>${p.days} дней</dd></div>
          </dl>
        </div>
        <figure class="pkg__photo pkg__photo--${p.id}">
          ${PKG_ART[p.id].shadow ? shadow(pkgPhotos[p.id], PKG_ART[p.id].shadow) : ''}
          ${photo(pkgPhotos[p.id], { sizes: '(min-width: 1024px) 30vw, 92vw' })}
          ${PKG_ART[p.id].bolt ? `<div class="bolt-field pkg__bolt" data-bolt="${PKG_ART[p.id].bolt}" aria-hidden="true"></div>` : ''}
          ${PKG_ART[p.id].doodle ? doodle(PKG_ART[p.id].doodle) : ''}
        </figure>
        <div class="pkg__body">
          <p class="pkg__text">${esc(p.text)}</p>
          <div class="pkg__foot">
            <p class="pkg__price"><span class="pkg__price-label">${esc(T.rows[T.rows.length - 1][0])}</span> <span class="pkg__price-value">${esc(priceByIndex[i] || rub(p.price_rub))}</span></p>
            <div class="pkg__action">${download(p.download_label, CFG.downloads[p.id], `dl-${p.id}`)}</div>
          </div>
        </div>
      </li>`;
        })
        .join('\n      ')}
    </ol>
    </div>
  </div>
</section>

<div class="discharge" aria-hidden="true"><div class="wrap"><div class="bolt-field discharge__field" data-bolt="band-2"></div></div></div>

<section class="comparison section" id="comparison" aria-labelledby="comparison-title">
  <div class="wrap">
    <div class="comparison__intro">
      <div class="comparison__presenter">${person('11-comparison-presenter-person', { cls: 'comparison__person', sizes: '(min-width: 1024px) 20vw, 40vw' })}${doodle('point')}</div>
      <h2 class="display section__title comparison__title" id="comparison-title">${esc(T.title)}</h2>
    </div>
    <p class="table-hint" id="table-hint">${icon('arrow-right')}<span>Таблица прокручивается по горизонтали</span></p>
    <div class="table-scroll" tabindex="0" role="region" aria-labelledby="comparison-title" aria-describedby="table-hint" data-table>
      <table class="compare">
        <caption class="sr-only">${esc(T.title)}: сравнение трёх пакетов</caption>
        <colgroup><col class="compare__c0"><col><col><col></colgroup>
        <thead>
          <tr>${T.columns.map((c, i) => `<th scope="col"${i ? ` data-col="${i}"` : ''}>${esc(c)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${T.rows
            .map(
              (r, ri) =>
                `<tr${ri === T.rows.length - 1 ? ' class="is-price"' : ''}><th scope="row">${esc(r[0])}</th>${r
                  .slice(1)
                  .map((c, i) => `<td data-col="${i + 1}">${esc(c)}</td>`)
                  .join('')}</tr>`
            )
            .join('\n          ')}
        </tbody>
      </table>
    </div>
    <div class="comparison__actions">
      <div class="comparison__action">${download(T.download_label, CFG.downloads.full_offer, 'dl-full')}</div>
      ${btn(T.chat_label, { cls: 'btn--primary', ic: 'send', attrs: 'aria-haspopup="dialog" aria-controls="chat-panel" data-open-chat data-icon-anim' })}
    </div>
  </div>
</section>

<section class="contact section" id="contact" aria-labelledby="contact-title">
  <div class="wrap">
    <div class="contact__grid">
      <div class="contact__side">
        <h2 class="display section__title contact__title" id="contact-title">${esc(K.title)}</h2>
        <div class="contact__media">
          <div class="contact__visual">
            <div class="bolt-field contact__bolt" data-bolt="phone" aria-hidden="true"></div>
            ${person('12-contact-phone-person', { cls: 'contact__person', sizes: '(min-width: 1024px) 20vw, 50vw' })}
            ${doodle('ring')}
          </div>
          <div class="contact__lists">
            <div class="contact__group">
              <h3 class="contact__h">${esc(K.labels.contacts)}</h3>
              ${contactList([...phones, ...emails], 'Телефон и почта появятся здесь после передачи данных.')}
            </div>
            <div class="contact__group">
              <h3 class="contact__h">${esc(K.labels.social)}</h3>
              ${contactList(socials, 'Ссылки на соцсети появятся здесь после передачи данных.')}
            </div>
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
          <textarea class="field__input field__input--area" id="cf-task" name="task" rows="4"></textarea>
        </div>
        <div class="form__submit">
          <button class="btn btn--primary btn--wide" type="submit"><span class="btn__label">${esc(K.labels.submit)}</span>${iconInline('send', 'btn__icon')}<span class="btn__arc" aria-hidden="true"></span></button>
        </div>
        <p class="form__status" role="status" aria-live="polite"></p>
      </form>
    </div>
  </div>
</section>

</main>

<footer class="site-footer">
  <div class="wrap site-footer__grid">
    <a class="site-footer__logo" href="#home" aria-label="КБ-13 — наверх страницы">${logo()}</a>
    <nav class="site-footer__nav" aria-label="Навигация в подвале">
      <ul>${C.navigation.items.map((n) => `<li><a href="${n.anchor}">${esc(n.label)}</a></li>`).join('')}</ul>
    </nav>
    <div class="site-footer__legal">
      <p>КБ-13 · креативное бюро</p>
      <p class="site-footer__muted">Реквизиты, политика конфиденциальности и согласие на рассылку будут опубликованы после утверждения текстов.</p>
    </div>
  </div>
</footer>

<button class="to-top" type="button" aria-label="Наверх" data-to-top hidden>${icon('back-to-top')}</button>

<div class="chat" id="chat-panel" role="dialog" aria-modal="false" aria-labelledby="chat-title" hidden>
  <div class="chat__head">
    <p class="chat__title" id="chat-title">${esc(O.chat.title)}</p>
    <button class="icon-btn" type="button" aria-label="Закрыть чат" data-chat-close>${icon('close')}</button>
  </div>
  <div class="chat__body">
    <p class="chat__state">Чат ещё не подключён: сообщения отсюда пока никуда не уходят. Оставьте контакт в форме обращения — это работает.</p>
    <label class="sr-only" for="chat-msg">${esc(O.chat.message_placeholder)}</label>
    <textarea class="field__input chat__input" id="chat-msg" rows="2" placeholder="${attr(O.chat.message_placeholder)}" disabled></textarea>
    <a class="btn btn--primary btn--wide" href="#contact" data-to-form><span class="btn__label">Перейти к форме</span><span class="btn__arc" aria-hidden="true"></span></a>
  </div>
</div>

<dialog class="modal" id="lead-dialog" aria-labelledby="lead-title">
  <form class="form modal__form" method="dialog" novalidate data-form="lead">
    <div class="modal__bolt" aria-hidden="true"></div>
    <div class="modal__head">
      <h2 class="modal__title display" id="lead-title">${esc(O.lead.title)}</h2>
      <button class="icon-btn modal__close" type="button" aria-label="Закрыть" data-close>${icon('close')}</button>
    </div>
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

<dialog class="modal" id="checklist-dialog" aria-labelledby="checklist-title" aria-describedby="checklist-desc">
  <form class="form modal__form" method="dialog" novalidate data-form="checklist">
    <div class="modal__bolt" aria-hidden="true"></div>
    <div class="modal__head">
      <h2 class="modal__title display" id="checklist-title">${esc(O.checklist.title)}</h2>
      <button class="icon-btn modal__close" type="button" aria-label="Закрыть" data-close>${icon('close')}</button>
    </div>
    <p class="modal__desc" id="checklist-desc">${esc(O.checklist.description)}</p>
    <div class="field">
      <label class="field__label" for="ck-email">${esc(O.checklist.email_label)}</label>
      <input class="field__input" id="ck-email" name="email" type="email" autocomplete="email" inputmode="email" required data-validate="email" aria-describedby="ck-email-err">
      <p class="field__error" id="ck-email-err"></p>
    </div>
    <p class="modal__consent">Здесь будет утверждённый текст согласия на рассылку со ссылкой на документ.</p>
    <div class="form__submit"><button class="btn btn--primary btn--wide" type="submit"><span class="btn__label">${esc(O.checklist.submit)}</span>${iconInline('download', 'btn__icon')}<span class="btn__arc" aria-hidden="true"></span></button></div>
    <p class="form__status" role="status" aria-live="polite"></p>
  </form>
</dialog>

<noscript><style>.hero__slide{position:static!important;visibility:visible!important}.faq__a{grid-template-rows:1fr!important}</style></noscript>
</body>
</html>
`;

writeFileSync(join(root, 'index.html'), html);
console.log(`index.html: ${(html.length / 1024).toFixed(1)} KB`);
