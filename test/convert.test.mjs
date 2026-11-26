import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNetworkFilter, parseCosmeticFilter, convertLists } from '../scripts/convert.mjs';

test('plain domain rule becomes requestDomains', () => {
  const r = parseNetworkFilter('||ads.example.com^$third-party').rule;
  assert.deepEqual(r.condition, { domainType: 'thirdParty', requestDomains: ['ads.example.com'] });
  assert.equal(r.action.type, 'block');
});

test('path rule keeps ABP syntax as urlFilter, maps types and domains', () => {
  const r = parseNetworkFilter('||cdn.example.com/ads/*.js$script,~image,domain=a.com|~b.com').rule;
  assert.equal(r.condition.urlFilter, '||cdn.example.com/ads/*.js');
  assert.deepEqual(r.condition.resourceTypes, ['script']);
  assert.deepEqual(r.condition.excludedResourceTypes, ['image']);
  assert.deepEqual(r.condition.initiatorDomains, ['a.com']);
  assert.deepEqual(r.condition.excludedInitiatorDomains, ['b.com']);
});

test('exceptions get higher priority; $document becomes allowAllRequests', () => {
  const a = parseNetworkFilter('@@||good.com/ad.js$script').rule;
  assert.equal(a.action.type, 'allow');
  assert.ok(a.priority > 1);
  const d = parseNetworkFilter('@@||good.com^$document').rule;
  assert.equal(d.action.type, 'allowAllRequests');
});

test('unsupported options and regex are skipped, not guessed', () => {
  assert.equal(parseNetworkFilter('||x.com^$csp=script-src none'), null);
  assert.equal(parseNetworkFilter('||x.com^$popup'), null);
  assert.equal(parseNetworkFilter('/ad[0-9]+\\.js/'), null);
  assert.equal(parseNetworkFilter('||x.com^$domain=example.*'), null);
});

test('generichide exception is a cosmetic exception', () => {
  assert.deepEqual(parseNetworkFilter('@@||news.com^$generichide'), { kind: 'cosmeticException', domain: 'news.com', types: ['generichide'] });
});

test('cosmetic filters', () => {
  assert.deepEqual(parseCosmeticFilter('###AdBox'), { exception: false, selector: '#AdBox', include: [], exclude: [] });
  assert.deepEqual(parseCosmeticFilter('a.com,b.com##.ad'), { exception: false, selector: '.ad', include: ['a.com', 'b.com'], exclude: [] });
  assert.equal(parseCosmeticFilter('a.com#?#div:-abp-has(.ad)'), null);
  assert.equal(parseCosmeticFilter('a.com##div:has-text(Sponsored)'), null);
});

test('convertLists compresses domain rules and applies exceptions', () => {
  const { rules, cosmetic } = convertLists([
    '! comment',
    '||a.com^$third-party',
    '||b.com^$third-party',
    '||c.com^',
    '##.ad-banner',
    '##.sponsor',
    '#@#.sponsor',
    'site.com##.promo',
    'site.com#@#.ad-banner',
    '@@||site.com^$generichide',
  ].join('\n'));
  const tp = rules.find((r) => r.condition.domainType === 'thirdParty');
  assert.deepEqual(tp.condition.requestDomains, ['a.com', 'b.com']);
  assert.equal(rules.length, 2);
  assert.deepEqual(new Set(rules.map((r) => r.id)).size, 2);
  assert.deepEqual(cosmetic.generic, ['.ad-banner']);
  assert.deepEqual(cosmetic.specific, { 'site.com': ['.promo'] });
  assert.deepEqual(cosmetic.exceptions, { 'site.com': ['.ad-banner'] });
  assert.deepEqual(cosmetic.genericHide, ['site.com']);
});

test('mergeCosmetic unions lists', async () => {
  const { mergeCosmetic } = await import('../scripts/convert.mjs');
  const m = mergeCosmetic([
    { generic: ['.a'], specific: { 'x.com': ['.p'] }, exceptions: {}, genericHide: [], elemHide: [] },
    { generic: ['.a', '.b'], specific: { 'x.com': ['.q'] }, exceptions: { 'y.com': ['.a'] }, genericHide: ['z.com'], elemHide: [] },
  ]);
  assert.deepEqual(m.generic, ['.a', '.b']);
  assert.deepEqual(m.specific, { 'x.com': ['.p', '.q'] });
  assert.deepEqual(m.exceptions, { 'y.com': ['.a'] });
  assert.deepEqual(m.genericHide, ['z.com']);
});
