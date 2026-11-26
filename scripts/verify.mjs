#!/usr/bin/env node
// Security self-check, run in CI and before packaging. Fails the build if the
// extension ever gains a risky permission or a way to load/send anything remote.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'extension');
const errors = [];
const fail = (msg) => errors.push(msg);

const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const ALLOWED_PERMISSIONS = ['declarativeNetRequest', 'storage', 'sidePanel', 'activeTab'];
for (const p of manifest.permissions ?? []) if (!ALLOWED_PERMISSIONS.includes(p)) fail(`unexpected permission: ${p}`);
if (manifest.host_permissions?.length) fail('host_permissions must stay empty');
if (manifest.optional_permissions?.length || manifest.optional_host_permissions?.length) fail('no optional permissions allowed');
if (manifest.externally_connectable) fail('externally_connectable must not be set');
if (manifest.web_accessible_resources) fail('web_accessible_resources must not be set');
const csp = manifest.content_security_policy?.extension_pages ?? '';
for (const d of ["script-src 'self'", "connect-src 'self'", "object-src 'none'"]) if (!csp.includes(d)) fail(`CSP must contain ${d}`);

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const FORBIDDEN = [
  [/\beval\s*\(/, 'eval()'],
  [/new\s+Function\s*\(/, 'new Function()'],
  [/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML/, 'HTML string injection'],
  [/XMLHttpRequest|WebSocket|sendBeacon|EventSource/, 'network API'],
  [/fetch\s*\(\s*['"`]https?:/, 'fetch to a remote URL'],
  [/importScripts|import\s*\(/, 'dynamic code loading'],
  [/chrome\.cookies|chrome\.history|chrome\.webRequest|chrome\.scripting/, 'sensitive API'],
];

for await (const file of walk(root)) {
  const rel = path.relative(root, file);
  if (/\.(html)$/.test(file)) {
    const html = await readFile(file, 'utf8');
    if (/<script[^>]+src=["']https?:/i.test(html) || /<link[^>]+href=["']https?:/i.test(html)) fail(`${rel}: remote resource`);
    if (/<script(?![^>]*src=)[^>]*>/i.test(html)) fail(`${rel}: inline script`);
  }
  if (!file.endsWith('.js') || rel.startsWith('data/')) continue;
  const src = await readFile(file, 'utf8');
  for (const [re, what] of FORBIDDEN) if (re.test(src)) fail(`${rel}: ${what}`);
}

// generated data must be data only
const cosmetic = await readFile(path.join(root, 'data', 'cosmetic.js'), 'utf8');
const body = cosmetic.split('\n').filter((l) => l && !l.startsWith('//'));
if (body.length !== 1 || !/^self\.AD_TRAY_COSMETIC = \{.*\};$/.test(body[0])) fail('data/cosmetic.js must be a single data assignment');
JSON.parse(body[0].replace(/^self\.AD_TRAY_COSMETIC = /, '').replace(/;$/, ''));

let ruleCount = 0;
for (const res of manifest.declarative_net_request.rule_resources) {
  const rules = JSON.parse(await readFile(path.join(root, res.path), 'utf8'));
  ruleCount += rules.length;
  for (const r of rules) {
    if (!['block', 'allow', 'allowAllRequests'].includes(r.action.type)) fail(`${res.id} rule ${r.id}: action ${r.action.type} not allowed`);
  }
}
if (ruleCount > 30000) fail(`${ruleCount} static rules: above Chrome's guaranteed 30,000`);

if (errors.length) {
  console.error('verify FAILED:\n  ' + errors.join('\n  '));
  process.exit(1);
}
console.log(`verify OK — ${ruleCount} network rules, permissions: ${manifest.permissions.join(', ')}`);
