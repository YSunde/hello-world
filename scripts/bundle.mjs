/*
 * КБ-13 · сборка скриптов в один классический файл — без интернета и без зависимостей.
 * ES-модули браузер не грузит со страницы, открытой с диска (file://), поэтому сайт
 * подключает уже собранный assets/js/site.js. Понимает то, что есть в assets/js:
 *   import { a, b as c } from './x.js';
 *   export function / class / const / let; export { a, b as c };
 *   node scripts/bundle.mjs            → пишет assets/js/site.js (главная) и doc-site.js (документы)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const IMPORT = /^import\s*\{([^}]*)\}\s*from\s*['"](\.{1,2}\/[^'"]+)['"];?[ \t]*$/gm;
const BARE_IMPORT = /^import\s/m;
const EXPORT_DECL = /^export\s+(?=(?:async\s+)?function\b|class\b|const\b|let\b|var\b)/gm;
const EXPORT_LIST = /^export\s*\{([^}]*)\};?[ \t]*$/gm;
const DECL_NAME = /^export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;

const names = (list) =>
  list
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [from, as] = s.split(/\s+as\s+/);
      return { from: from.trim(), as: (as || from).trim() };
    });

export function bundle(entry) {
  const mods = new Map(); // путь → { id, code, deps }
  const order = [];
  const visit = (file, stack = []) => {
    if (mods.has(file)) return mods.get(file);
    if (stack.includes(file)) throw new Error('циклический импорт: ' + [...stack, file].map((f) => basename(f)).join(' → '));
    const src = readFileSync(file, 'utf8');
    const mod = { id: '__kb_' + basename(file, '.js').replace(/\W/g, '_') + '_' + mods.size, file, deps: [] };
    mods.set(file, mod);
    let code = src.replace(IMPORT, (_, list, spec) => {
      const dep = visit(resolve(dirname(file), spec), [...stack, file]);
      const parts = names(list).map((n) => (n.from === n.as ? n.from : `${n.from}: ${n.as}`));
      return `const { ${parts.join(', ')} } = ${dep.id};`;
    });
    if (BARE_IMPORT.test(code)) throw new Error(`${relative(process.cwd(), file)}: неподдерживаемый import`);
    const exported = [];
    for (const m of code.matchAll(DECL_NAME)) exported.push({ from: m[1], as: m[1] });
    code = code.replace(EXPORT_LIST, (_, list) => {
      exported.push(...names(list));
      return '';
    });
    code = code.replace(EXPORT_DECL, '');
    if (/^export\b/m.test(code)) throw new Error(`${relative(process.cwd(), file)}: неподдерживаемый export`);
    mod.code = code;
    mod.exported = exported;
    order.push(mod);
    return mod;
  };
  visit(resolve(entry));
  const out = order.map((m) => {
    const ret = m.exported.map((n) => (n.from === n.as ? n.from : `${n.as}: ${n.from}`)).join(', ');
    const body = `'use strict';\n${m.code.trim()}\n`;
    const isEntry = m === order[order.length - 1];
    return isEntry ? `(() => {\n${body}})();` : `const ${m.id} = (() => {\n${body}return { ${ret} };\n})();`;
  });
  return `/* КБ-13 · собрано scripts/bundle.mjs из assets/js/*.js — не править вручную */\n(() => {\n${out.join('\n\n')}\n})();\n`;
}

// запуск напрямую: node scripts/bundle.mjs
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  for (const [entry, out] of [['main.js', 'site.js'], ['doc-main.js', 'doc-site.js']]) {
    const js = bundle(join(root, 'assets/js', entry));
    writeFileSync(join(root, 'assets/js', out), js);
    console.log(`assets/js/${out}: ${(Buffer.byteLength(js) / 1024).toFixed(1)} KB`);
  }
}
