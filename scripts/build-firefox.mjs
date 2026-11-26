#!/usr/bin/env node
// Builds the Firefox version from the same source: copies extension/ to dist/firefox/
// and adapts manifest.json. Nothing else differs between browsers.
//
//   node scripts/build-firefox.mjs     → dist/firefox/ (load in about:debugging) + dist/gogochay-firefox.zip
//
// Firefox differences handled here:
//   * MV3 background runs as an event page ("scripts"), not a service worker
//   * no sidePanel API → the tray is offered as a Firefox sidebar (sidebar_action)
//   * an add-on ID and the data-collection declaration that addons.mozilla.org requires
//   * Firefox for Android is declared too (gecko_android)

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'extension');
const dist = path.join(root, 'dist');
const out = path.join(dist, 'firefox');

await rm(out, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(src, out, {
  recursive: true,
  filter: (p) => !path.basename(p).startsWith('.') && !p.includes(`${path.sep}_metadata`),
});

const manifestPath = path.join(out, 'manifest.json');
const m = JSON.parse(await readFile(manifestPath, 'utf8'));

m.background = { scripts: ['background.js'] };
m.permissions = m.permissions.filter((p) => p !== 'sidePanel');
delete m.side_panel;
delete m.minimum_chrome_version;
m.sidebar_action = {
  default_title: 'GoGoChay',
  default_panel: 'tray/tray.html?panel=1',
  default_icon: m.action.default_icon,
  open_at_install: false,
};
m.browser_specific_settings = {
  gecko: {
    id: 'gogochay@thanhhungdoan.fr',
    // 140: first Firefox that understands data_collection_permissions (required by AMO)
    strict_min_version: '140.0',
    data_collection_permissions: { required: ['none'] },
  },
  // Firefox for Android: same add-on (the sidebar simply isn't offered there)
  gecko_android: {
    // 142: first Firefox for Android that understands data_collection_permissions
    strict_min_version: '142.0',
  },
};

await writeFile(manifestPath, JSON.stringify(m, null, 2) + '\n');

const zip = path.join(dist, 'gogochay-firefox.zip');
await rm(zip, { force: true });
execFileSync('zip', ['-qr', '-X', zip, '.', '-x', '.*'], { cwd: out });
console.log(`Firefox build: ${path.relative(root, out)}/ and ${path.relative(root, zip)}`);
