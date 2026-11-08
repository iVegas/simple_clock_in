// The service worker precache list must contain every runtime file, or the installed app
// breaks offline. This test fails when a file is added without updating sw.js (or vice versa).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const assets = JSON.parse(`[${/const ASSETS = \[([\s\S]*?)\];/.exec(sw)[1].replace(/'/g, '"').replace(/,\s*$/, '')}]`);

function walk(dir) {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(root, path)).isDirectory() ? walk(path) : [path];
  });
}

// Translations other than English are downloaded on demand (only the chosen one is kept offline).
const isOptionalLocale = (f) => /src\/i18n\/locales\/(?!en\.json)/.test(f);

const runtimeFiles = [
  'index.html', 'manifest.webmanifest', 'config.js',
  ...walk('src'),
  ...walk('assets'),
  ...walk('vendor').filter((f) => f.endsWith('.js')),
].map((f) => `./${relative('.', f)}`).filter((f) => !isOptionalLocale(f));

test('every precached asset exists', () => {
  for (const asset of assets.filter((a) => a !== './')) {
    assert.ok(existsSync(join(root, asset)), `${asset} is listed in sw.js but does not exist`);
  }
});

test('every runtime file is precached', () => {
  const missing = runtimeFiles.filter((f) => !assets.includes(f));
  assert.deepEqual(missing, [], `add these to ASSETS in sw.js: ${missing.join(', ')}`);
});

test('manifest icons are precached', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  for (const icon of manifest.icons) assert.ok(assets.includes(`./${icon.src}`), `${icon.src} not precached`);
});

test('only the default language is precached', () => {
  assert.deepEqual(assets.filter((a) => a.includes('/i18n/locales/')), ['./src/i18n/locales/en.json']);
});
