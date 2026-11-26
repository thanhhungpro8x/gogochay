// GoGoChay — which language to show. Shared by the tray, the features page and the
// in-page warnings.
//
// Rule: follow the browser's language. A French browser gets French (fr, fr-CA, fr-BE,
// fr-CH…), a Vietnamese browser Vietnamese, everything else English. The user can
// override it in the tray ("Language").
//
// The browser picks a language from _locales by itself. We only step in when it fell
// back to English although the browser's language is a regional French/Vietnamese
// variant it didn't map (e.g. "fr-CA" → we use "fr").

(function (root) {
  const LANGS = ['en', 'vi', 'fr'];

  /** @returns {'en'|'vi'|'fr'|null} a language to load ourselves, or null = use chrome.i18n as is */
  function pick(stored, i18n = root.chrome?.i18n) {
    if (LANGS.includes(stored)) return stored;                       // user's choice in the tray
    if (!i18n) return null;
    const builtIn = i18n.getMessage('langCode') || 'en';             // what the browser chose
    const ui = String(i18n.getUILanguage?.() || '').toLowerCase().split(/[-_]/)[0];
    if (builtIn === 'en' && ui !== 'en' && LANGS.includes(ui)) return ui;
    return null;
  }

  /** Same format as chrome.i18n messages.json, including $NAME$ placeholders. */
  function format(messages, key, subs = []) {
    const entry = messages?.[key];
    if (!entry) return null;
    let text = entry.message;
    const list = Array.isArray(subs) ? subs : [subs];
    for (const [name, ph] of Object.entries(entry.placeholders || {})) {
      const n = Number(String(ph.content).replace('$', '')) - 1;
      text = text.split(new RegExp(`\\$${name}\\$`, 'i')).join(list[n] ?? '');
    }
    return text;
  }

  root.AdTrayLang = { LANGS, pick, format };
})(typeof self !== 'undefined' ? self : globalThis);
