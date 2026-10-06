#!/usr/bin/env node
/*
 * Сверка index.html с content.ru.json: каждая маркетинговая строка, цена и ячейка таблицы
 * должны присутствовать на странице дословно (регистр и CSS-uppercase не учитываются).
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
add('hero', C.hero.system_line);
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
C.services.packages.forEach((p) => {
  add('пакет', p.title);
  add('пакет', p.format);
  add('пакет', `${p.days} дней`);
  add('пакет', p.text);
  add('пакет', p.download_label);
});
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
console.log(`проверено строк: ${must.length}`);
if (missing.length) {
  console.log('НЕ НАЙДЕНО:');
  missing.forEach(([l, s]) => console.log(`  [${l}] ${s}`));
  process.exit(1);
}
console.log('все строки content.ru.json на странице, цены совпадают ✔');
