// Ad Tray — background service worker.
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
    await chrome.action.setBadgeBackgroundColor({ color: '#5b5bd6' });
  } catch { /* optional */ }
  await syncPausedSites();
}

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.paused) syncPausedSites();
});
