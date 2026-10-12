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
import { bundle } from './bundle.mjs';

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
    `<symbol id="kb-bolt" viewBox="0 0 2000 1278.16">${bolt}</symbol>` +
    `<filter id="kb-lzblur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter><filter id="kb-outline" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feComponentTransfer in="SourceAlpha" result="a"><feFuncA type="table" tableValues="0 0 1 1"/></feComponentTransfer><feMorphology in="a" operator="dilate" radius="2.5" result="d"/><feGaussianBlur in="d" stdDeviation="0.7" result="ds"/><feFlood flood-color="#F20D0D"/><feComposite in2="ds" operator="in" result="ring"/><feGaussianBlur in="ring" stdDeviation="3.5" result="g1"/><feGaussianBlur in="ring" stdDeviation="11" result="g2"/><feMerge><feMergeNode in="g2"/><feMergeNode in="g1"/><feMergeNode in="ring"/></feMerge></filter>` +
    `</defs></svg>`
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
  const inner = `<span class="btn__label">${esc(label)}</span>${iconInline(ic || 'arrow-right', 'btn__icon')}<span class="btn__arc" aria-hidden="true"></span>`;
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
const DOODLES = {
  // команда в полный рост. «Услуги» (1122×1402): искры у головы
  present: {
    box: [0, 0, 1122, 1402],
    paths: [
      { d: star(330, 210, 34), c: 'red', w: 2 },
      { d: star(395, 95, 18), w: 1.8 },
      { d: star(800, 120, 16), c: 'red', w: 1.6 },
    ],
  },
  // «Сводная» (1024×1536): стрелка уходит вправо за кадр — к заголовку таблицы
  point: {
    box: [0, 0, 1500, 1536],
    wide: true,
    paths: [
      { d: 'M650 250C850 210 1040 330 1080 560', c: 'red', w: 2.6 },
      { d: 'M1040 524 1082 566 1118 518', c: 'red', w: 2.6 },
    ],
  },
  // «Контакты» (1122×1402): «звонок» — дуги в свободном углу над головой
  ring: {
    box: [0, 0, 1122, 1402],
    paths: [
      { d: 'M860 150A210 210 0 0 1 990 300', c: 'red', w: 2.4 },
      { d: 'M890 64A310 310 0 0 1 1080 290', c: 'red', w: 2.4 },
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

/* ---------- персонажи: красный контур + молнии из глаз (координаты глаз — в пикселях кадра) ---------- */
const EYES = {
  '13-team-1': [550, 214, 635, 219],
  '13-team-2': [474, 161, 536, 162],
  '13-team-3': [550, 190, 635, 207],
  '13-team-4': [580, 255, 670, 282],
};
const beams = (id) =>
  `<svg class="who__beams" viewBox="0 0 ${IMG[id].width} ${IMG[id].height}" aria-hidden="true" focusable="false">${[0, 1]
    .map(() => '<g class="beam"><polyline class="beam__glow" pathLength="1"/><polyline class="beam__body" pathLength="1"/><polyline class="beam__core" pathLength="1"/></g>')
    .join('')}</svg>`;
/* неоновый контур: готовый слой -glow (у портретов команды) или SVG-фильтр по альфе кадра */
const glowImg = (id, eager) => {
  const i = IMG[id];
  const src = i.glow ? i.glow : `assets/img/${id}-768.webp`;
  return `<img class="who__glow${i.glow ? ' who__glow--baked' : ''}" src="${src}" width="${i.width}" height="${i.height}" alt="" aria-hidden="true" ${eager ? 'decoding="async"' : 'loading="lazy" decoding="async"'}>`;
};
/* who(key, id, opts): обёртка по пропорциям кадра вокруг вырезанного персонажа */
const who = (key, id, { cls = '', imgCls = '', eager = false, sizes, alt, extra = '', slide = '', eyes = true } = {}) =>
  `<div class="who ${cls}" data-who="${key}"${eyes ? ` data-eyes="${EYES[id].join(',')}"` : ''}${slide ? ` data-slide-from="${slide}"` : ''} style="aspect-ratio:${IMG[id].width} / ${IMG[id].height}">${glowImg(id, eager)}${person(id, { cls: `who__img ${imgCls}`, eager, sizes, alt })}${extra}${eyes ? beams(id) : ''}</div>`;

/* типограф для новых блоков: тире не начинает строку, короткие предлоги и союзы не висят в конце строки */
const tp = (t) =>
  esc(t)
    .replace(/ ([–—-]) /g, '&nbsp;$1 ')
    .replace(/(^|[\s(«])([а-яёА-ЯЁ]{1,2}) /g, '$1$2&nbsp;');
/* ---------- данные ---------- */
const H = C.hero;
const A = C.about;
const Q = C.questions;
const S = C.services;
const T = C.comparison;
const K = C.contact;
const O = C.overlays;
const QZ = C.quiz;
const CS = C.cases;
/* Порядок слайдов hero (индексы content.hero.slides). По просьбе заказчика 1-й и 2-й поменяны местами:
   первым показывается «Внимание – новая валюта!». Первый слайд в этом порядке получает H1. */
const HERO_ORDER = [1, 0, 2];
const faqIcons = ['contract-shield', 'parallel', 'new-angle', 'dialogue', 'time', 'results'];
const pkgPhotos = { consultation: '02-plane', mentorship: '03-mentorship-chair', partnership: '05-partnership-system' };
const PKG_ART = {
  consultation: {},
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

/* ---------- документы: политика, согласие, реквизиты (152-ФЗ) ---------- */
const L = JSON.parse(read('legal.ru.json'));
const LG = CFG.legal;
const OP = LG.operator;
const LU = L.ui;
const DOC = { privacy: L.privacy.file, consent: L.consent.file, requisites: L.requisites.file };
// контрольные цифры: опечатка в реквизитах ломает сборку, а не договор
const ctl = (s, w) => (w.reduce((a, k, i) => a + k * +s[i], 0) % 11) % 10;
const innOk = (s) => /^\d{12}$/.test(s) && ctl(s, [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === +s[10] && ctl(s, [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === +s[11];
const ogrnipOk = (s) => /^\d{15}$/.test(s) && Number(BigInt(s.slice(0, 14)) % 13n) % 10 === +s[14];
const accOk = (bik, acc, ks) => {
  const w = [7, 1, 3];
  const sum = (x) => [...x].reduce((a, c, i) => a + +c * w[i % 3], 0) % 10 === 0;
  return sum(bik.slice(-3) + acc) && sum('0' + bik.slice(4, 6) + ks);
};
if (!innOk(OP.inn) || !ogrnipOk(OP.ogrnip) || !accOk(OP.bank.bik, OP.bank.account, OP.bank.corr))
  throw new Error('site.config.json → legal.operator: не сходятся контрольные цифры ИНН, ОГРНИП или счёта');
for (const k of ['privacy', 'consent'])
  if (!JSON.stringify(L[k]).includes(OP.inn) || !JSON.stringify(L[k]).includes(OP.ogrnip))
    throw new Error(`legal.ru.json → ${k}: ИНН/ОГРНИП в тексте не совпадают с site.config.json`);
const siteHost = LG.site_url ? LG.site_url.replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
const pdMail = LG.pd_email ? `<a href="mailto:${attr(LG.pd_email)}">${esc(LG.pd_email)}</a>` : '';
const postal = esc(OP.postal_address);
const TOKENS = {
  address: esc(OP.legal_address),
  pd_channel: pdMail
    ? `электронная почта для обращений по вопросам обработки персональных данных: ${pdMail}`
    : 'обращения по вопросам обработки персональных данных принимаются в письменной форме по этому адресу',
  site_clause: siteHost
    ? `Сайт КБ13 размещается по адресу: <a href="${attr(LG.site_url)}">${esc(siteHost)}</a> (далее&nbsp;— Сайт).`
    : 'Сайт КБ13&nbsp;— сайт в&nbsp;сети «Интернет», на&nbsp;котором размещена настоящая Политика (далее&nbsp;— Сайт).',
  pd_request: pdMail
    ? `обратиться к&nbsp;Оператору по&nbsp;адресу электронной почты: ${pdMail} или направить письменное обращение по&nbsp;почтовому адресу Оператора: ${postal}.`
    : `направить Оператору письменное обращение по&nbsp;почтовому адресу: ${postal}.`,
  withdraw: pdMail
    ? `направив обращение Оператору по&nbsp;адресу электронной почты: ${pdMail} или письменное обращение по&nbsp;почтовому адресу Оператора: ${postal}.`
    : `направив Оператору письменное обращение по&nbsp;почтовому адресу: ${postal}.`,
  policy_link: siteHost
    ? ` по&nbsp;адресу: <a href="${attr(LG.site_url.replace(/\/$/, '') + '/' + DOC.privacy)}">${esc(siteHost + '/' + DOC.privacy)}</a>`
    : `, опубликованной на&nbsp;сайте КБ13 в&nbsp;разделе «<a href="${DOC.privacy}">Политика обработки персональных данных</a>»`,
};
const lt = (s) =>
  tp(s).replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in TOKENS)) throw new Error('legal.ru.json: неизвестное поле {{' + k + '}}');
    return TOKENS[k];
  });

/* Вебвизор не записывает содержимое полей форм (Политика, п. 8.4) */
const ymHide = (h) => h.replace(/class="field__input/g, 'class="ym-disable-keys ym-hide-content field__input');

/* галочка согласия: обязательна, по умолчанию не отмечена; текст согласия — отдельной страницей */
const consentBox = (id) => `<div class="consent">
          <label class="consent__box" for="${id}-pd">
            <input class="consent__input" id="${id}-pd" name="pd_consent" type="checkbox" value="yes" required aria-describedby="${id}-pd-err">
            <span class="consent__mark" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
            <span class="consent__text">Я даю <a href="${DOC.consent}" target="_blank" rel="noopener">согласие на&nbsp;обработку персональных данных</a></span>
          </label>
          <p class="consent__note">Как мы обращаемся с&nbsp;данными&nbsp;— в&nbsp;<a href="${DOC.privacy}" target="_blank" rel="noopener">Политике обработки персональных данных</a>. ${esc(LU.consent_note_post)}</p>
          <p class="field__error" id="${id}-pd-err"></p>
        </div>`;

/* подвал — общий для главной и документов; base — путь к главной ('' на главной) */
const footer = (base) => `<footer class="site-footer">
  <div class="wrap site-footer__grid">
    <a class="site-footer__logo" href="${base ? base : '#home'}" aria-label="КБ-13 — ${base ? 'на главную' : 'наверх страницы'}">${logo()}</a>
    <nav class="site-footer__nav" aria-label="Навигация в подвале">
      <ul>${C.navigation.items.map((n) => `<li><a href="${base}${n.anchor}">${esc(n.label)}</a></li>`).join('')}</ul>
    </nav>
    <div class="site-footer__legal">
      <p class="site-footer__brand">КБ-13 · креативное бюро</p>
      <p class="site-footer__op">${esc(OP.short)}<br>ИНН&nbsp;${esc(OP.inn)} · ОГРНИП&nbsp;${esc(OP.ogrnip)}</p>
      <ul class="site-footer__docs">
        <li><a href="${DOC.privacy}">Политика обработки персональных данных</a></li>
        <li><a href="${DOC.consent}">Согласие на&nbsp;обработку персональных данных</a></li>
        <li><a href="${DOC.requisites}">Реквизиты</a></li>
        <li><button class="site-footer__cookie" type="button" data-cookie-open aria-controls="cookie-banner">${esc(LU.cookie_settings)}</button></li>
      </ul>
      <p class="site-footer__muted">${tp(LU.offer)}</p>
      <p class="site-footer__muted">© ${new Date().getFullYear()} КБ-13</p>
    </div>
  </div>
</footer>`;

/* cookie-баннер: показывается при первом визите, выбор меняется в подвале («Настройки cookie») */
const cookieBanner = () => `<section class="cookies" id="cookie-banner" aria-labelledby="cookie-title" data-saved="${attr(LU.cookie_saved)}" hidden>
  <div class="cookies__main">
    <p class="cookies__title" id="cookie-title"><svg class="cookies__bolt" viewBox="0 0 2000 1278.16" aria-hidden="true" focusable="false"><use href="#kb-bolt"/></svg>${esc(LU.cookie_title)}</p>
    <p class="cookies__text">${tp(LU.cookie_text)} <a href="${DOC.privacy}#privacy-8">${esc(LU.cookie_more)}</a>.</p>
  </div>
  <div class="cookies__prefs" id="cookie-prefs" data-cookie-prefs hidden>
    <label class="cookies__opt"><input type="checkbox" checked disabled><span><b>${esc(LU.cookie_necessary)}</b> ${tp(LU.cookie_necessary_note)}</span></label>
    <label class="cookies__opt"><input type="checkbox" name="analytics"><span><b>${esc(LU.cookie_analytics)}</b> ${tp(LU.cookie_analytics_note)}</span></label>
    <label class="cookies__opt"><input type="checkbox" name="marketing"><span><b>${esc(LU.cookie_marketing)}</b> ${tp(LU.cookie_marketing_note)}</span></label>
  </div>
  <div class="cookies__actions">
    <button class="btn btn--primary btn--small" type="button" data-cookie="all"><span class="btn__label">${esc(LU.cookie_accept)}</span></button>
    <button class="btn btn--ghost btn--small" type="button" data-cookie="necessary"><span class="btn__label">${esc(LU.cookie_reject)}</span></button>
    <button class="cookies__link" type="button" data-cookie="custom" aria-expanded="false" aria-controls="cookie-prefs">${esc(LU.cookie_custom)}</button>
    <button class="btn btn--primary btn--small" type="button" data-cookie="save" hidden><span class="btn__label">${esc(LU.cookie_save)}</span></button>
  </div>
  <p class="sr-only" role="status" data-cookie-status></p>
</section>`;

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
<link rel="preload" as="image" href="assets/img/13-team-1-768.webp" imagesrcset="assets/img/13-team-1-768.webp 768w, assets/img/13-team-1.webp 1024w" imagesizes="(min-width: 900px) 40vw, 86vw" fetchpriority="high">
<link rel="stylesheet" href="assets/css/fonts.css?v=${VERSION}">
<link rel="stylesheet" href="assets/css/main.css?v=${VERSION}">
<script>document.documentElement.className='js';</script>
<script type="application/json" id="kb-talk">${JSON.stringify([T.chat_label, O.chat.title]).replace(/</g, '\\u003c')}</script>
<script type="application/json" id="kb-config">${JSON.stringify({
  phone: CFG.phone,
  endpoints: CFG.endpoints,
  chat: CFG.chat,
  analytics: CFG.analytics,
  legal: { revision: LG.revision, consent: DOC.consent },
}).replace(/</g, '\\u003c')}</script>
<script src="assets/js/site.js?v=${VERSION}" defer></script>
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
                ? `<h1 class="display hero__title" id="hero-title" tabindex="-1"><span class="roll">${title}</span></h1>`
                : `<h2 class="display hero__title" tabindex="-1"><span class="roll">${title}</span></h2>`;
            // у смысла «Эмоции - людям…» — главный lead; короткий дубль остаётся только в данных
            const lead = src === 0 ? H.lead : s.text;
            return `<div class="hero__slide${i === 0 ? ' is-active' : ''}" id="${id}" role="group" aria-roledescription="слайд" aria-label="${i + 1} из ${H.slides.length}" data-slide="${i}">
          ${t}
          <p class="hero__lead">${esc(lead)}</p>${s.support ? `\n          <p class="hero__support">${esc(s.support)}</p>` : ''}
        </div>`;
          })
          .join('\n        ')}
      </div>
      <div class="hero__foot">
        <p class="hero__hint" data-hint><svg class="icon" viewBox="0 0 2000 1278.16" aria-hidden="true" focusable="false"><use href="#kb-bolt"/></svg><span class="hint--mouse">Кликните по пустому месту — ударит молния</span><span class="hint--touch">Коснитесь пустого места — ударит молния</span></p>
        <div class="hero__actions">
          ${btn(H.cta, { tag: 'a', href: '#contact', attrs: 'data-to-form' })}
          <div class="slider-ctrl" data-slider-ctrl>
            <button class="icon-btn slider-ctrl__btn" type="button" aria-controls="hero-slide-1 hero-slide-2 hero-slide-3" aria-label="Предыдущий смысл" data-prev>${icon('arrow-left')}</button>
            <p class="slider-ctrl__count" aria-live="polite"><span class="sr-only">Смысл </span><span data-current>1</span><span aria-hidden="true"> / </span><span class="sr-only"> из </span><span>${H.slides.length}</span></p>
            <button class="icon-btn slider-ctrl__btn" type="button" aria-controls="hero-slide-1 hero-slide-2 hero-slide-3" aria-label="Следующий смысл" data-next>${icon('arrow-right')}</button>
            <button class="icon-btn slider-ctrl__btn slider-ctrl__auto" type="button" aria-pressed="true" aria-label="Остановить автопрокрутку" data-autoplay><svg class="icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><g class="i-pause" fill="currentColor"><rect x="14" y="12" width="6" height="24" rx="1"/><rect x="28" y="12" width="6" height="24" rx="1"/></g><path class="i-play" d="M17 12 36 24 17 36Z" fill="currentColor"/></svg></button>
            <span class="slider-ctrl__ticks" aria-hidden="true">${H.slides.map((_, i) => `<i${i === 0 ? ' class="is-on"' : ''}></i>`).join('')}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="hero__visual">
      <div class="hero__person" data-hero-person>${who('hero', '13-team-1', { eager: true, sizes: '(min-width: 900px) 40vw, 86vw', alt: IMG['13-team-1'].alt })}</div>
    </div>
  </div>
</section>

<div class="mq" data-mq aria-label="Направления: ${attr(H.topics.join(', '))}" role="img">
  <div class="mq__track" data-mq-track aria-hidden="true">${[...H.topics, ...H.topics, ...H.topics, ...H.topics, ...H.topics, ...H.topics]
    .map((w, i) => `<span class="mq__item${i % 2 ? ' mq__item--outline' : ''}"><span>${esc(w)}</span><svg class="mq__bolt" viewBox="0 0 2000 1278.16" focusable="false"><use href="#kb-bolt"/></svg></span>`)
    .join('')}</div>
</div>

<section class="about section" id="about" aria-labelledby="about-title">
  <div class="wrap">
    <h2 class="display section__title about__title" id="about-title" tabindex="-1">${esc(A.title)}</h2>
    <div class="about__grid">
      <div class="about__text">
        ${A.paragraphs.map((p, i) => `<p class="${i === 0 ? 'about__lead' : i === A.paragraphs.length - 1 ? 'about__punch' : 'about__p'}">${esc(p)}</p>`).join('\n        ')}
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

<div class="discharge" aria-hidden="true" data-cross></div>

<section class="questions section" id="questions" aria-labelledby="questions-title">
  <div class="wrap">
    <h2 class="display section__title" id="questions-title" tabindex="-1">${esc(Q.title)}</h2>
    <ul class="pros" data-pros>
      ${Q.items
        .map(
          (q, i) => `<li class="pro" data-pro style="--i:${i}">
        <div class="pro__top"><span class="pro__num" aria-hidden="true">0${i + 1}</span>${iconInline(faqIcons[i], 'pro__icon')}</div>
        <h3 class="pro__q">${esc(q.question)}</h3>
        <p class="pro__a">${esc(q.answer)}</p>
        <span class="pro__charge" aria-hidden="true"></span><span class="btn__arc pro__arc" aria-hidden="true"></span>
      </li>`
        )
        .join('\n      ')}
    </ul>
    <div class="pros__nav" aria-hidden="true"><span data-pros-current>1</span>&nbsp;/&nbsp;${Q.items.length}</div>
    <div class="questions__cta">${btn(Q.cta, { attrs: 'aria-haspopup="dialog" data-open="checklist-dialog"', ic: 'download' })}</div>
  </div>
</section>

<div class="discharge" aria-hidden="true" data-cross></div>

<section class="services section" id="services" aria-labelledby="services-title">
  <div class="wrap">
    <div class="services__intro">
      <div class="services__intro-text">
        <h2 class="display section__title services__title" id="services-title" tabindex="-1">${esc(S.title)}</h2>
        <p class="services__lead">${esc(S.intro)}</p>
        <ul class="drift" data-drift aria-label="${attr(S.intro_words.join(', '))}">
          ${S.intro_words.map((w, i) => `<li class="drift__w drift__w--${i}" style="--i:${i}"><span>${esc(w)}</span></li>`).join('')}
        </ul>
      </div>
      <div class="services__presenter">${who('services', '13-team-3', { imgCls: 'services__person', sizes: '(min-width: 1024px) 28vw, 60vw', extra: doodle('present'), slide: 'right' })}</div>
    </div>
    <div class="packages-wrap">
    <ol class="packages" data-packages>
      ${S.packages
        .map((p, i) => {
          const [kicker, name] = splitTitle(p.title);
          return `<li class="pkg" id="pkg-${p.id}" data-pkg>
        <div class="pkg__num" aria-hidden="true"><span data-tap="pkg-${p.id}">${p.number}</span></div>
        <div class="pkg__head">
          <h3 class="pkg__title"><span class="pkg__kicker">${esc(kicker)}</span> <span class="pkg__name">${
            p.title_struck ? esc(name).replace(esc(p.title_struck), `<s class="strike">${esc(p.title_struck)}</s>`) : esc(name)
          }</span></h3>
          <dl class="pkg__meta">
            <div><dt>Формат:</dt> <dd>${esc(p.format)}</dd></div>
            <div><dt>Срок:</dt> <dd>${p.days} дней</dd></div>
          </dl>
        </div>
        <figure class="pkg__photo pkg__photo--${p.id}"><div class="pkg__frame">
          ${PKG_ART[p.id].shadow ? shadow(pkgPhotos[p.id], PKG_ART[p.id].shadow) : ''}
          ${photo(pkgPhotos[p.id], { sizes: '(min-width: 1024px) 30vw, 92vw' })}
          ${PKG_ART[p.id].bolt ? `<div class="bolt-field pkg__bolt" data-bolt="${PKG_ART[p.id].bolt}" aria-hidden="true"></div>` : ''}
          ${PKG_ART[p.id].doodle ? doodle(PKG_ART[p.id].doodle) : ''}
        </div></figure>
        <div class="pkg__body">
          <p class="pkg__text">${esc(p.text)}</p>
          <div class="pkg__foot">
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

<section class="quiz section" id="brief" aria-labelledby="quiz-title">
  <div class="wrap">
    <div class="quiz__head">
      <p class="quiz__eyebrow">${esc(QZ.eyebrow)}</p>
      <h2 class="display section__title quiz__title" id="quiz-title" tabindex="-1">${tp(QZ.title)}</h2>
      <p class="quiz__lead">${tp(QZ.lead)}</p>
    </div>
    <form class="form quiz__box" id="brief-form" novalidate data-form="brief" data-quiz aria-labelledby="quiz-title">
      <div class="quiz__steps" data-quiz-steps>
      ${QZ.steps
        .map(
          (st, i) => `<fieldset class="quiz__step${i === 0 ? ' is-active' : ''}" data-step="${i}">
        <legend class="quiz__q"><span class="quiz__qn">${esc(QZ.step_label)} ${i + 1}</span>${tp(st.question)}</legend>
        <div class="quiz__opts">${st.options
          .map(
            (o, j) =>
              `<label class="quiz__opt"><input type="radio" name="q${i + 1}" value="${attr(o)}"${st.packages ? ` data-package="${st.packages[j]}"` : ''}><span class="quiz__opt-t">${tp(o)}</span><svg class="quiz__opt-bolt" viewBox="0 0 2000 1278.16" aria-hidden="true" focusable="false"><use href="#kb-bolt"/></svg></label>`
          )
          .join('')}</div>
      </fieldset>`
        )
        .join('\n      ')}
      <div class="quiz__step quiz__final" data-step="${QZ.steps.length}">
        <div class="quiz__result" data-quiz-result aria-live="polite">
          <p class="quiz__rt">${esc(QZ.result_title)}</p>
          ${S.packages
            .map(
              (p, i) => `<div class="quiz__pkg" data-pkg="${p.id}"${i ? ' hidden' : ''}>
            <p class="quiz__pkg-title display">${esc(p.title.replace(/^Пакет \d+\s*/, ''))}</p>
            <p class="quiz__pkg-meta"><span>Формат: <b>${esc(p.format)}</b></span><span>Срок: <b>${p.days} дней</b></span><span>Цена: <b>${esc(priceByIndex[i])}</b></span></p>
            <a class="quiz__more" href="#pkg-${p.id}">${esc(QZ.result_link)}</a>
          </div>`
            )
            .join('\n          ')}
          <input type="hidden" name="package" value="">
          <button class="quiz__restart" type="button" data-quiz-restart>${esc(QZ.restart)}</button>
        </div>
        <div class="quiz__contact">
          <p class="quiz__ct">${tp(QZ.contact_title)}</p>
          <div class="field">
            <label class="field__label" for="bf-name">${esc(QZ.labels.name)}</label>
            <input class="field__input" id="bf-name" name="name" type="text" autocomplete="name" required aria-describedby="bf-name-err">
            <p class="field__error" id="bf-name-err"></p>
          </div>
          <div class="field">
            <label class="field__label" for="bf-contact">${esc(QZ.labels.contact)}</label>
            <input class="field__input" id="bf-contact" name="contact" type="text" autocomplete="email" inputmode="email" required data-validate="phone-or-email" aria-describedby="bf-contact-err">
            <p class="field__error" id="bf-contact-err"></p>
          </div>
          ${consentBox('bf')}
          <div class="form__submit"><button class="btn btn--primary btn--wide" type="submit"><span class="btn__label">${esc(QZ.submit)}</span>${iconInline('send', 'btn__icon')}<span class="btn__arc" aria-hidden="true"></span></button></div>
          <p class="form__status" role="status" aria-live="polite"></p>
        </div>
      </div>
      </div>
      <div class="quiz__bar">
        <button class="quiz__back" type="button" data-quiz-back>${icon('arrow-left')}<span>${esc(QZ.back)}</span></button>
        <p class="quiz__count" aria-live="polite"><span data-quiz-n>1</span>&nbsp;/&nbsp;${QZ.steps.length}</p>
        <span class="quiz__ticks" aria-hidden="true">${QZ.steps.map((_, i) => `<i${i === 0 ? ' class="is-on"' : ''}></i>`).join('')}</span>
        <button class="btn btn--primary quiz__next" type="button" data-quiz-next disabled><span class="btn__label">${esc(QZ.next)}</span>${iconInline('arrow-right', 'btn__icon')}<span class="btn__arc" aria-hidden="true"></span></button>
      </div>
    </form>
  </div>
</section>

<div class="discharge" aria-hidden="true" data-cross></div>

<section class="comparison section" id="comparison" aria-labelledby="comparison-title">
  <div class="wrap">
    <div class="comparison__intro">
      <div class="comparison__presenter">${who('comparison', '13-team-2', { imgCls: 'comparison__person', sizes: '(min-width: 1024px) 22vw, 40vw', extra: doodle('point'), slide: 'left' })}</div>
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

<section class="cases section" id="cases" aria-labelledby="cases-title">
  <div class="wrap cases__head">
    <h2 class="display section__title" id="cases-title" tabindex="-1">${tp(CS.title)}</h2>
    <p class="cases__lead">${tp(CS.lead)}</p>
    <div class="cases__nav">
      <button class="icon-btn" type="button" aria-label="Предыдущее дело" data-cases-prev>${icon('arrow-left')}</button>
      <button class="icon-btn" type="button" aria-label="Следующее дело" data-cases-next>${icon('arrow-right')}</button>
    </div>
  </div>
  <ol class="cases__track" data-cases tabindex="0" aria-label="${attr(CS.title)}">
    ${CS.items
      .map(
        (c, i) => `<li class="case" data-case id="case-${c.id}">
      <article class="case__card" aria-labelledby="case-${c.id}-t">
        <p class="case__no">Дело №&nbsp;${String(i + 1).padStart(2, '0')}</p>
        <span class="case__stamp" aria-hidden="true">${esc(CS.stamp)}</span>
        <p class="case__tag">${esc(c.tag)}</p>
        <p class="case__metric"><span class="case__big">${esc(c.metric)}</span><span class="case__cap">${tp(c.metric_caption)}</span></p>
        <h3 class="case__title" id="case-${c.id}-t">${tp(c.title)}</h3>
        <p class="case__teaser">${esc(c.text[0])}</p>
        <div class="case__full">${c.text.map((t) => `<p>${esc(t)}</p>`).join('')}${c.quote ? `<blockquote class="case__quote"><p>${tp(c.quote)}</p></blockquote>` : ''}${(c.after || []).map((t) => `<p>${esc(t)}</p>`).join('')}</div>
        ${btn(CS.read, { cls: 'btn--ghost case__open', attrs: `aria-haspopup="dialog" data-case-open="${c.id}"` })}
      </article>
    </li>`
      )
      .join('\n    ')}
  </ol>
</section>

<section class="contact section" id="contact" aria-labelledby="contact-title">
  <div class="wrap">
    <div class="contact__grid">
      <div class="contact__side">
        <h2 class="display section__title contact__title" id="contact-title">${esc(K.title)}</h2>
        <div class="contact__media">
          <div class="contact__visual">
            ${who('contact', '13-team-4', { imgCls: 'contact__person', sizes: '(min-width: 1024px) 30vw, 70vw', extra: doodle('ring'), slide: 'left' })}
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
        ${consentBox('cf')}
        <div class="form__submit">
          <button class="btn btn--primary btn--wide" type="submit"><span class="btn__label">${esc(K.labels.submit)}</span>${iconInline('send', 'btn__icon')}<span class="btn__arc" aria-hidden="true"></span></button>
        </div>
        <p class="form__status" role="status" aria-live="polite"></p>
      </form>
    </div>
  </div>
</section>

</main>

${footer('')}

<button class="talk" type="button" aria-haspopup="dialog" aria-controls="chat-panel" aria-label="${attr(T.chat_label)}: ${attr(O.chat.title)}" data-open-chat data-talk>
  <span class="talk__bubble" aria-hidden="true"><span class="talk__text" data-talk-text>${esc(T.chat_label)}</span></span>
  <svg class="talk__waves" viewBox="0 0 14 22" aria-hidden="true" focusable="false"><path d="M2 6Q6 11 2 16"/><path d="M7 2Q14 11 7 20"/></svg>
  <span class="talk__face" aria-hidden="true"><img src="assets/img/avatar-contact.webp" width="176" height="176" alt=""></span>
</button>

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

<dialog class="modal modal--case" id="case-dialog" aria-labelledby="case-dialog-title">
  <div class="modal__bolt" aria-hidden="true"></div>
  <div class="modal__head">
    <div>
      <p class="case-dlg__no" data-case-no></p>
      <h2 class="modal__title display" id="case-dialog-title" data-case-title></h2>
    </div>
    <button class="icon-btn modal__close" type="button" aria-label="Закрыть" data-close>${icon('close')}</button>
  </div>
  <p class="case-dlg__metric" data-case-metric></p>
  <div class="case-dlg__body" data-case-body></div>
</dialog>

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
    ${consentBox('lf')}
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
    ${consentBox('ck')}
    <div class="form__submit"><button class="btn btn--primary btn--wide" type="submit"><span class="btn__label">${esc(O.checklist.submit)}</span>${iconInline('download', 'btn__icon')}<span class="btn__arc" aria-hidden="true"></span></button></div>
    <p class="form__status" role="status" aria-live="polite"></p>
  </form>
</dialog>

${cookieBanner()}

<noscript><style>.hero__slide{position:static!important;visibility:visible!important}.faq__a{grid-template-rows:1fr!important}</style></noscript>
</body>
</html>
`;

writeFileSync(join(root, 'index.html'), ymHide(html));

/* ---------- страницы документов: privacy.html, consent.html, requisites.html ---------- */
const docBlocks = (sec) =>
  sec.blocks
    .map((b) => {
      if (b.ul) return `<ul class="doc__list">${b.ul.map((li) => `<li>${lt(li)}</li>`).join('')}</ul>`;
      if (b.table) {
        const t = b.table;
        return `<div class="doc__table" role="region" aria-label="${attr(t.head.join(', '))}" tabindex="0"><table><thead><tr>${t.head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows
          .map((r) => `<tr>${r.map((c, i) => (i ? `<td data-label="${attr(t.head[i])}">${lt(c)}</td>` : `<th scope="row">${lt(c)}</th>`)).join('')}</tr>`)
          .join('')}</tbody></table></div>`;
      }
      let p = lt(b.p).replace(/^(\d+\.\d+\.)\s/, '<span class="doc__n">$1</span> ');
      if (/^2\. /.test(sec.h)) p = p.replace(/^([^&<]{2,60}?)&nbsp;— /, '<b>$1</b>&nbsp;— ');
      return `<p>${p}</p>`;
    })
    .join('\n        ');
const secNo = (h) => h.match(/^(\d+)\./)[1];
const secName = (h) => h.replace(/^\d+\.\s*/, '');
const docSections = (key, d) =>
  d.sections
    .map(
      (s) => `<section class="doc__sec" aria-labelledby="${key}-${secNo(s.h)}">
        <h2 class="doc__h" id="${key}-${secNo(s.h)}"><span class="doc__hn">${secNo(s.h)}</span>${tp(secName(s.h))}</h2>
        ${docBlocks(s)}
      </section>`
    )
    .join('\n      ');
const docToc = (key, d) => `<nav class="doc__toc" aria-labelledby="${key}-toc">
      <p class="doc__toc-t" id="${key}-toc">${esc(LU.contents)}</p>
      <ol>${d.sections.map((s) => `<li><a href="#${key}-${secNo(s.h)}"><span>${secNo(s.h)}</span>${tp(secName(s.h))}</a></li>`).join('')}</ol>
    </nav>`;
const docNav = (cur) =>
  `<nav class="doc-tabs" aria-label="${attr(LU.docs)}"><ul>${['privacy', 'consent', 'requisites']
    .map((k) => `<li><a href="${DOC[k]}"${k === cur ? ' aria-current="page"' : ''}>${esc(L[k].nav)}</a></li>`)
    .join('')}</ul></nav>`;
const docPage = (key, { title, sub, rev, toc = '', body }) => `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)} — КБ-13</title>
<meta name="description" content="${attr(`${title} — ${OP.short}, сайт креативного бюро КБ-13`)}">
<meta name="theme-color" content="#F5F4F0">${siteHost ? `\n<link rel="canonical" href="${attr(LG.site_url.replace(/\/$/, '') + '/' + DOC[key])}">` : ''}
<link rel="icon" href="assets/brand/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="assets/css/fonts.css?v=${VERSION}">
<link rel="stylesheet" href="assets/css/main.css?v=${VERSION}">
<script>document.documentElement.className='js';</script>
<script type="application/json" id="kb-config">${JSON.stringify({ analytics: CFG.analytics }).replace(/</g, '\\u003c')}</script>
<script src="assets/js/doc-site.js?v=${VERSION}" defer></script>
</head>
<body class="doc-page">
${sprite()}
<a class="skip-link" href="#${key}-text">Перейти к тексту</a>
<!--docpage:${key}-->
<header class="doc-top">
  <div class="wrap doc-top__row">
    <a class="doc-top__logo" href="index.html" aria-label="КБ-13 — на главную">${logo()}</a>
    ${docNav(key)}
    <a class="doc-top__back" href="index.html">${icon('arrow-left')}<span>${esc(LU.back)}</span></a>
  </div>
</header>
<main class="doc doc--${key}" id="${key}-text">
  <div class="wrap doc__grid">
    <header class="doc__head">
      <p class="doc__eyebrow">${esc(LU.docs)} КБ-13</p>
      <h1 class="display doc__title">${tp(title)}</h1>
      ${sub ? `<p class="doc__sub">${tp(sub)}</p>` : ''}
      <p class="doc__rev">${rev}</p>
      <svg class="doc__bolt" viewBox="0 0 2000 1278.16" aria-hidden="true" focusable="false"><use href="#kb-bolt"/></svg>
    </header>
    ${toc}
    <div class="doc__body">
      ${body}
    </div>
  </div>
</main>
${footer('index.html')}
<!--/docpage:${key}-->
${cookieBanner()}
</body>
</html>
`;
const revLine = `${esc(LU.revision)} ${esc(LG.revision)}`;
writeFileSync(
  join(root, DOC.privacy),
  docPage('privacy', { title: L.privacy.title, sub: L.privacy.subtitle, rev: revLine, toc: docToc('privacy', L.privacy), body: docSections('privacy', L.privacy) })
);
writeFileSync(
  join(root, DOC.consent),
  docPage('consent', {
    title: L.consent.title,
    sub: L.consent.subtitle,
    rev: revLine,
    body: `${L.consent.intro.map((p) => `<p class="doc__lead">${lt(p)}</p>`).join('')}
      ${docSections('consent', L.consent)}`,
  })
);
const reqRows = [
  ['Исполнитель', OP.full],
  ['ИНН', OP.inn],
  ['ОГРНИП', OP.ogrnip],
  ['Адрес регистрации', OP.legal_address],
  ['Почтовый адрес', OP.postal_address],
  ['Расчётный счёт', OP.bank.account],
  ['Банк', OP.bank.name],
  ['Корреспондентский счёт', OP.bank.corr],
  ['БИК', OP.bank.bik],
  ...CFG.contacts.phones.map((p) => ['Телефон', p]),
  ...CFG.contacts.emails.map((e) => ['E-mail', e]),
  ...(LG.pd_email ? [['E-mail по вопросам персональных данных', LG.pd_email]] : []),
];
writeFileSync(
  join(root, DOC.requisites),
  docPage('requisites', {
    title: L.requisites.title,
    sub: L.requisites.subtitle,
    rev: `Данные актуальны на ${esc(LG.revision)}`,
    body: `<dl class="req">
        ${reqRows.map(([k, v]) => `<div class="req__row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('\n        ')}
      </dl>
      <div class="req__actions">
        <button class="btn btn--primary" type="button" data-copy="${attr(reqRows.map(([k, v]) => `${k}: ${v}`).join('\n'))}" data-copied="${attr(L.requisites.copied)}"><span class="btn__label">${esc(L.requisites.copy)}</span>${iconInline('copy', 'btn__icon')}<span class="btn__arc" aria-hidden="true"></span></button>
      </div>
      <p class="doc__note">${esc(OP.short)}&nbsp;— также оператор персональных данных посетителей сайта. Как мы обращаемся с&nbsp;данными, описано в&nbsp;<a href="${DOC.privacy}">Политике обработки персональных данных</a>.</p>`,
  })
);
// шрифты встроены в fonts.css: с диска (file://) Chrome не отдаёт woff2 по url(), и заголовки ломались бы
const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const CYR = 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116';
const FONTS = [
  ['KB Display', 'sofia-sans-xcond-cyrillic', '700 1000', CYR],
  ['KB Display', 'sofia-sans-xcond-latin', '700 1000', LATIN],
  ['Manrope', 'manrope-cyrillic', '400 800', CYR],
  ['Manrope', 'manrope-latin', '400 800', LATIN],
];
writeFileSync(
  join(root, 'assets/css/fonts.css'),
  '/* КБ-13 · шрифты (OFL), встроены — генерирует scripts/build.mjs из assets/fonts */\n' +
    FONTS.map(
      ([family, file, weight, range]) =>
        `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${readFileSync(join(root, 'assets/fonts', file + '.woff2')).toString('base64')}) format('woff2');font-weight:${weight};font-display:swap;unicode-range:${range}}`
    ).join('\n') +
    '\n'
);
// скрипты одним классическим файлом: страница работает и с диска (file://), без сервера и интернета
writeFileSync(join(root, 'assets/js/site.js'), bundle(join(root, 'assets/js/main.js')));
writeFileSync(join(root, 'assets/js/doc-site.js'), bundle(join(root, 'assets/js/doc-main.js')));
console.log(`index.html: ${(html.length / 1024).toFixed(1)} KB`);
