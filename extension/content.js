// Ad Tray — content script.
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

  function applyHiding() {
    const selectors = selectorsForPage();
    if (!selectors.length) return;
    styleEl = document.createElement('style');
    styleEl.id = 'adtray-style';
    (document.head || document.documentElement).appendChild(styleEl);
    for (let i = 0; i < selectors.length; i += CHUNK) insertGroup(styleEl.sheet, selectors.slice(i, i + CHUNK));
    // Keep our stylesheet in place if the page rewrites <head>.
    new MutationObserver(() => {
      if (styleEl && !styleEl.isConnected) (document.head || document.documentElement).appendChild(styleEl);
    }).observe(document.documentElement, { childList: true, subtree: false });
  }

  function removeHiding() {
    styleEl?.remove();
    styleEl = null;
    validGroups = [];
  }

  // Hide immediately (no flash of ads), then undo if the user paused this site.
  applyHiding();
  chrome.storage.local.get('paused').then(({ paused = [] }) => {
    if (onList(paused)) removeHiding();
  });

  if (!isTop) return; // the tray only talks to the top frame

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
      result.push({ id, shown: el.hasAttribute(SHOWN_ATTR), ...describe(el) });
    }
    return result;
  }

  function locate(el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const prev = el.style.outline;
    el.style.outline = '3px solid #5b5bd6';
    setTimeout(() => { el.style.outline = prev; }, 2000);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    // Only our own extension can send runtime messages here; pages cannot.
    switch (msg?.type) {
      case 'adtray:list':
        reply({ host, active: !!styleEl, items: collect() });
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
      default:
        return false;
    }
    return false;
  });
})();
