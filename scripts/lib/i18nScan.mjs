/**
 * The i18n ratchets: what is still hard-coded, counted file by file.
 *
 * Five rules, one number per file each. `src/i18n/i18nRatchet.test.mjs` fails
 * when a number goes UP against `src/i18n/i18n-baseline.json`; it never fails
 * because one went down. `npm run i18n:report` prints them, and
 * `npm run i18n:tighten` (the orchestrator, between two waves) writes the
 * lower numbers back so they cannot climb again.
 *
 *   R1  French string literals outside catalogs. Every string or template
 *       literal that src/i18n/frenchDetector.js reads as French (words,
 *       elisions, accents — not number typography, which source code is full
 *       of). Not counted: catalogs (`*.i18n.js`), src/i18n itself, property
 *       keys, import specifiers, directives, arguments of `console.*`, and
 *       addresses — URLs, data URIs and asset paths, which carry words by
 *       accident.
 *   R2  Literals written straight into the interface, in any language: the
 *       right-hand side of `el.textContent = …` (and `innerHTML`, `title`,
 *       `placeholder`, `alt`, `ariaLabel`…), `setAttribute('aria-label' |
 *       'title' | 'placeholder' | 'alt', …)`, `append()`/`createTextNode()`,
 *       and the value of an object key named like a label (`label`, `title`,
 *       `blurb`, `text`, `description`, `*Label`…) — the shape every layer's
 *       rows, chips and legends take. Through `?:`, `||`, `+` and template
 *       expressions; not through function calls. A literal with no word in it
 *       (`'—'`, `'MW'`, `'<div class="x">'`), an address, or a list of CSS
 *       class tokens (`'has-glyph'`) is not counted.
 *   R3  Text in `index.html` whose element has no `data-i18n`, and `title`,
 *       `aria-label`, `placeholder`, `alt` attributes without their
 *       `data-i18n-*`. `translate="no"`, icon ligatures, `<head>` and elements
 *       that exist in one language only (`data-locale-only`) are exempt. A
 *       `<br>` does not end a run: a sentence broken over two lines is one
 *       message, as its catalog entry says.
 *   R4  French formatting pinned in code: `x.toLocaleString('fr-FR' | 'fr')`,
 *       `toLocaleDateString`, `toLocaleTimeString`, and `Intl.*('fr-FR' | 'fr')`,
 *       outside src/i18n. Case mapping (`toLocaleLowerCase('fr-FR')`) and
 *       `localeCompare(…, 'fr')` are not display formatting and not counted.
 *   R5  Messages read while a module LOADS: a catalog accessor, a formatter,
 *       `labelFor`, `getLocale`… called at module top level rather than inside
 *       a function. The target is zero, and it has no escape hatch.
 *
 * ESCAPE HATCH (R1, R2, R4 only), for DATA that happens to be French — a DVF
 * category, a CSV label joined on, a share-link token, a value persisted in a
 * pack — never for prose:
 *
 *     'Appartement', // i18n-ignore-line
 *     // i18n-ignore-next-line
 *     // i18n-ignore-start … // i18n-ignore-end
 *
 * A marker names a STATEMENT: the reason it carries may wrap onto a second
 * comment line, and the declaration it points at may wrap onto a third. It
 * never reaches into a function body — write the extent out with
 * `i18n-ignore-start`/`end` when that is what you mean.
 *
 * Parsing is `rollup/parseAst` (SWC, already installed through Vite): ~430
 * modules in about a second.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAst } from 'rollup/parseAst';
import { looksFrench } from '../../src/i18n/frenchDetector.js';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BASELINE_FILE = 'src/i18n/i18n-baseline.json';
export const INDEX_HTML = 'index.html';

/** @type {Readonly<Record<'R1'|'R2'|'R3'|'R4'|'R5', string>>} */
export const RULES = Object.freeze({
  R1: 'French literals outside catalogs',
  R2: 'UI literals (any language) outside catalogs',
  R3: 'index.html text without data-i18n',
  R4: "toLocale*('fr-FR') / Intl('fr-FR') outside src/i18n",
  R5: 'message reads at module top level',
});
export const RULE_IDS = Object.freeze(Object.keys(RULES));

// ── Which files ──────────────────────────────────────────────────────────────

/** Every source module under `src/`, repo-relative, sorted. */
export function listSourceFiles(root = REPO_ROOT) {
  const out = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'local_data' || entry.name === 'fixtures' || entry.name === 'node_modules') continue;
        visit(absolute);
      } else if (/\.m?js$/.test(entry.name) && !/\.test\.m?js$/.test(entry.name)) {
        out.push(path.relative(root, absolute).split(path.sep).join('/'));
      }
    }
  };
  visit(path.join(root, 'src'));
  return out.sort();
}

export const isCatalogFile = (file) => /\.i18n\.js$/.test(file);
export const isI18nInfrastructure = (file) => file.startsWith('src/i18n/');
/**
 * Which rules look at a file.
 *
 * The landing page (`src/vitrine/`) used to be exempt from R1, R2 and R4: it
 * was French by decision. It speaks both languages now, so it is counted like
 * every other module.
 */
export function rulesFor(file) {
  const infra = isI18nInfrastructure(file);
  return {
    R1: !infra && !isCatalogFile(file),
    R2: !infra && !isCatalogFile(file),
    R4: !infra,
    R5: true,
  };
}

// ── Escape hatch ─────────────────────────────────────────────────────────────

/** A line that carries no code: blank, or nothing but a comment. */
const COMMENT_ONLY = /^\s*(?:\/\/|\/\*|\*)/;

/** 1-based line numbers the escape-hatch comments exempt. */
export function ignoredLines(source) {
  const lines = source.split('\n');
  const ignored = new Set();
  let inBlock = false;
  lines.forEach((line, index) => {
    const n = index + 1;
    if (/i18n-ignore-start/.test(line)) inBlock = true;
    if (inBlock) ignored.add(n);
    if (/i18n-ignore-end/.test(line)) inBlock = false;
    if (/i18n-ignore-line/.test(line)) ignored.add(n);
    if (/i18n-ignore-next-line/.test(line)) {
      // The NEXT LINE OF CODE, not the next physical line: the hatch asks for
      // a reason, a reason wraps, and a two-line comment used to aim the
      // exemption at its own second line. `src/data/anfrFrance.js` spent a
      // whole wave with a French literal counted under an ignore that read as
      // if it covered it.
      let target = n + 1;
      while (target <= lines.length && COMMENT_ONLY.test(lines[target - 1])) target += 1;
      ignored.add(target);
    }
  });
  return ignored;
}

function lineIndex(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i += 1) if (source.charCodeAt(i) === 10) starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

// ── What counts as text ──────────────────────────────────────────────────────

/** Unit symbols: a literal made only of these is not interface text. */
const UNIT_TOKENS = new Set(['km', 'ha', 'mm', 'cm', 'kg', 'min', 'ms', 'px', 'MW', 'GW', 'kW', 'TW',
  'kWh', 'MWh', 'GWh', 'TWh', 'kV', 'Hz', 'kHz', 'MHz', 'GHz', 'dB', 'hPa', 'kt', 'nm', 'NM', 'ft',
  'UTC', 'MWc', 'kWc', 'Mo', 'ko', 'Go', 'MB', 'kB', 'GB', 'fps', 'rem', 'em', 'vh', 'vw', 'deg']);

/** The literal's text: a string, or a template's quasis joined by a space. */
function literalText(node) {
  if (node.type === 'Literal') return typeof node.value === 'string' ? node.value : null;
  if (node.type === 'TemplateLiteral') return node.quasis.map((q) => q.value.cooked ?? q.value.raw).join(' ');
  return null;
}

/**
 * Where something LIVES, not what it says: a URL, a data URI, a path, a hash.
 *
 * Addresses carry words by accident — `https://overpass-api.de/api/interpreter`
 * ends in the French `de`, `/landing/view-02-480-h264.1ce878e0.mp4` contains
 * `ce` — and no reader ever reads one. Nothing translates an address, so no
 * rule counts one.
 */
export const isResourceLocator = (text) => /^\s*(?:https?:|data:|mailto:|blob:|\.{0,2}\/|#[\w-]*$)/.test(text);

/**
 * CSS class tokens — `has-glyph`, `data-icon selected`.
 *
 * A layer row's markup interpolates class names into its `innerHTML`, which
 * puts them on the R2 sink beside the words. Kebab or snake case with no
 * capital and no sentence is an identifier the stylesheet reads, not copy;
 * one lowercase word on its own (`erreur`) is NOT covered, so nothing hides
 * behind this.
 */
const CSS_TOKEN = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)+$/;
export const isCssClassList = (text) => {
  const tokens = String(text).trim().split(/\s+/);
  return tokens.length > 0 && tokens.every((token) => CSS_TOKEN.test(token));
};

/** Does this literal carry a word a reader would read? */
export function hasInterfaceText(text) {
  if (typeof text !== 'string') return false;
  if (isResourceLocator(text) || isCssClassList(text)) return false;
  const visible = text.replace(/<[^>]*>/g, ' ').replace(/&[#\w]+;/g, ' ');
  const words = visible.match(/\p{L}{2,}/gu);
  if (!words) return false;
  return words.some((word) => !UNIT_TOKENS.has(word));
}

// ── The AST walk ─────────────────────────────────────────────────────────────

const UI_PROPS = new Set(['textContent', 'innerText', 'innerHTML', 'outerHTML', 'title', 'placeholder',
  'alt', 'ariaLabel', 'ariaDescription', 'ariaValueText', 'ariaRoleDescription', 'label', 'nodeValue']);
const UI_ATTRS = new Set(['aria-label', 'aria-description', 'aria-valuetext', 'aria-roledescription',
  'title', 'placeholder', 'alt', 'data-tooltip']);
const UI_KEY = /^(?:label|title|blurb|text|tooltip|hint|caption|placeholder|ariaLabel|description|message|subtitle|heading|headline|summary|detail|note|cta|empty\w*|\w+Label|\w+Title|\w+Text|\w+Hint|\w+Message|\w+Blurb)$/;
const UI_CALLS = new Set(['append', 'prepend', 'replaceChildren', 'before', 'after', 'replaceWith']);
const DIALOGS = new Set(['alert', 'confirm', 'prompt']);
const LOCALE_METHODS = new Set(['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']);
const FRENCH_TAG = /^fr(?:[-_][a-z]{2})?$/i;

const SENSITIVE_IMPORTS = [
  // [module path test, imported names that read the locale (null = all)]
  [/(?:^|\/)i18n\/format\.js$/, null],
  [/(?:^|\/)i18n\/messages\.js$/, new Set(['labelFor', 'inAllLocales'])],
  [/(?:^|\/)i18n\/locale\.js$/, new Set(['getLocale', 'localeTag'])],
  [/(?:^|\/)i18n\/serverMessages\.js$/, new Set(['serverMessage'])],
];

function propertyName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  return null;
}

/** The literals an expression puts on screen, through `?:`, `||`, `+`, templates. */
function sinkLiterals(node, out = []) {
  if (!node) return out;
  switch (node.type) {
    case 'Literal':
      if (typeof node.value === 'string') out.push(node);
      break;
    case 'TemplateLiteral':
      out.push(node);
      node.expressions.forEach((expression) => sinkLiterals(expression, out));
      break;
    case 'TaggedTemplateExpression':
      sinkLiterals(node.quasi, out);
      break;
    case 'ConditionalExpression':
      sinkLiterals(node.consequent, out);
      sinkLiterals(node.alternate, out);
      break;
    case 'LogicalExpression':
      sinkLiterals(node.left, out);
      sinkLiterals(node.right, out);
      break;
    case 'BinaryExpression':
      if (node.operator === '+') {
        sinkLiterals(node.left, out);
        sinkLiterals(node.right, out);
      }
      break;
    case 'SequenceExpression':
      sinkLiterals(node.expressions[node.expressions.length - 1], out);
      break;
    default:
      break;
  }
  return out;
}

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

/**
 * The statements an `i18n-ignore` marker reaches over when they wrap.
 *
 * A marker names a THING, and a thing written over four lines is still one
 * thing. `src/data/anfrFrance.js` spent a wave with its French elision counted
 * because the declaration the comment pointed at put its literal on the third
 * line. Only leaf statements are reached over, and only when they hold no
 * function: a marker must never swallow a body someone will write English into
 * later — that is what `i18n-ignore-start`/`end` is for, where the extent is
 * typed out and visible.
 */
const REACHABLE_STATEMENTS = new Set(['VariableDeclaration', 'ExpressionStatement',
  'ReturnStatement', 'ThrowStatement', 'Property']);

function containsFunction(node) {
  if (!node || typeof node.type !== 'string') return false;
  if (FUNCTION_TYPES.has(node.type)) return true;
  for (const key of Object.keys(node)) {
    if (key === 'start' || key === 'end' || key === 'type') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) if (containsFunction(child)) return true;
    } else if (containsFunction(value)) return true;
  }
  return false;
}

/**
 * Count R1, R2, R4 and R5 in one module.
 *
 * @param {string} source
 * @param {{file?: string, rules?: {R1?: boolean, R2?: boolean, R4?: boolean, R5?: boolean}}} [options]
 * @returns {{counts: {R1: number, R2: number, R4: number, R5: number},
 *   findings: Array<{rule: string, line: number, text: string}>}}
 */
export function scanModule(source, { file = '', rules = file ? rulesFor(file) : { R1: true, R2: true, R4: true, R5: true } } = {}) {
  const ast = parseAst(source, { allowReturnOutsideFunction: true });
  const lineOf = lineIndex(source);
  const ignored = ignoredLines(source);
  const findings = [];
  const counts = { R1: 0, R2: 0, R4: 0, R5: 0 };
  const excerpt = (text) => String(text).replace(/\s+/g, ' ').trim().slice(0, 100);
  const record = (rule, node, text) => {
    counts[rule] += 1;
    findings.push({ rule, line: lineOf(node.start), text: excerpt(text) });
  };
  const isIgnored = (node) => ignored.has(lineOf(node.start));

  // Bindings that read the locale when called (R5).
  const readers = new Set();
  const namespaces = new Map();
  for (const statement of ast.body) {
    if (statement.type !== 'ImportDeclaration') continue;
    const from = String(statement.source.value);
    if (/\.i18n\.js$/.test(from)) {
      for (const spec of statement.specifiers) {
        if (spec.type === 'ImportNamespaceSpecifier') namespaces.set(spec.local.name, null);
        else readers.add(spec.local.name);
      }
      continue;
    }
    const match = SENSITIVE_IMPORTS.find(([test]) => test.test(from));
    if (!match) continue;
    const [, names] = match;
    for (const spec of statement.specifiers) {
      if (spec.type === 'ImportNamespaceSpecifier') namespaces.set(spec.local.name, names);
      else if (!names || names.has(spec.imported?.name ?? spec.imported?.value)) readers.add(spec.local.name);
    }
  }
  const readsLocale = (callee) => {
    if (callee?.type === 'Identifier') return readers.has(callee.name);
    if (callee?.type === 'MemberExpression' && callee.object?.type === 'Identifier'
      && namespaces.has(callee.object.name)) {
      const names = namespaces.get(callee.object.name);
      return !names || names.has(propertyName(callee.property));
    }
    return false;
  };

  // Literal nodes that are not text (keys, specifiers, directives, console).
  const notText = new Set();
  // Literal nodes on screen (R2), by identity.
  const onScreen = new Set();
  const markSink = (expression) => {
    for (const literal of sinkLiterals(expression)) onScreen.add(literal);
  };

  const visit = (node, depth, parent) => {
    if (!node || typeof node.type !== 'string') return;
    // A marked statement covers the lines it wraps onto. Done on the way IN,
    // so every literal underneath reads the widened set.
    if (REACHABLE_STATEMENTS.has(node.type)) {
      const from = lineOf(node.start);
      const to = lineOf(node.end);
      if (to > from && ignored.has(from) && !containsFunction(node)) {
        for (let line = from + 1; line <= to; line += 1) ignored.add(line);
      }
    }
    let childDepth = depth;
    switch (node.type) {
      case 'ImportDeclaration':
      case 'ExportAllDeclaration':
        notText.add(node.source);
        if (node.attributes) node.attributes.forEach((attribute) => { notText.add(attribute.key); notText.add(attribute.value); });
        break;
      case 'ExportNamedDeclaration':
        if (node.source) notText.add(node.source);
        break;
      case 'ImportExpression':
        notText.add(node.source);
        break;
      case 'ExpressionStatement':
        if (node.directive) notText.add(node.expression);
        break;
      case 'Property':
        if (!node.computed) notText.add(node.key);
        if (!node.shorthand && !node.method && node.kind === 'init' && UI_KEY.test(propertyName(node.key) || '')) {
          markSink(node.value);
        }
        break;
      case 'MethodDefinition':
      case 'PropertyDefinition':
        if (!node.computed) notText.add(node.key);
        if (node.type === 'PropertyDefinition' && !node.static) childDepth = depth + 1;
        break;
      case 'AssignmentExpression':
        if (node.left?.type === 'MemberExpression' && !node.left.computed
          && UI_PROPS.has(propertyName(node.left.property))) {
          markSink(node.right);
        }
        break;
      case 'CallExpression':
      case 'NewExpression': {
        const callee = node.callee;
        const method = callee?.type === 'MemberExpression' ? propertyName(callee.property) : null;
        if (callee?.type === 'MemberExpression' && callee.object?.type === 'Identifier' && callee.object.name === 'console') {
          // Developer output: not the interface, not counted.
          const skip = (n) => {
            if (!n || typeof n.type !== 'string') return;
            if (n.type === 'Literal' || n.type === 'TemplateLiteral') notText.add(n);
            for (const key of Object.keys(n)) {
              const value = n[key];
              if (Array.isArray(value)) value.forEach(skip);
              else if (value && typeof value.type === 'string') skip(value);
            }
          };
          node.arguments.forEach(skip);
        }
        if (method === 'setAttribute' && node.arguments[0]?.type === 'Literal'
          && UI_ATTRS.has(String(node.arguments[0].value))) {
          markSink(node.arguments[1]);
        }
        if (method === 'insertAdjacentHTML') markSink(node.arguments[1]);
        if (method === 'createTextNode') markSink(node.arguments[0]);
        if (UI_CALLS.has(method)) node.arguments.forEach((argument) => markSink(argument));
        if (callee?.type === 'Identifier' && DIALOGS.has(callee.name)) markSink(node.arguments[0]);
        // R4.
        if (rules.R4) {
          const first = node.arguments[0];
          const french = first?.type === 'Literal' && typeof first.value === 'string' && FRENCH_TAG.test(first.value);
          const intl = callee?.type === 'MemberExpression' && callee.object?.type === 'Identifier'
            && callee.object.name === 'Intl';
          if (french && (LOCALE_METHODS.has(method) || intl) && !isIgnored(node)) {
            record('R4', node, source.slice(node.start, Math.min(node.end, node.start + 100)));
          }
        }
        // R5.
        if (rules.R5 && depth === 0 && node.type === 'CallExpression' && readsLocale(callee)) {
          record('R5', node, source.slice(node.start, Math.min(node.end, node.start + 100)));
        }
        break;
      }
      default:
        break;
    }
    if (FUNCTION_TYPES.has(node.type)) childDepth = depth + 1;
    for (const key of Object.keys(node)) {
      if (key === 'start' || key === 'end' || key === 'type') continue;
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child.type === 'string') visit(child, childDepth, node);
      } else if (value && typeof value.type === 'string') {
        visit(value, childDepth, node);
      }
    }
    // R1 and R2 on the way out, once every parent has had its say about
    // whether this literal is text at all.
    if (node.type === 'Literal' || node.type === 'TemplateLiteral') {
      if (notText.has(node) || isIgnored(node)) return;
      const text = literalText(node);
      if (text === null) return;
      if (isResourceLocator(text)) return;
      if (rules.R1 && looksFrench(text, { formatting: false })) record('R1', node, text);
      if (rules.R2 && onScreen.has(node) && hasInterfaceText(text)) record('R2', node, text);
    }
    void parent;
  };
  visit(ast, 0, null);
  return { counts, findings };
}

// ── index.html (R3) ──────────────────────────────────────────────────────────

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr']);
const RAW_TEXT = new Set(['script', 'style']);
/**
 * Subtrees R3 does not count, each with its reason. `<head>` carries the
 * showcase's title and description (see the comment above `<title>`); the
 * English title is set by src/boot.js, and crawlers read the French.
 */
export const R3_EXEMPT = Object.freeze({
  head: 'metadata crawlers read; the English page sets its title from src/boot.i18n.js',
});
/**
 * An element shown in one language only (landing.css hides it in the other):
 * the French waitlist, the English credit. It has nothing to translate.
 */
export const LOCALE_ONLY_ATTRIBUTE = 'data-locale-only';
const TRANSLATABLE_ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];
const TAG = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/y;
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseAttributes(text) {
  const attrs = new Map();
  for (const match of text.matchAll(ATTR)) {
    attrs.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

/**
 * Walk `index.html` the way the markup applicator sees it.
 *
 * @param {string} html
 * @param {(event: {kind: 'text'|'attribute', text: string, line: number,
 *   covered: boolean, key: string|null, attribute?: string}) => void} onItem
 *   Called for every translatable text run and attribute.
 */
export function walkHtml(html, onItem) {
  // Comments become spaces, so offsets — and line numbers — still line up.
  // So do line breaks: `La France <br />au rayon X.` is ONE run of text, as
  // the applicator sees it (src/i18n/markup.js writes the first text node and
  // empties the others).
  const source = html
    .replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/<br\s*\/?>/gi, (tag) => ' '.repeat(tag.length));
  const lineOf = lineIndex(source);
  const stack = [];
  let textStart = 0;
  let i = 0;
  const flushText = (end) => {
    if (end <= textStart) return;
    const raw = source.slice(textStart, end);
    const text = decodeEntities(raw).replace(/\s+/g, ' ').trim();
    const top = stack[stack.length - 1];
    if (!text || !/\p{L}{2,}/u.test(text) || top?.exempt || top?.raw) return;
    onItem({
      kind: 'text',
      text,
      line: lineOf(textStart + raw.search(/\S/)),
      covered: Boolean(top?.key),
      key: top?.key ?? null,
    });
  };
  while (i < source.length) {
    const lt = source.indexOf('<', i);
    if (lt < 0) break;
    if (source[lt + 1] === '!' || source[lt + 1] === '?') {
      // `<!doctype html>`, `<?xml …?>`: declarations, not text.
      flushText(lt);
      const gt = source.indexOf('>', lt);
      i = gt < 0 ? source.length : gt + 1;
      textStart = i;
      continue;
    }
    TAG.lastIndex = lt;
    const match = TAG.exec(source);
    if (!match) {
      i = lt + 1;
      continue;
    }
    flushText(lt);
    const [whole, closing, rawName, rawAttrs, selfClosing] = match;
    const name = rawName.toLowerCase();
    i = lt + whole.length;
    if (closing) {
      const at = stack.map((entry) => entry.name).lastIndexOf(name);
      if (at >= 0) stack.length = at;
      textStart = i;
      continue;
    }
    const attrs = parseAttributes(rawAttrs);
    const parent = stack[stack.length - 1];
    const classes = (attrs.get('class') || '').split(/\s+/);
    const exempt = Boolean(parent?.exempt) || attrs.get('translate') === 'no'
      || attrs.has(LOCALE_ONLY_ATTRIBUTE)
      || classes.includes('material-symbols-outlined')
      || Object.hasOwn(R3_EXEMPT, name) || (attrs.has('id') && Object.hasOwn(R3_EXEMPT, `#${attrs.get('id')}`));
    if (!exempt) {
      for (const attribute of TRANSLATABLE_ATTRS) {
        if (!attrs.has(attribute)) continue;
        const text = decodeEntities(attrs.get(attribute)).trim();
        if (!/\p{L}{2,}/u.test(text)) continue;
        const key = attrs.get(`data-i18n-${attribute}`) || null;
        onItem({ kind: 'attribute', attribute, text, line: lineOf(lt), covered: Boolean(key), key });
      }
    }
    if (RAW_TEXT.has(name)) {
      const end = source.toLowerCase().indexOf(`</${name}`, i);
      i = end < 0 ? source.length : end;
      textStart = i;
      continue;
    }
    if (!VOID_ELEMENTS.has(name) && !selfClosing) {
      stack.push({ name, key: attrs.get('data-i18n') || null, exempt });
    }
    textStart = i;
  }
  flushText(source.length);
}

/**
 * R3 for one HTML document.
 * @param {string} html
 * @returns {{count: number, findings: Array<{rule: 'R3', line: number, text: string}>}}
 */
export function scanHtml(html) {
  const findings = [];
  walkHtml(html, (item) => {
    if (item.covered) return;
    const text = item.kind === 'attribute' ? `[${item.attribute}] ${item.text}` : item.text;
    findings.push({ rule: 'R3', line: item.line, text: text.slice(0, 100) });
  });
  return { count: findings.length, findings };
}

// ── The repository ───────────────────────────────────────────────────────────

/**
 * Every count, per rule and per file, with the findings behind them.
 * @param {string} [root]
 * @returns {{counts: Record<string, Record<string, number>>,
 *   findings: Record<string, Array<{rule: string, line: number, text: string}>>}}
 */
export function scanRepository(root = REPO_ROOT) {
  const counts = { R1: {}, R2: {}, R3: {}, R4: {}, R5: {} };
  const findings = {};
  for (const file of listSourceFiles(root)) {
    const source = readFileSync(path.join(root, file), 'utf8');
    let result;
    try {
      result = scanModule(source, { file });
    } catch (error) {
      throw new Error(`i18n scan could not parse ${file}: ${error.message}`);
    }
    for (const rule of ['R1', 'R2', 'R4', 'R5']) {
      if (result.counts[rule]) counts[rule][file] = result.counts[rule];
    }
    if (result.findings.length) findings[file] = result.findings;
  }
  const htmlPath = path.join(root, INDEX_HTML);
  if (existsSync(htmlPath)) {
    const html = scanHtml(readFileSync(htmlPath, 'utf8'));
    if (html.count) {
      counts.R3[INDEX_HTML] = html.count;
      findings[INDEX_HTML] = html.findings;
    }
  }
  return { counts, findings };
}

/** Sum of a rule's per-file counts. */
export function total(perFile = {}) {
  return Object.values(perFile).reduce((sum, n) => sum + n, 0);
}

// ── The baseline ─────────────────────────────────────────────────────────────

/** @returns {Record<string, Record<string, number>>|null} */
export function readBaseline(root = REPO_ROOT) {
  const file = path.join(root, BASELINE_FILE);
  if (!existsSync(file)) return null;
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  const out = {};
  for (const rule of RULE_IDS) out[rule] = parsed[rule] || {};
  return out;
}

/**
 * Where the current counts exceed the baseline.
 * @returns {{increases: Array<{rule: string, file: string, baseline: number, now: number}>,
 *   decreases: Array<{rule: string, file: string, baseline: number, now: number}>}}
 */
export function compareToBaseline(counts, baseline) {
  const increases = [];
  const decreases = [];
  for (const rule of RULE_IDS) {
    const now = counts[rule] || {};
    const was = baseline?.[rule] || {};
    for (const file of new Set([...Object.keys(now), ...Object.keys(was)])) {
      const a = was[file] ?? 0;
      const b = now[file] ?? 0;
      if (b > a) increases.push({ rule, file, baseline: a, now: b });
      else if (b < a) decreases.push({ rule, file, baseline: a, now: b });
    }
  }
  const order = (x, y) => x.rule.localeCompare(y.rule) || x.file.localeCompare(y.file);
  return { increases: increases.sort(order), decreases: decreases.sort(order) };
}

/** Sorted, zero-free copy of a per-file map, so the JSON diff stays readable. */
function tidy(perFile) {
  return Object.fromEntries(Object.entries(perFile).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * The baseline file's text for a set of counts.
 * @param {Record<string, Record<string, number>>} counts
 * @returns {string}
 */
export function renderBaseline(counts) {
  const body = {
    about: 'Ceilings for the i18n ratchets (src/i18n/i18nRatchet.test.mjs). A count may go down, never up. '
      + 'Lowered by `npm run i18n:tighten`; see docs/i18n/CONVENTIONS.md.',
    totals: Object.fromEntries(RULE_IDS.map((rule) => [rule, total(counts[rule])])),
  };
  for (const rule of RULE_IDS) body[rule] = tidy(counts[rule] || {});
  return `${JSON.stringify(body, null, 2)}\n`;
}

/**
 * The tightened baseline: each count lowered to the current one. Refuses to
 * RAISE anything — an increase is a failing ratchet, not something to record.
 * @returns {Record<string, Record<string, number>>}
 */
export function tightenBaseline(counts, baseline) {
  const { increases } = compareToBaseline(counts, baseline);
  if (increases.length) {
    const lines = increases.map((d) => `  ${d.rule} ${d.file}: ${d.baseline} → ${d.now}`);
    throw new Error(`Refusing to tighten: these counts went UP.\n${lines.join('\n')}`);
  }
  const out = {};
  for (const rule of RULE_IDS) {
    out[rule] = {};
    for (const [file, n] of Object.entries(counts[rule] || {})) out[rule][file] = n;
  }
  return out;
}
