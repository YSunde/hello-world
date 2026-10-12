/*
 * КБ-13 · микроразметка для поисковиков и генеративных систем (SEO / GEO).
 * Всё — из тех же данных, что и страница: content.ru.json, legal.ru.json, site.config.json.
 * Ничего не придумывается: нет телефона — нет telephone, нет домена — ссылки относительные
 * (и нет canonical / sitemap.xml, им нужен абсолютный адрес).
 *   JSON-LD (schema.org): Organization + WebSite + WebPage, Service ×3 с ценой и сроком,
 *   FAQPage («За и против»), ItemList кейсов, VideoObject; на документах — WebPage/AboutPage
 *   и BreadcrumbList. Плюс Open Graph / Twitter, robots.txt, sitemap.xml, llms.txt.
 */
const strip = (s) => String(s).replace(/\s+/g, ' ').trim();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const isoDate = (ru) => {
  const m = String(ru || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
};
// пустые поля не попадают в разметку
const clean = (o) => {
  if (Array.isArray(o)) return o.map(clean).filter((v) => v !== undefined);
  if (o && typeof o === 'object') {
    const r = {};
    for (const [k, v] of Object.entries(o)) {
      const c = clean(v);
      if (c === undefined || c === null || c === '' || (Array.isArray(c) && !c.length)) continue;
      r[k] = c;
    }
    return Object.keys(r).length ? r : undefined;
  }
  return o;
};

export function createSeo({ C, CFG, L }) {
  const SITE = CFG.site_url ? CFG.site_url.replace(/\/?$/, '/') : '';
  const abs = (p = '') => (SITE ? new URL(p, SITE).href : './' + p);
  const OP = CFG.legal.operator;
  const ID = {
    org: abs('#organization'),
    site: abs('#website'),
    page: abs('#webpage'),
  };
  const name = 'КБ-13';
  const desc = strip(`${C.about.paragraphs[0]} ${C.hero.lead}`);
  const ogImage = abs('assets/brand/og.jpg');
  const pkgName = (p) => p.title.replace(/^Пакет \d+\s*/, '');

  const org = clean({
    '@type': 'Organization',
    '@id': ID.org,
    name,
    alternateName: ['КБ13', 'КБ 13', 'Креативное бюро КБ-13'],
    description: desc,
    url: abs(''),
    logo: { '@type': 'ImageObject', url: abs('assets/brand/logo.svg') },
    image: ogImage,
    slogan: strip(C.hero.slides?.[1]?.title || ''),
    knowsAbout: [...C.hero.topics, 'маркетинг в социальных сетях', ...C.services.packages.map((p) => p.format)],
    legalName: OP.full,
    taxID: OP.inn,
    identifier: [
      { '@type': 'PropertyValue', propertyID: 'ИНН', value: OP.inn },
      { '@type': 'PropertyValue', propertyID: 'ОГРНИП', value: OP.ogrnip },
    ],
    // адрес — без улицы и квартиры: это адрес регистрации ИП, а не офис для визитов
    address: (() => {
      const m = OP.legal_address.match(/^(\d{6}),\s*([^,]+),\s*([^,]+),\s*([^,]+)/);
      return m
        ? { '@type': 'PostalAddress', postalCode: m[1], addressRegion: m[2].replace(/обл\.$/, 'область'), addressLocality: `${m[4]}, ${m[3]}`, addressCountry: 'RU' }
        : undefined;
    })(),
    email: CFG.contacts.emails[0],
    telephone: CFG.contacts.phones[0] || CFG.phone || undefined,
    sameAs: CFG.contacts.socials.map((s) => s.url),
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: C.services.title,
      itemListElement: C.services.packages.map((p) => ({ '@type': 'Offer', itemOffered: { '@id': abs(`#service-${p.id}`) } })),
    },
  });

  // на документах услуг в графе нет — организация без каталога, чтобы не было ссылок в пустоту
  const { hasOfferCatalog, ...orgDoc } = org;
  const services = C.services.packages.map((p) =>
    clean({
      '@type': 'Service',
      '@id': abs(`#service-${p.id}`),
      name: pkgName(p),
      alternateName: p.title,
      serviceType: p.format,
      description: strip(`${p.format}, срок — ${p.days} дней. ${p.text}`),
      provider: { '@id': ID.org },
      url: abs(`#pkg-${p.id}`),
      image: abs(`assets/img/${p.id === 'consultation' ? '02-plane' : p.id === 'mentorship' ? '03-mentorship-chair' : '05-partnership-system'}.webp`),
      offers: {
        '@type': 'Offer',
        price: String(p.price_rub),
        priceCurrency: 'RUB',
        description: `Срок: ${p.days} дней`,
        url: abs(`#pkg-${p.id}`),
        seller: { '@id': ID.org },
      },
    })
  );

  const faq = clean({
    '@type': 'FAQPage',
    '@id': abs('#faq'),
    name: C.questions.title,
    isPartOf: { '@id': ID.page },
    mainEntity: C.questions.items.map((q) => ({
      '@type': 'Question',
      name: strip(q.question),
      acceptedAnswer: { '@type': 'Answer', text: strip(q.answer) },
    })),
  });

  const cases = clean({
    '@type': 'ItemList',
    '@id': abs('#cases'),
    name: C.cases.title,
    description: C.cases.lead,
    itemListElement: C.cases.items.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'CreativeWork',
        name: c.title,
        about: c.tag,
        abstract: strip(`${c.metric} ${c.metric_caption}`),
        text: strip([...(c.text || []), c.quote ? `«${c.quote}»` : '', ...(c.after || [])].join(' ')),
        creator: { '@id': ID.org },
        url: abs('#cases'),
      },
    })),
  });

  const V = CFG.video || {};
  const video =
    V.url && V.upload_date
      ? clean({
          '@type': 'VideoObject',
          '@id': abs('#video'),
          name: V.title,
          description: strip(V.description || `${V.title}. ${C.about.paragraphs[0]}`),
          thumbnailUrl: abs(V.poster),
          contentUrl: abs(V.url),
          uploadDate: V.upload_date,
          duration: V.duration,
          inLanguage: 'ru-RU',
          publisher: { '@id': ID.org },
        })
      : undefined;

  const website = clean({
    '@type': 'WebSite',
    '@id': ID.site,
    url: abs(''),
    name,
    alternateName: 'КБ13',
    description: desc,
    inLanguage: 'ru-RU',
    publisher: { '@id': ID.org },
  });

  const ld = (graph) =>
    `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph.filter(Boolean) }).replace(/</g, '\\u003c')}</script>`;

  const meta = ({ title, description, path = '', type = 'website' }) => {
    const url = SITE ? abs(path) : '';
    return [
      `<meta name="robots" content="index, follow, max-image-preview:large">`,
      url && `<link rel="canonical" href="${url}">`,
      `<meta property="og:type" content="${type}">`,
      `<meta property="og:locale" content="ru_RU">`,
      `<meta property="og:site_name" content="${name}">`,
      `<meta property="og:title" content="${title}">`,
      `<meta property="og:description" content="${description}">`,
      url && `<meta property="og:url" content="${url}">`,
      `<meta property="og:image" content="${ogImage}">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta property="og:image:alt" content="${name} — креативное бюро">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:title" content="${title}">`,
      `<meta name="twitter:description" content="${description}">`,
      `<meta name="twitter:image" content="${ogImage}">`,
    ]
      .filter(Boolean)
      .join('\n');
  };

  /* главная */
  const indexHead = ({ title, description, esc }) =>
    meta({ title: esc(title), description: esc(description) }) +
    '\n' +
    ld([
      org,
      website,
      clean({
        '@type': 'WebPage',
        '@id': ID.page,
        url: abs(''),
        name: title,
        description,
        inLanguage: 'ru-RU',
        isPartOf: { '@id': ID.site },
        about: { '@id': ID.org },
        primaryImageOfPage: { '@type': 'ImageObject', url: ogImage, width: 1200, height: 630 },
        hasPart: [{ '@id': abs('#faq') }, { '@id': abs('#cases') }, ...(video ? [{ '@id': abs('#video') }] : [])],
        mainEntity: { '@id': ID.org },
      }),
      ...services,
      faq,
      cases,
      video,
    ]);

  /* документы */
  const docHead = ({ key, file, title, description, esc }) => {
    const pageId = abs(`${file}#webpage`);
    return (
      meta({ title: esc(`${title} — ${name}`), description: esc(description), path: file, type: 'article' }) +
      '\n' +
      ld([
        orgDoc,
        website,
        clean({
          '@type': key === 'requisites' ? 'AboutPage' : 'WebPage',
          '@id': pageId,
          url: abs(file),
          name: title,
          description,
          inLanguage: 'ru-RU',
          isPartOf: { '@id': ID.site },
          about: { '@id': ID.org },
          mainEntity: key === 'requisites' ? { '@id': ID.org } : undefined,
          dateModified: isoDate(CFG.legal.revision),
          breadcrumb: { '@id': abs(`${file}#breadcrumb`) },
        }),
        {
          '@type': 'BreadcrumbList',
          '@id': abs(`${file}#breadcrumb`),
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Главная', item: abs('') },
            { '@type': 'ListItem', position: 2, name: title, item: abs(file) },
          ],
        },
      ])
    );
  };

  /* robots.txt, sitemap.xml (только с доменом), llms.txt */
  const files = ({ pages }) => {
    const out = {};
    out['robots.txt'] =
      ['# КБ-13 — индексировать можно всё, в том числе ИИ-поиску', 'User-agent: *', 'Allow: /', SITE ? `\nSitemap: ${abs('sitemap.xml')}` : '']
        .filter((x) => x !== '')
        .join('\n') + '\n';
    if (SITE) {
      const today = isoDate(CFG.legal.revision);
      out['sitemap.xml'] =
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        pages.map((p) => `  <url><loc>${abs(p)}</loc>${today ? `<lastmod>${today}</lastmod>` : ''}</url>`).join('\n') +
        `\n</urlset>\n`;
    }
    const P = C.services.packages;
    const T = C.comparison;
    const lines = [
      `# ${name} — креативное бюро`,
      '',
      `> ${strip(C.hero.lead)} ${strip(C.about.paragraphs.join(' '))}`,
      '',
      `Направления: ${C.hero.topics.join(', ')}.`,
      `Исполнитель: ${OP.full}, ИНН ${OP.inn}, ОГРНИП ${OP.ogrnip}.`,
      CFG.contacts.phones.length ? `Телефон: ${CFG.contacts.phones.join(', ')}.` : '',
      CFG.contacts.emails.length ? `E-mail: ${CFG.contacts.emails.join(', ')}.` : '',
      '',
      `## ${cap(C.services.title)}`,
      '',
      strip(C.services.intro),
      '',
      ...P.map((p) => `- **${pkgName(p)}** (пакет ${p.number}) — формат: ${p.format.toLowerCase()}, срок: ${p.days} дней, цена: ${p.price_rub.toLocaleString('ru-RU').replace(/\u00a0/g, ' ')} руб. ${strip(p.text)}`),
      '',
      `## ${cap(T.title)}`,
      '',
      `| ${T.columns.join(' | ')} |`,
      `| ${T.columns.map(() => '---').join(' | ')} |`,
      ...T.rows.map((r) => `| ${r.join(' | ')} |`),
      '',
      `## ${cap(C.cases.title)}`,
      '',
      ...C.cases.items.map((c) => `- **${c.title}** (${c.tag}): ${c.metric} ${c.metric_caption}. ${strip([...(c.text || []), c.quote ? `«${c.quote}»` : ''].join(' '))}`),
      '',
      `## ${cap(C.questions.title)}`,
      '',
      ...C.questions.items.map((q) => `- **${strip(q.question)}** — ${strip(q.answer)}`),
      '',
      '## Документы',
      '',
      `- [${L.privacy.title}](${abs(L.privacy.file)})`,
      `- [${L.consent.title}](${abs(L.consent.file)})`,
      `- [Реквизиты](${abs(L.requisites.file)})`,
      '',
    ];
    out['llms.txt'] = lines.filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n');
    return out;
  };

  return { SITE, abs, indexHead, docHead, files };
}
