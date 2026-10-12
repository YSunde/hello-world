/*
 * КБ-13 · документы внутри одного файла (сборка в готовое/): ссылка #doc-privacy, #doc-consent,
 * #doc-requisites или на пункт документа показывает его вместо страницы; «назад» возвращает
 * страницу на то же место. На сайте документы — отдельные страницы, там этого блока нет.
 */
export function initDocViews() {
  const views = Array.from(document.querySelectorAll('.docview'));
  if (!views.length) return;
  const root = document.documentElement;
  const baseTitle = document.title;
  let open = null;
  let back = 0;
  const jump = (y) => {
    try {
      scrollTo({ top: y, behavior: 'instant' });
    } catch {
      scrollTo(0, y);
    }
  };
  const route = () => {
    let id = '';
    try {
      id = decodeURIComponent(location.hash.slice(1));
    } catch {}
    const el = id ? document.getElementById(id) : null;
    const view = el?.closest('.docview') || null;
    if (view) {
      // переход внутри открытого документа (содержание) браузер листает сам
      if (view === open && el !== view) return;
      if (!open) back = scrollY;
      views.forEach((v) => (v.hidden = v !== view));
      open = view;
      root.classList.add('doc-open');
      document.title = view.dataset.title || baseTitle;
      if (el === view) jump(0);
      else el.scrollIntoView({ block: 'start', behavior: 'instant' });
    } else if (open) {
      views.forEach((v) => (v.hidden = true));
      open = null;
      root.classList.remove('doc-open');
      document.title = baseTitle;
      if (el) el.scrollIntoView({ block: 'start' });
      else jump(back);
    }
  };
  addEventListener('hashchange', route);
  route();
}
