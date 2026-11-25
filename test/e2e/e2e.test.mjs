// End-to-end test: loads the unpacked extension in Chrome for Testing and checks
// blocking, hiding, the tray, and per-site pause against a local fake 'news' site.
// All hostnames are mapped to 127.0.0.1, so no real ad server is contacted.
import puppeteer from 'puppeteer-core';
import { start, hits } from './server.mjs';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../extension');
const server = await start();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true,
  enableExtensions: [EXT],
  args: ['--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP * 127.0.0.1', '--lang=vi'],
});
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const swTarget = await browser.waitForTarget(t => t.type() === 'service_worker' && t.url().endsWith('background.js'));
const sw = await swTarget.worker();
await new Promise(r => setTimeout(r, 1500));
const page = await browser.newPage();
await page.goto('http://news.test:8080/', { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 800));
const st = await page.evaluate(() => ({
  ad: !!window.adLoaded, own: !!window.ownLoaded,
  adbox: getComputedStyle(document.getElementById('AdBox2')).display,
  ins: getComputedStyle(document.querySelector('.adsbygoogle')).display,
  banner: getComputedStyle(document.querySelector('.ad-slot')).display,
  content: getComputedStyle(document.getElementById('content')).display,
}));
ok(!st.ad, 'ad scripts blocked'); ok(st.own, 'first-party script still runs');
ok(st.adbox === 'none' && st.ins === 'none' && st.banner === 'none', 'ad elements hidden');
ok(st.content !== 'none', 'real content visible');
ok(!hits.some(h => h.startsWith('ib.adnxs.com') || h.includes('adsbygoogle')), 'blocked requests never reached server: ' + hits.join(' '));

const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
const list = await sw.evaluate(id => chrome.tabs.sendMessage(id, { type: 'adtray:list' }, { frameId: 0 }), tabId);
ok(list.items.length === 3, 'tray lists 3 hidden ads: ' + JSON.stringify(list.items.map(i => i.ident + '|' + (i.linkHost||i.frameHost))));
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

// pause site
await sw.evaluate(() => chrome.storage.local.set({ paused: ['news.test'] }));
await new Promise(r => setTimeout(r, 800));
hits.length = 0;
await page.reload({ waitUntil: 'load' }); await new Promise(r => setTimeout(r, 800));
const p2 = await page.evaluate(() => ({ ad: !!window.adLoaded, adbox: getComputedStyle(document.getElementById('AdBox2')).display }));
ok(p2.ad && p2.adbox !== 'none', 'paused site: nothing blocked or hidden');
await sw.evaluate(() => chrome.storage.local.set({ paused: [] }));
await new Promise(r => setTimeout(r, 800));
await page.reload({ waitUntil: 'load' }); await new Promise(r => setTimeout(r, 500));
ok(!(await page.evaluate(() => !!window.adLoaded)), 'resumed: blocking back on');

// real-world-ish performance: time to insert all generic rules
const perf = await page.evaluate(() => document.getElementById('adtray-style')?.sheet.cssRules.length);
console.log('css rule groups:', perf);
await browser.close(); server.close();
