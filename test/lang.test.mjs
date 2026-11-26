import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { self: {} };
vm.runInNewContext(readFileSync(new URL('../extension/lang.js', import.meta.url), 'utf8'), ctx);
const { pick, format } = ctx.self.AdTrayLang;

// fake chrome.i18n: `picked` = what the browser chose from _locales, `ui` = browser language
const browser = (picked, ui) => ({ getMessage: (k) => (k === 'langCode' ? picked : ''), getUILanguage: () => ui });

test('follows the browser language', () => {
  assert.equal(pick('auto', browser('fr', 'fr')), null);       // browser already shows French
  assert.equal(pick('auto', browser('vi', 'vi')), null);
  assert.equal(pick('auto', browser('en', 'en-US')), null);    // English browser → English
  assert.equal(pick('auto', browser('en', 'en-GB')), null);
});

test('regional French / Vietnamese the browser did not map → French / Vietnamese', () => {
  for (const ui of ['fr-CA', 'fr-BE', 'fr-CH', 'fr_LU']) assert.equal(pick('auto', browser('en', ui)), 'fr', ui);
  assert.equal(pick('auto', browser('en', 'vi-VN')), 'vi');
});

test('other languages → English', () => {
  for (const ui of ['de', 'ja', 'es-ES', 'zh-CN', '']) assert.equal(pick('auto', browser('en', ui)), null, ui);
});

test('a language chosen in the tray wins', () => {
  assert.equal(pick('vi', browser('fr', 'fr')), 'vi');
  assert.equal(pick('en', browser('vi', 'vi')), 'en');
});

test('placeholders are filled like chrome.i18n does', () => {
  const m = { a: { message: 'Hello $NAME$, $COUNT$!', placeholders: { name: { content: '$1' }, count: { content: '$2' } } } };
  assert.equal(format(m, 'a', ['An', '3']), 'Hello An, 3!');
  assert.equal(format(m, 'missing'), null);
});
