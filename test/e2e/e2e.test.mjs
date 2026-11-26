// End-to-end test: loads the unpacked extension in Chrome for Testing and checks
// blocking, hiding, the tray, and per-site pause against a local fake 'news' site.
// All hostnames are mapped to 127.0.0.1, so no real ad server is contacted.
import puppeteer from 'puppeteer-core';
import { start, hits } from './server.mjs';
import { existsSync, readdirSync } from 'node:fs';

// CHROME_PATH, else a Chrome for Testing downloaded with `npx @puppeteer/browsers install chrome@stable`
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../chrome');
  if (existsSync(base)) {
    for (const v of readdirSync(base).sort().reverse()) {
      for (const rel of [
        'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
        'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
        'chrome-linux64/chrome',
        'chrome-win64/chrome.exe',
      ]) {
        const p = path.join(base, v, rel);
        if (existsSync(p)) return p;
      }
    }
  }
  return '/usr/bin/google-chrome';
}
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../extension');
const server = await start();
const PORT = server.address().port;
const browser = await puppeteer.launch({
  executablePath: findChrome(), headless: true,
  enableExtensions: [EXT],
  args: ['--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP * 127.0.0.1', '--lang=vi'],
});
const ok = (c, m) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m);
  if (!c) {
    process.exitCode = 1;
    if (process.env.GITHUB_ACTIONS) console.log(`::error::e2e FAIL ${m}`); // shows in the run summary
  }
};
for (const ev of ['unhandledRejection', 'uncaughtException']) {
  process.on(ev, (e) => {
    console.error(e);
    if (process.env.GITHUB_ACTIONS) console.log(`::error::e2e crashed: ${String(e?.message ?? e).split('\n')[0]}`);
    process.exit(1);
  });
}
const swTarget = await browser.waitForTarget(t => t.type() === 'service_worker' && t.url().endsWith('background.js'));
const sw = await swTarget.worker();

// Poll instead of fixed sleeps: CI machines are slower than a laptop.
async function until(fn, what, timeout = 10000) {
  const end = Date.now() + timeout;
  for (;;) {
    try { if (await fn()) return; } catch { /* not ready yet */ }
    if (Date.now() > end) { console.log((process.env.GITHUB_ACTIONS ? '::warning::' : '') + 'TIMEOUT waiting for ' + what); return; }
    await new Promise(r => setTimeout(r, 150));
  }
}
const dynamicRules = () => sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules().then(r => r.length));
await until(() => sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets().then(r => r.includes('easylist'))), 'static rules enabled');
const welcomeT = await browser.waitForTarget((t) => t.url().includes('welcome/welcome.html'), { timeout: 5000 }).catch(() => null);
ok(!!welcomeT, 'welcome / features page opens on first install');
if (welcomeT) {
  const w = await welcomeT.asPage();
  await new Promise((r) => setTimeout(r, 500));
  ok((await w.evaluate(() => document.querySelectorAll('.card').length)) === 4 && !(await w.evaluate(() => document.body.innerText.includes('w_'))), 'welcome page shows all feature sections, fully translated');
  await w.close();
}
const page = await browser.newPage();
await page.goto(`http://news.test:${PORT}/`, { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 800));
const st = await page.evaluate(() => ({
  ad: !!window.adLoaded, own: !!window.ownLoaded,
  adbox: getComputedStyle(document.getElementById('AdBox2')).display,
  ins: getComputedStyle(document.querySelector('.adsbygoogle')).display,
  banner: getComputedStyle(document.querySelector('.ad-slot')).display,
  content: getComputedStyle(document.getElementById('content')).display,
}));
ok(!st.ad, 'ad scripts blocked');
ok(!(await page.evaluate(() => !!window.taboolaLoaded)), 'Taboola widget script blocked (ABPVN list)'); ok(st.own, 'first-party script still runs');
ok(st.adbox === 'none' && st.ins === 'none' && st.banner === 'none', 'ad elements hidden');
ok(st.content !== 'none', 'real content visible');
ok(!hits.some(h => h.startsWith('ib.adnxs.com') || h.includes('adsbygoogle')), 'blocked requests never reached server: ' + hits.join(' '));

const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
const list = await sw.evaluate(id => chrome.tabs.sendMessage(id, { type: 'adtray:list' }, { frameId: 0 }), tabId);
ok(['#AdBox2', '.ad-slot', '.adsbygoogle'].every((k) => list.items.some((i) => i.ident.includes(k))), 'tray lists the hidden ads: ' + JSON.stringify(list.items.map(i => i.ident + '|' + (i.linkHost||i.frameHost))));
const badge = await sw.evaluate(id => chrome.action.getBadgeText({ tabId: id }), tabId);
console.log('badge text (rendered by Chrome):', badge);

// screenshot the tray: open popup
try { await sw.evaluate(() => chrome.action.openPopup()); } catch (e) { console.log('openPopup:', e.message); }
const popupT = await browser.waitForTarget(t => t.url().includes('tray.html'), { timeout: 5000 }).catch(() => null);
if (popupT) { const p = await popupT.asPage(); await new Promise(r => setTimeout(r, 1200)); await p.screenshot({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), 'tray.png') }); console.log('screenshot saved'); }

// reveal one
await sw.evaluate((id, item) => chrome.tabs.sendMessage(id, { type: 'adtray:show', id: item }, { frameId: 0 }), tabId, list.items[0].id);
const shown = await page.evaluate(() => [...document.querySelectorAll('[data-adtray-shown]')].map(e => getComputedStyle(e).display));
ok(shown.length === 1 && shown[0] !== 'none', 'Show brings one ad back: ' + shown);

// picker: hide an element no list knows about
await sw.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'adtray:pick', labels: { hint: 'test' } }, { frameId: 0 }), tabId);
const r = await page.evaluate(() => { const b = document.getElementById('leftover-box').getBoundingClientRect(); return { x: b.x + 20, y: b.y + 20 }; });
await page.mouse.move(r.x, r.y);
await page.mouse.click(r.x, r.y);
await until(() => page.evaluate(() => getComputedStyle(document.getElementById('leftover-box')).display === 'none'), 'picked element hidden');
const custom = await sw.evaluate(() => chrome.storage.local.get('custom'));
ok(custom.custom?.['news.test']?.length === 1, 'picker saved a rule for this site: ' + JSON.stringify(custom.custom));
await page.reload({ waitUntil: 'load' });
await until(() => page.evaluate(() => getComputedStyle(document.getElementById('leftover-box')).display === 'none'), 'picked element hidden after reload');
ok(await page.evaluate(() => getComputedStyle(document.getElementById('leftover-box')).display === 'none'), 'picked element stays hidden after reload');
const l2 = await sw.evaluate(id => chrome.tabs.sendMessage(id, { type: 'adtray:list' }, { frameId: 0 }), tabId);
ok(l2.customCount === 1 && l2.items.some(i => i.custom), 'tray shows the custom-hidden element');
await sw.evaluate(id => chrome.tabs.sendMessage(id, { type: 'adtray:clearCustom' }, { frameId: 0 }), tabId);
await page.reload({ waitUntil: 'load' });
await until(() => page.evaluate(() => getComputedStyle(document.getElementById('leftover-box')).display !== 'none'), 'undo picker');
ok(await page.evaluate(() => getComputedStyle(document.getElementById('leftover-box')).display !== 'none'), 'Undo brings it back');

// picker by touch (phones): first tap selects, second tap hides
const tabPage = page;
const vp = tabPage.viewport();
await tabPage.setViewport({ ...(vp || { width: 1000, height: 800 }), hasTouch: true, isMobile: true });
await tabPage.reload({ waitUntil: 'load' });
await sw.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'adtray:pick', labels: { hint: 'test' } }, { frameId: 0 }), tabId);
const r2 = await tabPage.evaluate(() => { const b = document.getElementById('leftover-2').getBoundingClientRect(); return { x: b.x + 20, y: b.y + 20 }; });
await tabPage.touchscreen.tap(r2.x, r2.y);
await new Promise((r) => setTimeout(r, 300));
ok(await tabPage.evaluate(() => getComputedStyle(document.getElementById('leftover-2')).display !== 'none'), 'touch: first tap only selects');
await tabPage.touchscreen.tap(r2.x, r2.y);
await until(() => tabPage.evaluate(() => getComputedStyle(document.getElementById('leftover-2')).display === 'none'), 'touch hide');
ok(await tabPage.evaluate(() => getComputedStyle(document.getElementById('leftover-2')).display === 'none'), 'touch: second tap hides it');
await sw.evaluate(id => chrome.tabs.sendMessage(id, { type: 'adtray:clearCustom' }, { frameId: 0 }), tabId);
await tabPage.setViewport(vp || { width: 800, height: 600 });
await tabPage.reload({ waitUntil: 'load' });

// aggressive mode: off by default, opt-in, per-site off
const vis = () => page.evaluate(() => Object.fromEntries(['ADS_99_box', 'story', 'mainnav', 'note', 'advsearch', 'csslabel', 'cssquote']
  .map((id) => [id, getComputedStyle(document.getElementById(id)).display !== 'none'])
  .concat([['pubwrap', getComputedStyle(document.querySelector('.pub-wrap')).display !== 'none']])));
let v = await vis();
ok(v.ADS_99_box && v.pubwrap && v.csslabel, 'aggressive mode is off by default');
await sw.evaluate(() => chrome.storage.local.set({ aggressive: { enabled: true, off: [] } }));
await page.reload({ waitUntil: 'load' });
await until(async () => !(await vis()).pubwrap, 'aggressive hides labelled box');
v = await vis();
ok(!v.ADS_99_box && !v.pubwrap && !v.csslabel, 'aggressive mode hides ad-slot IDs and "Publicité" boxes (text or CSS label): ' + JSON.stringify(v));
ok(v.story && v.mainnav && v.note && v.advsearch && v.cssquote, 'aggressive mode keeps article, nav, real content, forms: ' + JSON.stringify(v));
await sw.evaluate(() => chrome.storage.local.set({ aggressive: { enabled: true, off: ['news.test'] } }));
await page.reload({ waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 800));
v = await vis();
ok(v.ADS_99_box && v.pubwrap, 'aggressive mode can be switched off for one site');
await sw.evaluate(() => chrome.storage.local.remove('aggressive'));

// spoofed web address: Cyrillic "а" in "pаypal.com" (xn--pypal-4ve.com)
ok(!(await page.evaluate(() => !!document.querySelector('adtray-warning'))), 'no address warning on a normal site');
const spoof = await browser.newPage();
await spoof.goto(`http://xn--pypal-4ve.com:${PORT}/`, { waitUntil: 'load' });
await until(() => spoof.evaluate(() => !!document.querySelector('adtray-warning')), 'spoof warning shown');
ok(await spoof.evaluate(() => !!document.querySelector('adtray-warning')), 'warning shown on a fake "paypal" address');
ok(await spoof.evaluate(() => document.querySelector('adtray-warning').shadowRoot === null), 'warning is in a closed shadow root (page cannot click it)');
const spoofTab = await sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
const spoofInfo = await sw.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'adtray:list' }, { frameId: 0 }), spoofTab);
ok(spoofInfo.domain.risk === 'high' && spoofInfo.domain.unicode === 'pаypal.com', 'tray gets the decoded address: ' + spoofInfo.domain.unicode);
await sw.evaluate(() => chrome.storage.local.set({ trustedHosts: ['xn--pypal-4ve.com'] }));
await spoof.reload({ waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 600));
ok(!(await spoof.evaluate(() => !!document.querySelector('adtray-warning'))), '"I know this site" keeps it quiet next time');
await sw.evaluate(() => chrome.storage.local.set({ trustedHosts: [], domainCheck: false }));
await spoof.reload({ waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 600));
ok(!(await spoof.evaluate(() => !!document.querySelector('adtray-warning'))), 'address warnings can be switched off');
await sw.evaluate(() => chrome.storage.local.remove(['trustedHosts', 'domainCheck']));
await spoof.close();
await page.bringToFront();

// rare Latin letters (no list needed): "ɑpple-support.com" with IPA "ɑ"
const rare = await browser.newPage();
await rare.goto(`http://xn--pple-support-z6e.com:${PORT}/`, { waitUntil: 'load' });
await until(() => rare.evaluate(() => !!document.querySelector('adtray-warning')), 'rare-latin warning');
ok(await rare.evaluate(() => !!document.querySelector('adtray-warning')), 'red warning for rare look-alike letters (ɑpple-support.com)');
await rare.close();

// accented name (café.fr): quiet while reading, note when typing a password
const acc = await browser.newPage();
await acc.goto(`http://xn--caf-dma.fr:${PORT}/login.html`, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 600));
ok(!(await acc.evaluate(() => !!document.querySelector('adtray-warning'))), 'accented address: no warning while just reading');
await acc.focus('#user');
await new Promise((r) => setTimeout(r, 300));
ok(!(await acc.evaluate(() => !!document.querySelector('adtray-warning'))), 'accented address: no warning on a normal field');
await acc.focus('#pw');
await until(() => acc.evaluate(() => !!document.querySelector('adtray-warning')), 'login note');
ok(await acc.evaluate(() => !!document.querySelector('adtray-warning')), 'accented address: note appears when focusing the password field');
await acc.close();

// plain a-z address: never the note
const plain = await browser.newPage();
await plain.goto(`http://news.test:${PORT}/login.html`, { waitUntil: 'load' });
await plain.focus('#pw');
await new Promise((r) => setTimeout(r, 400));
ok(!(await plain.evaluate(() => !!document.querySelector('adtray-warning'))), 'plain a-z address: no note on password field');
await plain.close();
await page.bringToFront();

// pause site
await sw.evaluate(() => chrome.storage.local.set({ paused: ['news.test'] }));
await until(async () => (await dynamicRules()) === 1, 'pause rule added');
hits.length = 0;
await page.reload({ waitUntil: 'load' });
await until(() => page.evaluate(() => getComputedStyle(document.getElementById('AdBox2')).display !== 'none'), 'page unhidden when paused');
const p2 = await page.evaluate(() => ({ ad: !!window.adLoaded, adbox: getComputedStyle(document.getElementById('AdBox2')).display }));
ok(p2.ad && p2.adbox !== 'none', 'paused site: nothing blocked or hidden');
await sw.evaluate(() => chrome.storage.local.set({ paused: [] }));
await until(async () => (await dynamicRules()) === 0, 'pause rule removed');
await page.reload({ waitUntil: 'load' });
ok(!(await page.evaluate(() => !!window.adLoaded)), 'resumed: blocking back on');

// real-world-ish performance: time to insert all generic rules
const perf = await page.evaluate(() => document.getElementById('adtray-style')?.sheet.cssRules.length);
console.log('css rule groups:', perf);
await browser.close(); server.close();
