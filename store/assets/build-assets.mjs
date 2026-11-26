#!/usr/bin/env node
// Builds the store images from the REAL extension running in Chrome, on fictional demo
// pages (store/assets/demo). All hostnames resolve to 127.0.0.1: nothing real is contacted.
//
//   CHROME_PATH=/path/to/chrome node store/assets/build-assets.mjs
//
// Output (store/assets/out/):
//   <lang>/1-tray.png … 5-privacy.png   1280x800 screenshots (en, vi, fr)
//   promo-small-440x280.png, promo-marquee-1400x560.png, icon-128.png

import http from 'node:http';
import { readFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const EXT = path.join(root, 'extension');
const OUT = path.join(here, 'out');
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- tiny server for the demo pages --------------------------------------------
const server = http.createServer(async (req, res) => {
  const name = req.url.split('?')[0].split('/').pop() || 'news.html';
  try {
    let body = await readFile(path.join(here, 'demo', name));
    if (name.endsWith('.html')) body = body.toString().replaceAll('__PORT__', String(server.address().port));
    res.writeHead(200, { 'content-type': name.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

// ---- copy for the left-hand panel of each screenshot ------------------------------
const COPY = {
  en: {
    tray: ['Ads gone. And you can see where they went.', 'Hidden ads are collected in a tray: check them, or bring one back if a page breaks.'],
    red: ['Spots fake web addresses', '“pаypal.com” with a Cyrillic “а”? A red bar shows the fake letters and the site you are really on.'],
    yellow: ['A reminder before you type a password', 'Unusual characters in the address? GoGoChay quietly checks with you before you log in.'],
    pick: ['Something slipped through? Click it away.', 'Pick any leftover box on the page and it stays hidden on that site. Works with a finger too.'],
    priv: ['Private by design', 'No data leaves your device. Open source, minimal permissions, in English, Vietnamese and French.'],
  },
  vi: {
    tray: ['Quảng cáo biến mất, và bạn biết chúng đi đâu.', 'Quảng cáo bị ẩn được gom vào một khay: xem lại, hoặc hiện lại nếu trang bị vỡ.'],
    red: ['Lật mặt địa chỉ giả', '“pаypal.com” với chữ “а” Kirin? Thanh đỏ tô chữ giả và cho biết tên trang bạn đang truy cập.'],
    yellow: ['Nhắc bạn trước khi nhập mật khẩu', 'Địa chỉ có ký tự lạ? GoGoChay nhắc nhẹ bạn trước khi đăng nhập.'],
    pick: ['Còn sót? Bấm một cái là ẩn.', 'Chọn bất kỳ khung nào còn sót trên trang, nó sẽ được ẩn trên trang đó. Dùng ngón tay cũng được.'],
    priv: ['Riêng tư từ thiết kế', 'Không dữ liệu nào rời khỏi máy bạn. Mã nguồn mở, quyền tối thiểu, có tiếng Việt, Anh, Pháp.'],
  },
  fr: {
    tray: ['Les pubs disparaissent. Et vous voyez où elles sont rangées.', 'Les pubs masquées sont rangées dans un plateau : à consulter, ou à réafficher si une page casse.'],
    red: ['Démasque les fausses adresses', '« pаypal.com » avec un « а » cyrillique ? Une barre rouge surligne les fausses lettres et indique le site réellement consulté.'],
    yellow: ['Un rappel avant de saisir un mot de passe', 'Des caractères inhabituels dans l’adresse ? GoGoChay vous le signale avant de vous connecter.'],
    pick: ['Un oubli ? Un clic et c’est masqué.', 'Choisissez un bloc restant sur la page : il reste masqué sur ce site. Fonctionne aussi au doigt.'],
    priv: ['Privé par conception', 'Aucune donnée ne quitte votre appareil. Open source, permissions minimales, en français, anglais et vietnamien.'],
  },
};

const icon = `data:image/png;base64,${(await readFile(path.join(EXT, 'icons/icon128.png'))).toString('base64')}`;
const b64 = (buf) => `data:image/png;base64,${buf.toString('base64')}`;

async function compose(browser, file, [title, sub], shots) {
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} body{margin:0;width:1280px;height:800px;display:flex;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden}
    .l{width:430px;background:#1b7f4a;color:#fff;padding:56px 44px;display:flex;flex-direction:column}
    .b{display:flex;align-items:center;gap:12px;font-weight:700;font-size:22px} .b img{width:44px;height:44px;border-radius:10px;box-shadow:0 0 0 2px rgba(255,255,255,.35)}
    h1{font-size:38px;line-height:1.15;margin:110px 0 22px} p{font-size:19px;line-height:1.5;margin:0;opacity:.92}
    .r{flex:1;background:#eef3ef;position:relative;overflow:hidden}
    .s{position:absolute;border-radius:12px;box-shadow:0 14px 40px rgba(0,0,0,.18);background:#fff;overflow:hidden}
    .s img{display:block;width:100%}
  </style></head><body>
    <div class="l"><div class="b"><img src="${icon}">GoGoChay</div><h1></h1><p></p></div>
    <div class="r">${shots.map((s) => `<div class="s" style="${s.style}"><img src="${s.src}"></div>`).join('')}</div>
  </body></html>`);
  await p.$eval('h1', (el, t) => { el.textContent = t; }, title);
  await p.$eval('p', (el, t) => { el.textContent = t; }, sub);
  await sleep(150);
  await p.screenshot({ path: file });
  await p.close();
}

await mkdir(OUT, { recursive: true });

for (const lang of ['en', 'vi', 'fr']) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true, enableExtensions: [EXT],
    args: ['--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP * 127.0.0.1', `--lang=${lang}`, '--hide-scrollbars'],
  });
  const sw = await (await browser.waitForTarget((t) => t.type() === 'service_worker')).worker();
  await sleep(800);
  for (const t of await browser.targets()) if (t.url().includes('welcome.html')) { const w = await t.asPage(); await w.close(); }
  await sw.evaluate((l) => chrome.storage.local.set({ lang: l }), lang);

  // 1) news page + tray
  const news = await browser.newPage();
  await news.setViewport({ width: 860, height: 800 });
  await news.goto(`http://news.example:${PORT}/news.html?l=${lang}`, { waitUntil: 'load' });
  await sleep(900);
  const newsShot = await news.screenshot();
  await sw.evaluate(() => chrome.action.openPopup());
  const tray = await (await browser.waitForTarget((t) => t.url().includes('tray.html'))).asPage();
  await sleep(1200);
  const trayShot = await tray.screenshot({ captureBeyondViewport: false });
  await tray.close();
  await compose(browser, path.join(dir, '1-tray.png'), COPY[lang].tray, [
    { src: b64(newsShot), style: 'left:40px;top:60px;width:560px' },
    { src: b64(trayShot), style: 'left:470px;top:150px;width:360px' },
  ]);

  // 4) picker on a leftover "partner" block
  await sw.evaluate(async (l) => {
    const msgs = await (await fetch(chrome.runtime.getURL(`_locales/${l}/messages.json`))).json();
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await chrome.tabs.sendMessage(tab.id, { type: 'adtray:pick', labels: { hint: msgs.pickHint.message, parent: msgs.pickParent.message, hide: msgs.pickHide.message, cancel: msgs.pickCancel.message } }, { frameId: 0 });
  }, lang);
  await news.bringToFront();
  const box = await news.evaluate(() => { const r = document.getElementById('partner').getBoundingClientRect(); return { x: r.right - 24, y: r.bottom - 12 }; });
  await news.mouse.move(box.x, box.y);
  await sleep(400);
  const pickShot = await news.screenshot();
  await news.keyboard.press('Escape');
  await compose(browser, path.join(dir, '4-picker.png'), COPY[lang].pick, [{ src: b64(pickShot), style: 'left:40px;top:40px;width:770px' }]);
  await news.close();

  // 2) red bar on a fake address (Cyrillic "а")
  const red = await browser.newPage();
  await red.setViewport({ width: 980, height: 720 });
  await red.goto(`http://xn--pypal-4ve.com:${PORT}/login.html?l=${lang}`, { waitUntil: 'load' });
  await sleep(1200);
  await compose(browser, path.join(dir, '2-fake-address.png'), COPY[lang].red, [{ src: b64(await red.screenshot()), style: 'left:30px;top:70px;width:790px' }]);
  await red.close();

  // 3) yellow note when typing a password on an address with unusual characters
  const yel = await browser.newPage();
  await yel.setViewport({ width: 980, height: 720 });
  await yel.goto(`http://xn--mybnk-login-m7a.com:${PORT}/login.html?l=${lang}`, { waitUntil: 'load' });
  await sleep(600);
  await yel.focus('#pw');
  await sleep(700);
  await compose(browser, path.join(dir, '3-login-check.png'), COPY[lang].yellow, [{ src: b64(await yel.screenshot()), style: 'left:30px;top:70px;width:790px' }]);
  await yel.close();

  // 5) features page
  const w = await browser.newPage();
  await w.setViewport({ width: 1000, height: 900 });
  await w.goto(await sw.evaluate(() => chrome.runtime.getURL('welcome/welcome.html')));
  await sleep(800);
  await compose(browser, path.join(dir, '5-privacy.png'), COPY[lang].priv, [{ src: b64(await w.screenshot()), style: 'left:40px;top:40px;width:770px' }]);
  await w.close();

  // promo tiles (not localizable in the Chrome Web Store: English only)
  if (lang === 'en') {
    const p = await browser.newPage();
    for (const [W, H, file, big] of [[440, 280, 'promo-small-440x280.png', false], [1400, 560, 'promo-marquee-1400x560.png', true]]) {
      await p.setViewport({ width: W, height: H });
      await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
        body{margin:0;width:${W}px;height:${H}px;background:linear-gradient(135deg,#1b7f4a,#14653a);color:#fff;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;${big ? 'gap:70px;padding:0 90px' : 'justify-content:center;flex-direction:column;text-align:center'};box-sizing:border-box;overflow:hidden}
        img.i{width:${big ? 150 : 84}px;height:${big ? 150 : 84}px;border-radius:${big ? 32 : 18}px;box-shadow:0 0 0 3px rgba(255,255,255,.3)}
        h1{margin:${big ? 0 : '14px 0 4px'};font-size:${big ? 72 : 36}px;letter-spacing:-1px} p{margin:0;font-size:${big ? 30 : 17}px;opacity:.95}
        .t{${big ? "flex:1" : ""}} .shot{width:380px;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.35)}
      </style></head><body><img class="i" src="${icon}"><div class="t"><h1>GoGoChay</h1><p>Ads tucked away. Fakes called out.</p></div>${big ? `<img class="shot" src="${b64(trayShot)}">` : ''}</body></html>`);
      await sleep(150);
      await p.screenshot({ path: path.join(OUT, file) });
    }
    await p.close();
  }
  await browser.close();
}
await copyFile(path.join(EXT, 'icons/icon128.png'), path.join(OUT, 'icon-128.png'));
server.close();
console.log('store assets written to', path.relative(root, OUT));
