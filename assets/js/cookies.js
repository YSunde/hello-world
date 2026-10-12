/*
 * КБ-13 · cookie-баннер и счётчики по согласию (Политика, раздел 8).
 * Необходимое — только запоминание выбора (localStorage). Яндекс Метрика с Вебвизором
 * («аналитические») и VK Pixel («маркетинговые») подключаются лишь после согласия
 * и только если их номер задан в site.config.json → analytics.
 */
const KEY = 'kb13-cookie-consent';
const VER = 1;
const TRACK_COOKIES = /^(_ym|yabs|yandexuid|_tmr|tmr_)/;

const load = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && v.v === VER ? v : null;
  } catch {
    return null;
  }
};
const save = (v) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {}
};
const addScript = (src, id) => {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  if (id) s.id = id;
  document.head.appendChild(s);
};
const dropTrackers = () => {
  const host = location.hostname;
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0].trim();
    if (!TRACK_COOKIES.test(name)) return;
    for (const d of ['', host, '.' + host, '.' + host.split('.').slice(-2).join('.')])
      document.cookie = `${name}=; Max-Age=0; path=/${d ? '; domain=' + d : ''}`;
  });
};

let loaded = { analytics: false, marketing: false };
let ids = {};

function apply(c) {
  if (c?.analytics && ids.ym && !loaded.analytics) {
    loaded.analytics = true;
    const ym = (window.ym = window.ym || function () { (ym.a = ym.a || []).push(arguments); });
    ym.l = Date.now();
    addScript('https://mc.yandex.ru/metrika/tag.js');
    ym(ids.ym, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true });
  }
  if (c?.marketing && ids.vk && !loaded.marketing) {
    loaded.marketing = true;
    (window._tmr = window._tmr || []).push({ id: String(ids.vk), type: 'pageView', start: Date.now() });
    addScript('https://top-fwz1.mail.ru/js/code.js', 'tmr-code');
  }
}

/* цель без персональных данных: только тип формы */
export function goal(name) {
  try {
    if (loaded.analytics) window.ym?.(ids.ym, 'reachGoal', name);
    if (loaded.marketing) window._tmr?.push({ type: 'reachGoal', id: String(ids.vk), goal: name });
  } catch {}
}

export function initCookies(cfg = {}) {
  ids = { ym: cfg.analytics?.yandex_metrika_id, vk: cfg.analytics?.vk_pixel_id };
  const box = document.getElementById('cookie-banner');
  let choice = load();
  apply(choice);
  if (!box) return;
  const prefs = box.querySelector('[data-cookie-prefs]');
  const custom = box.querySelector('[data-cookie="custom"]');
  const saveBtn = box.querySelector('[data-cookie="save"]');
  const status = box.querySelector('[data-cookie-status]');
  let opener = null;

  const fill = () => {
    prefs.querySelector('[name="analytics"]').checked = !!choice?.analytics;
    prefs.querySelector('[name="marketing"]').checked = !!choice?.marketing;
  };
  const expand = (on) => {
    prefs.hidden = !on;
    saveBtn.hidden = !on;
    custom.hidden = on;
    custom.setAttribute('aria-expanded', String(on));
  };
  const show = (withPrefs) => {
    fill();
    expand(withPrefs);
    if (status) status.textContent = '';
    box.hidden = false;
    requestAnimationFrame(() => box.classList.add('is-in'));
  };
  const hide = () => {
    box.classList.remove('is-in');
    box.hidden = true;
    opener?.focus?.();
    opener = null;
  };
  const decide = (analytics, marketing) => {
    const was = choice;
    choice = { v: VER, analytics, marketing, at: new Date().toISOString() };
    save(choice);
    if (status) status.textContent = box.dataset.saved || '';
    // отозвали согласие на уже запущенный счётчик — убираем его cookie и перезагружаем без него
    if ((was?.analytics && !analytics && loaded.analytics) || (was?.marketing && !marketing && loaded.marketing)) {
      dropTrackers();
      location.reload();
      return;
    }
    if (!analytics || !marketing) dropTrackers();
    apply(choice);
    hide();
  };

  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cookie]');
    if (!b) return;
    const act = b.dataset.cookie;
    if (act === 'all') decide(true, true);
    else if (act === 'necessary') decide(false, false);
    else if (act === 'custom') {
      expand(true);
      prefs.querySelector('[name="analytics"]').focus();
    } else if (act === 'save')
      decide(prefs.querySelector('[name="analytics"]').checked, prefs.querySelector('[name="marketing"]').checked);
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && choice) hide();
  });
  document.querySelectorAll('[data-cookie-open]').forEach((b) =>
    b.addEventListener('click', () => {
      opener = b;
      show(true);
      prefs.querySelector('[name="analytics"]').focus();
    })
  );
  if (!choice) setTimeout(() => show(false), 900);
}
