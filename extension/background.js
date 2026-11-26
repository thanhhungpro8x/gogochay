// GoGoChay — background service worker.
// Responsibilities (and nothing else):
//   * show the number of blocked requests on the toolbar badge (computed by the browser)
//   * turn the user's "paused sites" list into allow rules
// It makes no network requests and never reads page content.

const PAUSE_PRIORITY = 100; // above every EasyList rule (max 3)

async function syncPausedSites() {
  const { paused = [] } = await chrome.storage.local.get('paused');
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules: paused.map((host, i) => ({
      id: i + 1,
      priority: PAUSE_PRIORITY,
      action: { type: 'allowAllRequests' },
      condition: { requestDomains: [host], resourceTypes: ['main_frame', 'sub_frame'] },
    })),
  });
}

async function init() {
  try {
    await chrome.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: true });
  } catch {
    // Not supported in every browser (e.g. some Safari versions) — badge is optional.
  }
  try {
    await chrome.action.setBadgeBackgroundColor({ color: '#1b7f4a' });
  } catch { /* optional */ }
  await syncPausedSites();
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await init();
  // first install only: show what GoGoChay does (a local page, nothing is downloaded)
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
});
chrome.runtime.onStartup.addListener(init);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.paused) syncPausedSites();
});

// The in-page warning asks for its strings in the chosen language. Only our own
// content scripts can send this; only our own locale files are returned.
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type !== 'adtray:messages' || sender.id !== chrome.runtime.id) return false;
  if (!['en', 'vi', 'fr'].includes(msg.lang)) { reply(null); return false; }
  fetch(chrome.runtime.getURL(`_locales/${msg.lang}/messages.json`))
    .then((r) => r.json())
    .then(reply, () => reply(null));
  return true; // async reply
});
