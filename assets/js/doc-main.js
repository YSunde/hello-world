/*
 * КБ-13 · страницы документов (политика, согласие, реквизиты): cookie-баннер и копирование реквизитов.
 */
import { initCookies } from './cookies.js';

const CFG = JSON.parse(document.getElementById('kb-config')?.textContent || '{}');
initCookies(CFG);

document.querySelectorAll('[data-copy]').forEach((b) =>
  b.addEventListener('click', async () => {
    const span = b.querySelector('span');
    const was = span.textContent;
    try {
      await navigator.clipboard.writeText(b.dataset.copy);
      span.textContent = b.dataset.copied || 'Скопировано';
    } catch {
      span.textContent = 'Не удалось скопировать';
    }
    setTimeout(() => (span.textContent = was), 2400);
  })
);
document.querySelectorAll('[data-print]').forEach((b) => b.addEventListener('click', () => print()));
