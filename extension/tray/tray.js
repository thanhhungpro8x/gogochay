// Ad Tray — tray UI (toolbar popup, and side panel in Chrome).
// Everything shown here comes from the current tab's content script and is rendered
// with textContent only (never innerHTML), so page content can't inject markup.

const LANGS = ['en', 'vi', 'fr'];
let messages = null; // set when the user picked a language other than the browser's

// Same format as chrome.i18n: messages.json with optional $NAME$ placeholders.
function t(key, subs = []) {
  const entry = messages?.[key];
  if (!entry) return chrome.i18n.getMessage(key, subs) || key;
  let text = entry.message;
  for (const [name, ph] of Object.entries(entry.placeholders || {})) {
    const n = Number(ph.content.replace('$', '')) - 1;
    text = text.replace(new RegExp(`\\$${name}\\$`, 'gi'), subs[n] ?? '');
  }
  return text;
}

async function loadLanguage() {
  const { lang = 'auto' } = await chrome.storage.local.get('lang');
  if (LANGS.includes(lang)) {
    messages = await fetch(`../_locales/${lang}/messages.json`).then((r) => r.json()).catch(() => null);
  }
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  const select = $('lang');
  select.value = LANGS.includes(lang) ? lang : 'auto';
  select.addEventListener('change', async () => {
    await chrome.storage.local.set({ lang: select.value });
    location.reload();
  });
}

const $ = (id) => document.getElementById(id);
const isPanel = new URLSearchParams(location.search).has('panel');
if (isPanel) document.body.classList.add('panel');

let tabId = null;
let host = '';

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function send(msg) {
  return chrome.tabs.sendMessage(tabId, msg, { frameId: 0 });
}

function line(cls, text) {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  return d;
}

function renderItem(item) {
  const li = document.createElement('li');
  li.className = 'item' + (item.shown ? ' shown' : '');

  const meta = document.createElement('div');
  meta.className = 'meta';
  const source = item.frameHost || item.linkHost;
  meta.append(line('title', source || item.ident || `<${item.tag}>`));
  const sub = [`<${item.tag}>`, item.size, source ? item.ident : ''].filter(Boolean).join(' · ');
  meta.append(line('sub', sub));
  const text = item.text || item.imgAlt;
  if (text) meta.append(line('text', text));

  const btn = document.createElement('button');
  btn.textContent = item.shown ? t('hide') : t('show');
  if (!item.shown) btn.className = 'primary';
  btn.addEventListener('click', async () => {
    await send({ type: item.shown ? 'adtray:hide' : 'adtray:show', id: item.id });
    refresh();
  });

  li.append(meta, btn);
  return li;
}

async function refresh() {
  const tab = await activeTab();
  tabId = tab?.id ?? null;
  const list = $('list');
  list.replaceChildren();
  $('empty').hidden = true;

  if (tabId == null) return;

  try {
    // Allowed for the tab the user clicked the toolbar button on (activeTab).
    const { rulesMatchedInfo } = await chrome.declarativeNetRequest.getMatchedRules({ tabId });
    $('blocked').textContent = String(rulesMatchedInfo.filter((m) => m.rule.rulesetId !== '_dynamic').length);
  } catch {
    $('blocked').textContent = '–'; // e.g. side panel after switching tabs: see the toolbar badge
  }

  let res;
  try {
    res = await send({ type: 'adtray:list' });
  } catch {
    res = null;
  }

  const { paused = [] } = await chrome.storage.local.get('paused');
  const enabled = $('enabled');

  if (!res) {
    host = '';
    $('site').textContent = t('unsupported');
    $('hidden').textContent = '–';
    enabled.disabled = true;
    enabled.checked = false;
    return;
  }

  host = res.host;
  $('site').textContent = host;
  enabled.disabled = false;
  enabled.checked = !paused.includes(host);
  $('hidden').textContent = String(res.items.length);

  if (!enabled.checked) {
    $('empty').textContent = t('pausedHere');
    $('empty').hidden = false;
  } else if (!res.items.length) {
    $('empty').textContent = t('nothingHidden');
    $('empty').hidden = false;
  } else {
    for (const item of res.items) list.append(renderItem(item));
  }
}

$('enabled').addEventListener('change', async (e) => {
  if (!host) return;
  const { paused = [] } = await chrome.storage.local.get('paused');
  const next = e.target.checked ? paused.filter((h) => h !== host) : [...new Set([...paused, host])];
  await chrome.storage.local.set({ paused: next });
  // give the background a moment to update the allow rules, then reload the page
  setTimeout(async () => {
    await chrome.tabs.reload(tabId);
    setTimeout(refresh, 800);
  }, 150);
});

$('showAll').addEventListener('click', async () => { await send({ type: 'adtray:showAll' }).catch(() => {}); refresh(); });
$('hideAll').addEventListener('click', async () => { await send({ type: 'adtray:hideAll' }).catch(() => {}); refresh(); });
$('refresh').addEventListener('click', refresh);

if (chrome.sidePanel?.open && !isPanel) {
  $('openPanel').hidden = false;
  $('openPanel').addEventListener('click', async () => {
    const tab = await activeTab();
    await chrome.sidePanel.open({ windowId: tab.windowId });
    window.close();
  });
}

if (isPanel) {
  chrome.tabs.onActivated.addListener(refresh);
  chrome.tabs.onUpdated.addListener((id, info) => {
    if (id === tabId && info.status === 'complete') refresh();
  });
}

await loadLanguage();

fetch('../data/lists-info.json')
  .then((r) => r.json())
  .then((info) => {
    const date = info.generatedAt?.slice(0, 10) || '';
    $('listsInfo').textContent = t('listsInfo', [date]);
    $('listsInfo').title = `${info.source} @ ${info.commit}`;
  })
  .catch(() => {});

refresh();
