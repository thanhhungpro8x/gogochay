import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { domainToASCII } from 'node:url';
import vm from 'node:vm';

const ctx = { self: {} };
vm.runInNewContext(readFileSync(new URL('../extension/domain-check.js', import.meta.url), 'utf8'), ctx);
const { check, toUnicode } = ctx.self.AdTrayDomain;
// browsers give the content script the punycode (ASCII) form of the hostname
const visit = (unicodeHost) => check(domainToASCII(unicodeHost));

test('punycode is decoded like the browser does', () => {
  for (const h of ['pаypal.com', 'tiếng-việt.vn', '例え.jp', 'президент.рф', 'bücher.de']) {
    assert.equal(toUnicode(domainToASCII(h)), h);
  }
});

test('Cyrillic letter inside a Latin name is flagged', () => {
  const r = visit('pаypal.com'); // Cyrillic а
  assert.equal(r.risk, 'high');
  assert.ok(r.reasons.some((x) => x.type === 'mixed-script'));
  assert.ok(r.reasons.some((x) => x.type === 'lookalike' && x.looksLike === 'paypal'));
});

test('all-Cyrillic name that mimics Latin is flagged', () => {
  const r = visit('аррӏе.com'); // а р р ӏ е, all Cyrillic
  assert.equal(r.risk, 'high');
  assert.ok(r.reasons.some((x) => x.type === 'whole-script' && x.looksLike === 'apple'));
});

test('ASCII lookalikes of well-known names are flagged', () => {
  for (const h of ['paypa1.com', 'rnicrosoft.com', 'vietcornbank.com.vn', 'g00gle.com', 'arnazon.fr']) {
    assert.equal(visit(h).risk, 'high', h);
  }
});

test('accented lookalike of a bank is flagged', () => {
  assert.equal(visit('vietcómbank.com').risk, 'high');
});

test('brand used as a fake prefix is a warning', () => {
  const r = visit('paypal.com.secure-login.xyz');
  assert.equal(r.risk, 'warn');
  assert.equal(r.reasons[0].realDomain, 'secure-login.xyz');
});

test('real sites and normal international names are not flagged', () => {
  for (const h of [
    'paypal.com', 'www.paypal.fr', 'accounts.google.com', 'vnexpress.net', 'vietcombank.com.vn', 'impots.gouv.fr',
    'tiếng-việt.vn', 'bücher.de', 'президент.рф', '例え.jp', 'naver.co.kr', 'github.com', 'google.github.io',
    'mail.google.com', 'localhost', '192.168.1.1', 'bfmtv.com', '24h.com.vn', 'lemonde.fr', 'thanhnien.vn',
    'example.com', 'news.ycombinator.com', 'docs.claude.com',
  ]) {
    assert.equal(visit(h).risk, 'none', `${h}: ${JSON.stringify(visit(h).reasons)}`);
  }
});

test('rare Latin letters that only mimic a-z are flagged, without any list', () => {
  for (const h of ['ɑpple-support.com', 'login-bɑnk.net', 'ꞁogin-secure.com', 'sᴇcure-pay.com']) {
    const r = visit(h);
    assert.equal(r.risk, 'high', `${h}: ${JSON.stringify(r.reasons)}`);
    assert.ok(r.reasons.some((x) => x.type === 'rare-latin'), h);
  }
});

test('dotless i alone is a softer warning (it is a real Turkish letter)', () => {
  assert.equal(visit('secure-bıll.com').risk, 'warn');
  assert.equal(visit('ışıkgöz.com.tr').risk, 'none');
});

test('every non a-z character is reported for the "check before you log in" note', () => {
  assert.deepEqual([...visit('vietcómbank-online.com').special], ['ó']);
  assert.deepEqual([...visit('example.com').special], []);
});
