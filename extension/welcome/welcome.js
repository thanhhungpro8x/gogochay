// GoGoChay — welcome / features page. Opened once after install, and from the tray.
// Text comes from _locales (same language choice as the tray). No network access.

const { LANGS } = self.AdTrayLang;
let messages = null;

const t = (key) => self.AdTrayLang.format(messages, key) ?? (chrome.i18n.getMessage(key) || key);

const { lang = 'auto' } = await chrome.storage.local.get('lang');
const use = self.AdTrayLang.pick(lang);
if (use) messages = await fetch(`../_locales/${use}/messages.json`).then((r) => r.json()).catch(() => null);
document.documentElement.lang = use || chrome.i18n.getMessage('langCode') || 'en';

for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
document.title = t('w_title');
document.getElementById('version').textContent = `v${chrome.runtime.getManifest().version}`;

const select = document.getElementById('lang');
select.value = LANGS.includes(lang) ? lang : 'auto';
select.addEventListener('change', async () => {
  await chrome.storage.local.set({ lang: select.value });
  location.reload();
});
