// GoGoChay — content script.
// Hides ad elements with CSS and, when the tray asks, lists what it hid so the user
// can look at them or bring them back. It never sends page data anywhere: the only
// recipient of a message is the extension's own tray UI, and only while it is open.

(() => {
  if (window.__adTrayLoaded) return;
  window.__adTrayLoaded = true;

  const SHOWN_ATTR = 'data-adtray-shown';
  const CHUNK = 400;
  const COSMETIC = self.AD_TRAY_COSMETIC || { generic: [], specific: {}, exceptions: {}, genericHide: [], elemHide: [] };
  const host = location.hostname.toLowerCase();
  const isTop = window === window.top;

  // host itself + every parent domain: a.b.example.com → [a.b.example.com, b.example.com, example.com]
  const hostChain = [host];
  for (let parts = host.split('.').slice(1); parts.length >= 2; parts = parts.slice(1)) hostChain.push(parts.join('.'));
  const onList = (list) => hostChain.some((h) => list.includes(h));

  function selectorsForPage() {
    if (onList(COSMETIC.elemHide)) return [];
    const set = new Set(onList(COSMETIC.genericHide) ? [] : COSMETIC.generic);
    for (const h of hostChain) for (const s of COSMETIC.specific[h] || []) set.add(s);
    for (const h of hostChain) for (const s of COSMETIC.exceptions[h] || []) set.delete(s);
    return [...set].filter((s) => !hasTopLevelComma(s));
  }

  function hasTopLevelComma(sel) {
    let depth = 0;
    let quote = null;
    for (const ch of sel) {
      if (quote) { if (ch === quote) quote = null; continue; }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth--;
      else if (ch === ',' && depth === 0) return true;
    }
    return false;
  }

  // ---- hiding -------------------------------------------------------------
  let styleEl = null;
  let validGroups = []; // arrays of selectors known to be valid CSS (used for listing)

  function insertGroup(sheet, group) {
    const css = group.map((s) => `${s}:not([${SHOWN_ATTR}])`).join(',') + '{display:none!important}';
    try {
      sheet.insertRule(css, sheet.cssRules.length);
      validGroups.push(group);
    } catch {
      // One invalid selector invalidates the whole rule: split until we isolate it.
      if (group.length === 1) return;
      const mid = group.length >> 1;
      insertGroup(sheet, group.slice(0, mid));
      insertGroup(sheet, group.slice(mid));
    }
  }

  function ensureStyle() {
    if (styleEl) return styleEl;
    styleEl = document.createElement('style');
    styleEl.id = 'adtray-style';
    (document.head || document.documentElement).appendChild(styleEl);
    // Keep our stylesheet in place if the page rewrites <head>.
    new MutationObserver(() => {
      if (styleEl && !styleEl.isConnected) (document.head || document.documentElement).appendChild(styleEl);
    }).observe(document.documentElement, { childList: true, subtree: false });
    return styleEl;
  }

  function addSelectors(selectors) {
    if (!selectors.length) return;
    const sheet = ensureStyle().sheet;
    for (let i = 0; i < selectors.length; i += CHUNK) insertGroup(sheet, selectors.slice(i, i + CHUNK));
  }

  function applyHiding() {
    addSelectors(selectorsForPage());
  }

  function removeHiding() {
    styleEl?.remove();
    styleEl = null;
    validGroups = [];
  }

  // Elements the user hid with the picker, per site: { "example.com": ["selector", ...] }
  let customSelectors = [];

  // Hide immediately (no flash of ads), then undo if the user paused this site.
  applyHiding();
  let paused = false;
  let aggressiveOn = false;
  chrome.storage.local.get(['paused', 'custom', 'aggressive']).then(({ paused: list = [], custom = {}, aggressive = {} }) => {
    if (onList(list)) { paused = true; removeHiding(); return; }
    customSelectors = hostChain.flatMap((h) => custom[h] || []);
    addSelectors(customSelectors);
    if (aggressive.enabled && !onList(aggressive.off || [])) startAggressive();
  });

  // ---- aggressive mode (opt-in, off by default) -------------------------------
  // Hides boxes that *look* like ads even when no list knows the site: common ad-slot
  // IDs/classes, and small boxes labelled "Advertisement" / "Publicité" / "Quảng cáo"
  // that hold no real content. Can be switched off per site from the tray.
  const AGGR_ATTR = 'data-adtray-aggr';
  const AGGR_SELECTORS = [
    '[id^="ADS_"]', '[id^="ads_"]', '[id^="ad-slot"]', '[id^="ad_slot"]', '[id^="div-gpt-ad"]',
    '[id^="google_ads_iframe"]', '[class*="fixad"]', '[class*="box-adv-"]', '[class*="banner-ad"]',
    '[class*="adv-banner"]', '[class*="banner-adv"]', '[data-ad-slot]', '[data-ad-unit]', '[data-google-query-id]',
    '[class*="teads"]', '[class*="tead-"]', '[class~="publicite"]', '[class~="advertisement"]', '[class~="quangcao"]',
    `[${AGGR_ATTR}]`,
  ];
  const AD_LABEL = /^(advertisement|advertising|advert|ad|ads|annonce|publicité|publicite|pub|anzeige|werbung|pubblicità|publicidad|quảng cáo|sponsored|sponsorisé|sponsorise)$/i;
  const NOT_A_LABEL = 'a,button,nav,footer,header,label,option,select,textarea,h1,h2,h3,[role="navigation"],[contenteditable]';
  const REAL_CONTENT = 'article,nav,form,input,textarea,select,h1,h2,h3,video,[role="navigation"],[role="main"]';

  function hasRealContent(el) {
    if (el.querySelector(REAL_CONTENT)) return true;
    for (const p of el.querySelectorAll('p')) if (p.textContent.trim().length > 80) return true;
    return false;
  }

  function scanLabels() {
    if (!document.body) return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.textContent.length < 30 && AD_LABEL.test(n.textContent.trim()) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const label = n.parentElement;
      if (!label || label.closest(`[${AGGR_ATTR}],${NOT_A_LABEL}`)) continue;
      const labelLen = n.textContent.trim().length;
      let box = null;
      // climb while the ancestor holds nothing but the label (and empty ad markup)
      for (let cur = label.parentElement, i = 0; cur && cur !== document.body && i < 4; cur = cur.parentElement, i++) {
        const extra = cur.textContent.replace(/\s+/g, ' ').trim().length - labelLen;
        if (extra > 40 || hasRealContent(cur)) break;
        if (cur.getBoundingClientRect().height > 1200) break;
        box = cur;
      }
      if (box) box.setAttribute(AGGR_ATTR, '');
    }
    // labels drawn with CSS, e.g. an empty box with ::before { content: "Publicité" }
    for (const el of document.body.querySelectorAll('div,section,aside,span,ins')) {
      if (pseudoChecked.has(el) || el.childElementCount > 5 || el.textContent.length > 40) continue;
      pseudoChecked.add(el);
      const lab = pseudoLabel(el);
      if (lab && AD_LABEL.test(lab) && !el.closest(NOT_A_LABEL) && !hasRealContent(el)) el.setAttribute(AGGR_ATTR, '');
    }
  }

  const pseudoChecked = new WeakSet();
  function pseudoLabel(el) {
    let text = '';
    for (const ps of ['::before', '::after']) {
      const c = getComputedStyle(el, ps).content;
      if (c && c !== 'none' && c !== 'normal') text += (c.match(/"([^"]*)"/g) || []).map((x) => x.slice(1, -1)).join('');
    }
    return text.trim();
  }

  function startAggressive() {
    aggressiveOn = true;
    addSelectors(AGGR_SELECTORS);
    let timer = null;
    const schedule = () => { clearTimeout(timer); timer = setTimeout(scanLabels, 400); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scanLabels, { once: true });
    else scanLabels();
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  }

  if (!isTop) return; // the tray only talks to the top frame

  // ---- spoofed-domain warning --------------------------------------------------
  // Checks the address of the page you actually landed on (after redirects) for
  // lookalike / mixed-alphabet tricks. Runs locally; see domain-check.js.
  const domainResult = self.AdTrayDomain ? self.AdTrayDomain.check(location.hostname) : { risk: 'none', reasons: [] };
  let strings = null; // set when the language isn't the one chrome.i18n picked (tray choice, fr-CA…)
  const msg = (key, subs) => self.AdTrayLang?.format(strings, key, subs) ?? (chrome.i18n.getMessage(key, subs) || key);
  async function loadStrings() {
    const { lang = 'auto' } = await chrome.storage.local.get('lang');
    const use = self.AdTrayLang?.pick(lang);
    if (use) strings = await chrome.runtime.sendMessage({ type: 'adtray:messages', lang: use }).catch(() => null);
  }

  function showDomainWarning(r) {
    if (document.querySelector('adtray-warning')) return;
    const hostEl = document.createElement('adtray-warning');
    // closed shadow root: the page can't read or click inside the warning
    const shadow = hostEl.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; position: fixed; inset: 0 0 auto 0; z-index: 2147483647; }
      .bar { font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff;
             background: #b3261e; padding: 14px 18px; box-shadow: 0 4px 20px rgba(0,0,0,.35); }
      .bar.warn { background: #9a5b00; }
      h1 { font-size: 16px; margin: 0 0 6px; font-weight: 700; }
      p { margin: 2px 0; }
      mark { background: #fff; color: #b3261e; padding: 0 3px; border-radius: 3px; font-weight: 700; }
      code { background: rgba(0,0,0,.25); padding: 1px 5px; border-radius: 4px; font-family: ui-monospace, Menlo, monospace; }
      .actions { margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; }
      button { font: inherit; border: 0; border-radius: 6px; padding: 6px 14px; cursor: pointer; }
      .fine { font-size: 11.5px; line-height: 1.4; opacity: .85; margin-top: 10px; max-width: 900px; }
      .leave { background: #fff; color: #b3261e; font-weight: 700; }
      .stay { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.6); }`;
    const bar = document.createElement('div');
    bar.className = 'bar' + (r.risk === 'warn' ? ' warn' : '');

    const line = (parts) => {
      const p = document.createElement('p');
      for (const part of parts) {
        if (typeof part === 'string') p.append(part);
        else { const el = document.createElement(part.tag); el.textContent = part.text; p.append(el); }
      }
      return p;
    };
    // show a label with its suspicious characters highlighted
    const marked = (label, chars = []) => {
      const span = document.createElement('code');
      for (const ch of label) {
        if (chars.includes(ch)) { const m = document.createElement('mark'); m.textContent = ch; span.append(m); }
        else span.append(ch);
      }
      return span;
    };

    const title = document.createElement('h1');
    const brand = r.reasons.find((x) => x.looksLike && x.type !== 'rare-latin')?.looksLike;
    title.textContent = r.login ? msg('loginTitle')
      : r.risk === 'high' ? msg(brand ? 'spoofTitleBrand' : 'spoofTitle', brand ? [brand] : undefined) : msg('spoofTitleWarn');
    bar.append(title);

    for (const reason of r.reasons) {
      const p = document.createElement('p');
      if (reason.type === 'mixed-script') {
        p.append(marked(reason.label, reason.chars), ' ', msg('spoofMixed', [reason.scripts.join(' + ')]));
      } else if (reason.type === 'whole-script') {
        p.append(marked(reason.label, reason.chars), ' ', msg('spoofWhole', [reason.scripts[0], reason.looksLike]));
      } else if (reason.type === 'lookalike') {
        p.append(marked(reason.label, reason.chars), ' ', msg('spoofLookalike', [reason.looksLike]));
      } else if (reason.type === 'rare-latin') {
        p.append(marked(reason.label, reason.chars), ' ', msg('spoofRare', [reason.looksLike]));
      } else if (reason.type === 'special') {
        p.append(marked(reason.label, reason.chars), ' ', msg('loginSpecial'));
      } else if (reason.type === 'subdomain') {
        p.append(msg('spoofSubdomain', [reason.label, reason.realDomain]));
      }
      bar.append(p);
    }
    bar.append(line([msg('spoofRealAddress') + ' ', { tag: 'code', text: r.host }]));

    const actions = document.createElement('div');
    actions.className = 'actions';
    const leave = document.createElement('button');
    leave.className = 'leave';
    leave.textContent = msg('spoofLeave');
    leave.addEventListener('click', () => {
      if (history.length > 1) history.back();
      else location.replace('about:blank');
    });
    const stay = document.createElement('button');
    stay.className = 'stay';
    stay.textContent = msg('spoofTrust');
    stay.addEventListener('click', async () => {
      const { trustedHosts = [] } = await chrome.storage.local.get('trustedHosts');
      await chrome.storage.local.set({ trustedHosts: [...new Set([...trustedHosts, host])] });
      hostEl.remove();
    });
    actions.append(leave, stay);
    bar.append(actions);
    const fine = document.createElement('p');
    fine.className = 'fine';
    fine.textContent = msg('spoofDisclaimer');
    bar.append(fine);

    shadow.append(style, bar);
    document.documentElement.append(hostEl);
  }

  chrome.storage.local.get(['domainCheck', 'trustedHosts']).then(async ({ domainCheck = true, trustedHosts = [] }) => {
    if (!domainCheck || trustedHosts.includes(host)) return;
    if (domainResult.risk !== 'none' || domainResult.special?.length) await loadStrings();
    if (domainResult.risk !== 'none') { showDomainWarning(domainResult); return; }
    // Softer note: the name has characters outside a-z (often legitimate, e.g. accents),
    // so say nothing while reading, but remind the user when they start typing a password
    // or card number on this site.
    if (!domainResult.special?.length) return;
    const SENSITIVE = 'input[type="password"], input[autocomplete~="cc-number"], input[autocomplete~="current-password"], input[name*="card" i], input[id*="card" i]';
    const onFocus = (e) => {
      if (!(e.target instanceof HTMLInputElement) || !e.target.matches(SENSITIVE)) return;
      document.removeEventListener('focusin', onFocus, true);
      const labels = domainResult.unicode.split('.').filter((l) => [...l].some((c) => domainResult.special.includes(c)));
      showDomainWarning({
        host: domainResult.host, risk: 'warn', login: true,
        reasons: labels.map((label) => ({ type: 'special', label, chars: domainResult.special })),
      });
    };
    document.addEventListener('focusin', onFocus, true);
  });

  // ---- tray: listing hidden elements ----------------------------------------
  const items = new Map(); // id -> element
  let nextId = 1;

  function hostOf(url) {
    try { return new URL(url, location.href).hostname; } catch { return ''; }
  }

  function describe(el) {
    const link = el.matches('a[href]') ? el : el.querySelector('a[href]');
    const frame = el.matches('iframe[src]') ? el : el.querySelector('iframe[src]');
    const img = el.matches('img') ? el : el.querySelector('img');
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const w = el.getAttribute('width') || frame?.getAttribute('width') || img?.getAttribute('width') || '';
    const h = el.getAttribute('height') || frame?.getAttribute('height') || img?.getAttribute('height') || '';
    return {
      tag: el.tagName.toLowerCase(),
      ident: (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
      linkHost: link ? hostOf(link.getAttribute('href')) : '',
      frameHost: frame ? hostOf(frame.getAttribute('src')) : '',
      imgAlt: img?.getAttribute('alt')?.slice(0, 80) || '',
      text,
      size: w && h ? `${w}×${h}` : '',
    };
  }

  function collect() {
    if (!styleEl) return [];
    const found = new Set();
    for (const group of validGroups) {
      try { for (const el of document.querySelectorAll(group.join(','))) found.add(el); } catch { /* skip */ }
    }
    // keep only outermost elements (an ad container, not every child inside it)
    const outer = [...found].filter((el) => {
      for (let p = el.parentElement; p; p = p.parentElement) if (found.has(p)) return false;
      return true;
    });
    const result = [];
    for (const el of outer) {
      let id = [...items].find(([, e]) => e === el)?.[0];
      if (!id) { id = nextId++; items.set(id, el); }
      const custom = customSelectors.some((sel) => { try { return el.matches(sel); } catch { return false; } });
      result.push({ id, shown: el.hasAttribute(SHOWN_ATTR), custom, ...describe(el) });
    }
    return result;
  }

  function locate(el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const prev = el.style.outline;
    el.style.outline = '3px solid #1b7f4a';
    setTimeout(() => { el.style.outline = prev; }, 2000);
  }


  // ---- picker: let the user hide something the lists missed -----------------
  // Builds a CSS selector for the clicked element and saves it for this site only.
  const isStable = (token) => token.length < 40 && !/\d{3,}/.test(token) && !/^(css|sc|jsx|emotion|svelte)-/.test(token);

  function selectorPart(el) {
    if (el.id && isStable(el.id)) return '#' + CSS.escape(el.id);
    const classes = [...el.classList].filter(isStable).slice(0, 3);
    return el.tagName.toLowerCase() + classes.map((c) => '.' + CSS.escape(c)).join('');
  }

  function count(sel) {
    try { return document.querySelectorAll(sel).length; } catch { return Infinity; }
  }

  function makeSelector(el) {
    const parts = [];
    for (let cur = el; cur && cur !== document.body && cur !== document.documentElement && parts.length < 5; cur = cur.parentElement) {
      parts.unshift(selectorPart(cur));
      const sel = parts.join(' > ');
      if (count(sel) === 1) return sel;
    }
    // still ambiguous: pin the clicked element by its position among siblings
    const idx = [...el.parentElement.children].filter((c) => c.tagName === el.tagName).indexOf(el) + 1;
    parts[parts.length - 1] += `:nth-of-type(${idx})`;
    return parts.join(' > ');
  }

  let picking = null;

  function stopPicker() {
    if (!picking) return;
    for (const n of picking.nodes) n.remove();
    document.removeEventListener('keydown', picking.onKey, true);
    picking = null;
  }

  // labels come from the tray (in the language the user picked there)
  function startPicker(labels = {}) {
    stopPicker();
    const z = '2147483647';
    const shield = document.createElement('div');
    shield.style.cssText = `position:fixed;inset:0;z-index:${z};cursor:crosshair;background:transparent;touch-action:none`;
    const box = document.createElement('div');
    box.style.cssText = `position:fixed;z-index:${z};pointer-events:none;border:2px solid #1b7f4a;background:rgba(27,127,74,.18);border-radius:3px;transition:all .05s`;

    // toolbar in a closed shadow root so page styles/scripts can't touch it
    const bar = document.createElement('adtray-picker');
    bar.style.cssText = `position:fixed;z-index:${z};left:50%;top:12px;transform:translateX(-50%);max-width:calc(100vw - 16px)`;
    const shadow = bar.attachShadow({ mode: 'closed' });
    const css = document.createElement('style');
    css.textContent = `
      .t { font: 13px/1.4 system-ui, -apple-system, sans-serif; color: #fff; background: #1d1d22; padding: 8px 10px;
           border-radius: 10px; box-shadow: 0 4px 16px rgba(0,0,0,.3); display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
      span { padding: 0 4px; }
      button { font: inherit; color: #fff; background: #3a3a44; border: 0; border-radius: 6px; padding: 6px 10px; min-height: 32px; cursor: pointer; }
      button.ok { background: #1b7f4a; }`;
    const t = document.createElement('div');
    t.className = 't';
    const hint = document.createElement('span');
    hint.textContent = labels.hint || 'Click/tap what you want to hide';
    const btn = (text, cls, fn) => {
      const b = document.createElement('button');
      b.textContent = text;
      if (cls) b.className = cls;
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      return b;
    };
    let target = null;
    const draw = () => {
      if (!target) return;
      const r = target.getBoundingClientRect();
      Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    };
    const up = () => {
      if (target?.parentElement && target.parentElement !== document.body) { target = target.parentElement; draw(); }
    };
    const confirm = async () => {
      if (!target) return;
      const sel = makeSelector(target);
      stopPicker();
      const { custom = {} } = await chrome.storage.local.get('custom');
      custom[host] = [...new Set([...(custom[host] || []), sel])];
      await chrome.storage.local.set({ custom });
      customSelectors.push(sel);
      addSelectors([sel]);
      chrome.runtime.sendMessage({ type: 'adtray:changed' }).catch(() => {});
    };
    t.append(hint, btn(labels.parent || '↑', '', up), btn(labels.hide || '✓', 'ok', confirm), btn(labels.cancel || '✕', '', stopPicker));
    shadow.append(css, t);

    const ours = new Set([shield, box, bar]);
    const at = (x, y) => document.elementsFromPoint(x, y)
      .find((n) => !ours.has(n) && n !== document.documentElement && n !== document.body);

    // mouse: hover to aim, click to hide. touch/pen: tap to select, tap again (or ✓) to hide.
    let pointerType = 'mouse';
    shield.addEventListener('pointerdown', (e) => { pointerType = e.pointerType || 'mouse'; });
    shield.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const el = at(e.clientX, e.clientY);
      if (el && el !== target) { target = el; draw(); }
    });
    shield.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const el = at(e.clientX, e.clientY);
      if (pointerType !== 'mouse' && el && el !== target) { target = el; draw(); return; }
      if (!target && el) target = el;
      confirm();
    }, true);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); stopPicker(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); up(); }
      else if (e.key === 'Enter') { e.preventDefault(); confirm(); }
    };
    document.addEventListener('keydown', onKey, true);
    document.documentElement.append(shield, box, bar);
    picking = { nodes: [shield, box, bar], onKey };
  }

  async function clearCustom() {
    const { custom = {} } = await chrome.storage.local.get('custom');
    for (const h of hostChain) delete custom[h];
    await chrome.storage.local.set({ custom });
  }

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    // Only our own extension can send runtime messages here; pages cannot.
    switch (msg?.type) {
      case 'adtray:list':
        reply({ host, active: !paused, aggressive: aggressiveOn, customCount: customSelectors.length, domain: domainResult, items: collect() });
        break;
      case 'adtray:show': {
        const el = items.get(msg.id);
        if (el) { el.setAttribute(SHOWN_ATTR, ''); locate(el); }
        reply({ ok: !!el });
        break;
      }
      case 'adtray:hide': {
        const el = items.get(msg.id);
        el?.removeAttribute(SHOWN_ATTR);
        reply({ ok: !!el });
        break;
      }
      case 'adtray:showAll':
        for (const el of items.values()) el.setAttribute(SHOWN_ATTR, '');
        reply({ ok: true });
        break;
      case 'adtray:hideAll':
        for (const el of items.values()) el.removeAttribute(SHOWN_ATTR);
        reply({ ok: true });
        break;
      case 'adtray:pick':
        startPicker(msg.labels || { hint: msg.hint });
        reply({ ok: true });
        break;
      case 'adtray:clearCustom':
        clearCustom().then(() => reply({ ok: true }));
        return true; // async reply
      default:
        return false;
    }
    return false;
  });
})();
