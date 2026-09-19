#!/usr/bin/env node
/**
 * Fails a pull request whose title or commit messages are written in French,
 * and warns about French prose added to Markdown files.
 *
 * The repository switched to English on 2026-09-19 (CONTRIBUTING.md,
 * "Language"). History before that date stays French and is never checked:
 * only the commits of the pull request are, `base..head`.
 *
 *   node scripts/check-english.mjs --base <sha> --head <sha> --title "<PR title>"
 *
 * The detector counts function words, not vocabulary: French public-data
 * terms (DVF, Géorisques, Île-de-France) are legitimate inside English prose,
 * while "les", "dans" or "n'est" never are. Quoted text, code spans, URLs and
 * trailers are removed first, so an English message may quote a French label.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { PROPER_NOUN_LIST } from '../src/i18n/glossary.js';

/** French words that are not also common English words. */
const FRENCH_MARKERS = new Set(`
les des une est sont pas dans pour avec sur qui que aux du cette ces leur leurs mais où
être été était fait très aussi comme entre depuis chaque tout tous toute toutes même
donc alors ne ni nous vous ils elles lui au quand aucun aucune peut peuvent doit faut
rien dont ceux celle celui après jamais toujours déjà ici ont avait sera seront deux
trois selon lorsque puis afin`.split(/\s+/).filter(Boolean));

/**
 * Short French words that English prose only meets inside names ("Le Havre",
 * "Métropole de Lyon"). Names from the glossary are removed before counting,
 * and each of these weighs half a marker, so a stray one never tips a verdict.
 */
const WEAK_FRENCH_MARKERS = new Set(['le', 'la', 'et', 'un', 'en', 'se', 'sa', 'son', 'ses', 'de', 'il', 'elle', 'on', 'ce']);

/** English words that are not French words. */
const ENGLISH_MARKERS = new Set(`
the and of to is are with for that this from when was were it its now no not in by be
has have had as at or but which what who into than then there their they them only
still never every each can cannot does do did would should could will after before
without because instead over under through while`.split(/\s+/).filter(Boolean));

/** French elisions: l'…, d'…, qu'…, n'…, s'…, c'…, j'… */
const ELISION = /\b(?:l|d|qu|n|s|c|j|jusqu|lorsqu|puisqu)['’][a-zàâçéèêëîïôûùüÿœ]/gi;

/** Remove what an English message may legitimately quote in French. */
export function stripQuoted(text) {
  let out = String(text ?? '');
  out = out.replace(/```[\s\S]*?```/g, ' ');
  out = out.replace(/`[^`\n]*`/g, ' ');
  out = out.replace(/https?:\/\/\S+/g, ' ');
  out = out.replace(/«[^»]*»/g, ' ');
  out = out.replace(/“[^”]*”/g, ' ');
  out = out.replace(/"[^"\n]*"/g, ' ');
  out = out.replace(/^(?:co-authored-by|signed-off-by|reviewed-by|supersedes|refs|closes|fixes):.*$/gim, ' ');
  for (const noun of PROPER_NOUN_LIST) out = out.split(noun).join(' ');
  return out;
}

/**
 * @param {string} text
 * @returns {{ french: number, english: number }}
 */
export function languageCounts(text) {
  const stripped = stripQuoted(text);
  const words = stripped.toLowerCase().match(/[a-zàâçéèêëîïôûùüÿœ]+/g) ?? [];
  let french = (stripped.match(ELISION) ?? []).length;
  let english = 0;
  for (const word of words) {
    if (FRENCH_MARKERS.has(word)) french += 1;
    else if (WEAK_FRENCH_MARKERS.has(word)) french += 0.5;
    else if (ENGLISH_MARKERS.has(word)) english += 1;
    // A French verb or noun carries its accent: "affichait", "écouter", "réseau".
    else if (/[àâçéèêëîïôûùœ]/.test(word)) french += 0.5;
  }
  // "mot : suite" — the space before a colon is French typography.
  french += (stripped.match(/\S \s?[:;?!](?:\s|$)/g) ?? []).length;
  return { french, english };
}

/** Whether a title, a commit message or a paragraph reads as French. */
export function looksFrench(text) {
  const { french, english } = languageCounts(text);
  return french >= 2 && french > english;
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** Commit messages of `base..head`, merges excluded. */
export function commitMessages(base, head) {
  const raw = git(['log', '--no-merges', '--format=%H%x1f%B%x1e', `${base}..${head}`]);
  return raw.split('\x1e').map((chunk) => chunk.trim()).filter(Boolean).map((chunk) => {
    const [sha, body] = chunk.split('\x1f');
    return { sha, message: body.trim() };
  });
}

/** Markdown files where French is expected. */
export const FRENCH_ALLOWED_MARKDOWN = Object.freeze([
  'docs/GLOSSARY.md',
  'README.fr.md',
]);

/** Paragraphs added to Markdown files by `base..head`, with their first line number. */
export function addedMarkdownParagraphs(base, head) {
  const diff = git(['diff', '--unified=0', '--no-color', `${base}...${head}`, '--', '*.md']);
  const paragraphs = [];
  let file = null;
  let line = 0;
  let current = null;
  const flush = () => {
    if (current && current.text.trim()) paragraphs.push(current);
    current = null;
  };
  for (const row of diff.split('\n')) {
    if (row.startsWith('+++ ')) {
      flush();
      file = row.startsWith('+++ b/') ? row.slice(6) : null;
    } else if (row.startsWith('@@')) {
      flush();
      line = Number(/\+(\d+)/.exec(row)?.[1] ?? 0);
    } else if (row.startsWith('+') && file && !FRENCH_ALLOWED_MARKDOWN.includes(file)) {
      const text = row.slice(1);
      if (!text.trim()) flush();
      else {
        current ??= { file, line, text: '' };
        current.text += `${text}\n`;
      }
      line += 1;
    }
  }
  flush();
  return paragraphs;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1] ?? '';
  }
  return args;
}

function main() {
  const { base, head, title } = parseArgs(process.argv.slice(2));
  if (!base || !head) {
    console.error('usage: check-english.mjs --base <sha> --head <sha> [--title "<PR title>"]');
    process.exit(2);
  }
  const failures = [];
  if (title && looksFrench(title)) failures.push(`PR title reads as French: "${title}"`);
  for (const { sha, message } of commitMessages(base, head)) {
    if (looksFrench(message.split('\n')[0]) || looksFrench(message)) failures.push(`commit ${sha.slice(0, 8)} reads as French: "${message.split('\n')[0]}"`);
  }
  for (const { file, line, text } of addedMarkdownParagraphs(base, head)) {
    if (looksFrench(text)) console.log(`::warning file=${file},line=${line}::French prose added to ${file}; docs are written in English (see docs/GLOSSARY.md)`);
  }
  if (failures.length) {
    for (const failure of failures) console.log(`::error::${failure}`);
    console.log('\nThis repository is written in English since 2026-09-19 (CONTRIBUTING.md, "Language").');
    console.log('Reword with `git commit --amend` / `git rebase -i`, and edit the PR title.');
    process.exit(1);
  }
  console.log('PR title and commit messages are in English.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
