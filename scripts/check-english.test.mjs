import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { languageCounts, looksFrench } from './check-english.mjs';

// Subjects from this fork's history before 2026-09-19.
const FRENCH_SUBJECTS = [
  'Le micro affichait LISTENING sans écouter, et le HUD vidait l’essai pendant la session vocale (#248)',
  'Un iPhone ouvrait le globe en qualité maximale et achetait le maillage de Google au premier doigt posé (#234)',
  'Le réseau électrique se refusait à la vue oblique que le globe ouvre, et effaçait sa propre légende en montant (#186)',
  'Une fiche se referme en cliquant la carte, et la parcelle redevient cliquable (#167)',
  'Le flux TomTom n’attend plus le graphe routier, et le conteneur retrouve Overpass (#146)',
  'Cinq couleurs disaient quelque chose : la couche Sites militaires a enfin sa clé (#144)',
  'Palier 2 — l’avis de valeur livré, le trajet multimodal chiffré (#101)',
  'Carroyage INSEE — un disque par carreau, à plat, et la carte qu’on voit enfin dessous (#65)',
  'Staging — GitHub refuse le POST git-upload-pack, le tarball est un GET (#63)',
  'Une digue n’est pas un barrage — 1 310 fiches titrées par ce qu’elles sont (#49)',
];

// Subjects from upstream God's Eye View and from this fork after the switch.
const ENGLISH_SUBJECTS = [
  'fix: distinguish partial vessel snapshots from stale data',
  'Add Director authoring, import previews and scene bundles',
  'Release failed asset responses and refuse cancelled requests',
  'fix(transit): keep parked vehicles pointed along their course while the camera orbits (#603)',
  'refactor: separate application shell state and lifecycle owners',
  'Links to Lyon opened sales on an empty map: camera rounding noise no longer blocks moveEnd',
  'Bâti 3D (FR) — measure the ground under each building, not a kilometre away (#20)',
  'Add the Métropole de Lyon CCTV pack, and a full-resolution frame viewer (#3)',
  'Risks (Géorisques) opened on an empty legend: the flood zones now load with the layer',
  'The loader shows the slogan « Aucun angle mort » in French and “No blind spots.” in English',
];

test('French subjects from the old history read as French', () => {
  for (const subject of FRENCH_SUBJECTS) assert.ok(looksFrench(subject), `${subject} → ${JSON.stringify(languageCounts(subject))}`);
});

test('English subjects, French names and quoted French labels included, read as English', () => {
  for (const subject of ENGLISH_SUBJECTS) assert.ok(!looksFrench(subject), `${subject} → ${JSON.stringify(languageCounts(subject))}`);
});

test('code spans, URLs and trailers are not counted', () => {
  const message = [
    'The DVF layer read the wrong column: `type_local` values stay as published',
    '',
    'See https://www.data.gouv.fr/fr/datasets/demandes-de-valeurs-foncieres/ for the dataset.',
    '```',
    'les des une est sont pas dans pour avec',
    '```',
    '',
    'Co-authored-by: Quelqu’un de la maison <someone@users.noreply.github.com>',
  ].join('\n');
  assert.equal(looksFrench(message), false);
});

test('a single stray French word never tips a verdict', () => {
  assert.equal(looksFrench('Le Havre'), false);
  assert.equal(looksFrench('Fix the Côte d’Azur label'), false);
});

function tempRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-english-'));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'ci@example.invalid');
  git('config', 'user.name', 'CI');
  git('config', 'commit.gpgsign', 'false');
  return { dir, git };
}

test('only the commits of the pull request are read, merges excluded', () => {
  const { dir, git } = tempRepo();
  try {
    writeFileSync(path.join(dir, 'a.txt'), '1');
    git('add', '.');
    git('commit', '-q', '-m', 'Le premier commit, écrit en français avant la bascule');
    const base = git('rev-parse', 'HEAD');
    writeFileSync(path.join(dir, 'a.txt'), '2');
    git('commit', '-q', '-am', 'The second commit is in English');
    const head = git('rev-parse', 'HEAD');
    const messages = execFileSync('node', ['-e', `
      process.chdir(${JSON.stringify(dir)});
      import(${JSON.stringify(new URL('./check-english.mjs', import.meta.url).href)})
        .then((m) => console.log(JSON.stringify(m.commitMessages(${JSON.stringify(base)}, ${JSON.stringify(head)}))));
    `], { encoding: 'utf8' });
    const parsed = JSON.parse(messages);
    assert.deepEqual(parsed.map((c) => c.message), ['The second commit is in English']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('French paragraphs added to Markdown are found with their line, the glossary excepted', () => {
  const { dir, git } = tempRepo();
  try {
    writeFileSync(path.join(dir, 'README.md'), '# Title\n');
    git('add', '.');
    git('commit', '-q', '-m', 'Start');
    const base = git('rev-parse', 'HEAD');
    writeFileSync(path.join(dir, 'README.md'), '# Title\n\nThe globe opens on Paris.\n\nLa couche ne s’affiche pas dans la vue, et les ventes sont vides.\n');
    git('add', '.');
    git('commit', '-q', '-m', 'Docs');
    const head = git('rev-parse', 'HEAD');
    const out = execFileSync('node', ['-e', `
      process.chdir(${JSON.stringify(dir)});
      import(${JSON.stringify(new URL('./check-english.mjs', import.meta.url).href)})
        .then((m) => console.log(JSON.stringify(m.addedMarkdownParagraphs(${JSON.stringify(base)}, ${JSON.stringify(head)})
          .filter((p) => m.looksFrench(p.text)))));
    `], { encoding: 'utf8' });
    assert.deepEqual(JSON.parse(out).map(({ file, line }) => ({ file, line })), [{ file: 'README.md', line: 5 }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
