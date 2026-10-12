#!/usr/bin/env node
/*
 * Сверка index.html с content.ru.json: каждая маркетинговая строка, цена и ячейка таблицы
 * должны присутствовать на странице дословно (регистр и CSS-uppercase не учитываются).
 * Плюс документы: тексты legal.ru.json на privacy.html / consent.html, реквизиты ИП,
 * обязательная галочка согласия в каждой форме.
 *   node scripts/check-content.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const C = JSON.parse(readFileSync(join(root, 'content.ru.json'), 'utf8'));
const html = readFileSync(join(root, 'index.html'), 'utf8');
const text = html
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<br\s*\/?>/g, ' ')
  .replace(/<\/?s\b[^>]*>/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ');
const norm = (s) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const hay = norm(text);

const must = [];
const add = (label, s) => s && must.push([label, s]);
C.navigation.items.forEach((n) => add('навигация', n.label));
add('навигация', C.navigation.phone_label);
add('hero', C.hero.title);
add('hero', C.hero.lead);
// hero.system_line жил на табличке; табличку убрали по просьбе заказчика (11.10) — на странице его нет
add('hero', C.hero.cta);
C.hero.topics.forEach((t) => add('hero', t));
C.hero.slides.slice(1).forEach((s) => (add('слайд', s.title), add('слайд', s.text), add('слайд', s.support)));
add('о нас', C.about.title);
C.about.paragraphs.forEach((p) => add('о нас', p));
add('о нас', C.about.cta);
add('вопросы', C.questions.title);
C.questions.items.forEach((q) => (add('вопрос', q.question), add('ответ', q.answer)));
add('вопросы', C.questions.cta);
add('услуги', C.services.title);
add('услуги', C.services.intro);
(C.services.intro_words || []).forEach((w) => add('услуги', w));
C.services.packages.forEach((p) => {
  add('пакет', p.title);
  add('пакет', p.format);
  add('пакет', `${p.days} дней`);
  add('пакет', p.text);
  add('пакет', p.download_label);
});
// мини-бриф и кейсы (12.10)
if (C.quiz) {
  ['eyebrow', 'title', 'lead', 'result_title', 'result_link', 'contact_title', 'submit', 'back', 'next', 'restart'].forEach((k) => add('бриф', C.quiz[k]));
  C.quiz.steps.forEach((st) => (add('бриф', st.question), st.options.forEach((o) => add('бриф', o))));
}
if (C.cases) {
  ['title', 'lead', 'read', 'stamp'].forEach((k) => add('кейсы', C.cases[k]));
  C.cases.items.forEach((c) => {
    ['tag', 'title', 'metric', 'metric_caption', 'quote'].forEach((k) => add('кейс', c[k]));
    [...c.text, ...(c.after || [])].forEach((t) => add('кейс', t));
  });
}
add('таблица', C.comparison.title);
C.comparison.columns.forEach((c) => add('таблица', c));
C.comparison.rows.flat().forEach((c) => add('таблица', c));
add('таблица', C.comparison.download_label);
add('таблица', C.comparison.chat_label);
add('контакты', C.contact.title);
Object.values(C.contact.labels).forEach((l) => add('контакты', l));
add('окно', C.overlays.lead.title);
C.overlays.lead.labels.forEach((l) => add('окно', l));
add('окно', C.overlays.lead.submit);
add('окно', C.overlays.checklist.title);
add('окно', C.overlays.checklist.description);
add('окно', C.overlays.checklist.email_label);
add('окно', C.overlays.checklist.submit);
add('чат', C.overlays.chat.title);

const missing = must.filter(([, s]) => !hay.includes(norm(s)));
// цены из пакетов — в формате таблицы
const prices = C.comparison.rows.find((r) => r[0] === 'Цена пакета').slice(1);
// цены — только в сводной таблице (из карточек пакетов убраны по просьбе заказчика)
C.services.packages.forEach((p, i) => {
  const n = Number(prices[i].replace(/\D/g, ''));
  if (n !== p.price_rub) missing.push(['цена', `${p.title}: ${p.price_rub} ≠ ${prices[i]}`]);
});
// юридические документы (legal.ru.json) — на своих страницах дословно; реквизиты ИП — в подвале;
// в каждой форме — обязательная, не отмеченная заранее галочка согласия
const L = JSON.parse(readFileSync(join(root, 'legal.ru.json'), 'utf8'));
const OP = JSON.parse(readFileSync(join(root, 'site.config.json'), 'utf8')).legal.operator;
const plain = (h) => norm(h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
let legalN = 0;
for (const k of ['privacy', 'consent']) {
  const page = plain(readFileSync(join(root, L[k].file), 'utf8'));
  const texts = [L[k].title, L[k].subtitle, ...L[k].intro];
  L[k].sections.forEach((sec) => {
    texts.push(sec.h.replace(/^\d+\.\s*/, ''));
    sec.blocks.forEach((b) => texts.push(...(b.p ? [b.p] : b.ul ? b.ul : [...b.table.head, ...b.table.rows.flat()])));
  });
  texts.forEach((t) =>
    t.split(/\{\{\w+\}\}/).map((x) => x.trim()).filter((x) => x.length > 2).forEach((frag) => {
      legalN++;
      if (!page.includes(norm(frag))) missing.push([L[k].file, frag]);
    })
  );
  if (/\{\{|\[(добав|дата|e-mail|ссылка)/i.test(page)) missing.push([L[k].file, 'осталась заглушка']);
}
const req = plain(readFileSync(join(root, L.requisites.file), 'utf8'));
[OP.full, OP.inn, OP.ogrnip, OP.legal_address, OP.bank.account, OP.bank.name, OP.bank.corr, OP.bank.bik].forEach((v) => (legalN++, !req.includes(norm(v)) && missing.push([L.requisites.file, v])));
[OP.short, OP.inn, OP.ogrnip, 'Политика обработки персональных данных', 'Согласие на обработку персональных данных', 'Реквизиты'].forEach((v) => (legalN++, !hay.includes(norm(v)) && missing.push(['подвал', v])));
for (const f of html.match(/<form\b[^>]*data-form="[^"]+"[\s\S]*?<\/form>/g) || []) {
  const kind = f.match(/data-form="([^"]+)"/)[1];
  const box = f.match(/<input[^>]*name="pd_consent"[^>]*>/)?.[0] || '';
  legalN++;
  if (!/\brequired\b/.test(box) || /\bchecked\b/.test(box) || !/href="consent\.html"/.test(f)) missing.push(['форма ' + kind, 'нет обязательной галочки согласия со ссылкой']);
}
console.log(`документы и согласия: ${legalN} проверок`);
console.log(`проверено строк: ${must.length}`);
if (missing.length) {
  console.log('НЕ НАЙДЕНО:');
  missing.forEach(([l, s]) => console.log(`  [${l}] ${s}`));
  process.exit(1);
}
console.log('все строки content.ru.json на странице, цены совпадают ✔');
