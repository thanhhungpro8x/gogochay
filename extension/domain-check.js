// GoGoChay — offline check for spoofed domain names ("homograph" / lookalike attacks).
//
// Looks only at the hostname of the page you are on (after any redirects). Nothing is
// sent anywhere. Flags, from strongest to weakest:
//   * mixed-script  — one label mixes alphabets, e.g. Latin "p" + Cyrillic "а" in "pаypal"
//   * lookalike     — the name only *looks like* a well-known site (pаypal, paypa1, rnicrosoft)
//   * whole-script  — a label written entirely with non-Latin letters that mimic Latin ones
//   * subdomain     — a well-known domain used as a prefix: paypal.com.secure-login.xyz
// Works in the browser (content script) and in Node (unit tests).

(function (root) {
  // ---- punycode (RFC 3492) decoder: "xn--pypal-4ve" → "pаypal" ------------------
  function decodePunycode(input) {
    const base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700;
    let n = 128, i = 0, bias = 72;
    const out = [];
    let basic = input.lastIndexOf('-');
    if (basic < 0) basic = 0;
    for (let j = 0; j < basic; j++) out.push(input.charCodeAt(j));
    const adapt = (delta, numPoints, first) => {
      delta = first ? Math.floor(delta / damp) : delta >> 1;
      delta += Math.floor(delta / numPoints);
      let k = 0;
      while (delta > ((base - tMin) * tMax) >> 1) { delta = Math.floor(delta / (base - tMin)); k += base; }
      return k + Math.floor(((base - tMin + 1) * delta) / (delta + skew));
    };
    for (let idx = basic > 0 ? basic + 1 : 0; idx < input.length;) {
      const oldi = i;
      for (let w = 1, k = base; ; k += base) {
        if (idx >= input.length) throw new Error('bad punycode');
        const c = input.charCodeAt(idx++);
        const digit = c - 48 < 10 ? c - 22 : c - 65 < 26 ? c - 65 : c - 97 < 26 ? c - 97 : base;
        if (digit >= base) throw new Error('bad punycode');
        i += digit * w;
        const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
        if (digit < t) break;
        w *= base - t;
      }
      bias = adapt(i - oldi, out.length + 1, oldi === 0);
      n += Math.floor(i / (out.length + 1));
      i %= out.length + 1;
      out.splice(i++, 0, n);
    }
    return String.fromCodePoint(...out);
  }

  function toUnicode(hostname) {
    return hostname.toLowerCase().split('.').map((l) => {
      if (!l.startsWith('xn--')) return l;
      try { return decodePunycode(l.slice(4)); } catch { return l; }
    }).join('.');
  }

  // ---- scripts and confusables ------------------------------------------------------
  const SCRIPTS = ['Latin', 'Cyrillic', 'Greek', 'Armenian', 'Georgian', 'Cherokee', 'Han', 'Hiragana', 'Katakana', 'Hangul', 'Arabic', 'Hebrew', 'Thai', 'Devanagari'];
  const SCRIPT_RE = Object.fromEntries(SCRIPTS.map((s) => [s, new RegExp(`\\p{Script=${s}}`, 'u')]));
  // combinations real languages use inside one label
  const ALLOWED_MIX = [
    ['Latin', 'Han', 'Hiragana', 'Katakana'], // Japanese
    ['Latin', 'Han', 'Hangul'],               // Korean
    ['Latin', 'Han'],                         // Chinese
  ];

  function scriptOf(ch) {
    if (/[0-9\-]/.test(ch)) return null; // digits and hyphen are neutral
    for (const s of SCRIPTS) if (SCRIPT_RE[s].test(ch)) return s;
    return 'Other';
  }

  // Latin-script letters outside what real languages write (IPA, phonetic small capitals,
  // Latin Extended-D, letterlike symbols, Roman numerals).
  function isRareLatin(ch) {
    const cp = ch.codePointAt(0);
    return (cp >= 0x0250 && cp <= 0x02af) // IPA extensions: ɑ ɡ ɩ ʟ …
      || (cp >= 0x1d00 && cp <= 0x1dbf)   // phonetic extensions: ᴏ ᴄ ᴠ ᴡ ᴢ …
      || (cp >= 0xa720 && cp <= 0xa7ff)   // Latin extended-D: ꞁ ꜱ …
      || (cp >= 0x2100 && cp <= 0x218f)   // letterlike symbols & number forms: ℓ ⅼ ⅰ …
      || ch === 'ȷ';
  }

  function scriptsIn(label) {
    const set = new Set();
    for (const ch of label) { const s = scriptOf(ch); if (s) set.add(s); }
    return [...set];
  }

  // Non-Latin (and odd Latin) letters that look like plain a-z.
  const CONFUSABLE = {
    // Cyrillic
    а: 'a', в: 'b', е: 'e', ё: 'e', һ: 'h', і: 'i', ї: 'i', ј: 'j', к: 'k', ӏ: 'l', м: 'm', н: 'h', о: 'o',
    р: 'p', с: 'c', ѕ: 's', т: 't', у: 'y', х: 'x', ԁ: 'd', ԛ: 'q', ԝ: 'w', ь: 'b', ү: 'y', ɡ: 'g',
    // Greek
    α: 'a', β: 'b', ε: 'e', η: 'n', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', ω: 'w', ϲ: 'c', ϳ: 'j',
    // Armenian
    օ: 'o', ս: 'u', հ: 'h', ո: 'n', ց: 'g', զ: 'q',
    // Latin lookalikes / special forms
    ı: 'i', ȷ: 'j', ɑ: 'a', ᴀ: 'a', ʙ: 'b', ᴅ: 'd', ᴇ: 'e', ɢ: 'g', ʜ: 'h', ɪ: 'i', ᴊ: 'j', ᴋ: 'k', ᴍ: 'm', ɴ: 'n', ᴘ: 'p', ʀ: 'r', ᴛ: 't', ᴜ: 'u', ʏ: 'y', ɩ: 'i', ʟ: 'l', ⅼ: 'l', ⅰ: 'i', ℓ: 'l', ꞁ: 'l', ꜱ: 's', ᴏ: 'o', ᴄ: 'c', ᴠ: 'v', ᴡ: 'w', ᴢ: 'z',
  };

  // What a label "looks like": strip accents, map confusables, fold common ASCII tricks.
  function skeleton(label) {
    let s = '';
    for (const ch of label.normalize('NFKD').replace(/\p{M}/gu, '')) s += CONFUSABLE[ch] ?? ch;
    return s.replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/cl/g, 'd')
      .replace(/0/g, 'o').replace(/1/g, 'l').replace(/!/g, 'i').replace(/i/g, 'l');
  }

  // ---- well-known sites people get phished for (label → shown as) ------------------
  const BRANDS = [
    // global
    'google', 'gmail', 'youtube', 'facebook', 'instagram', 'whatsapp', 'messenger', 'apple', 'icloud', 'microsoft',
    'outlook', 'office', 'live', 'hotmail', 'amazon', 'paypal', 'netflix', 'github', 'gitlab', 'linkedin', 'twitter',
    'binance', 'coinbase', 'kraken', 'metamask', 'dropbox', 'adobe', 'spotify', 'steampowered', 'steamcommunity', 'ebay',
    'booking', 'airbnb', 'yahoo', 'tiktok', 'telegram', 'discord', 'openai', 'chatgpt', 'anthropic', 'claude', 'docusign',
    'wetransfer', 'revolut', 'wise', 'stripe', 'shopify', 'dhl', 'fedex', 'ups',
    // France
    'ameli', 'impots', 'laposte', 'labanquepostale', 'franceconnect', 'ants', 'caf', 'service-public', 'bnpparibas',
    'societegenerale', 'credit-agricole', 'creditagricole', 'boursorama', 'lcl', 'caisse-epargne', 'creditmutuel',
    'orange', 'free', 'sfr', 'bouyguestelecom', 'leboncoin', 'doctolib', 'vinted', 'chronopost', 'colissimo', 'sncf-connect',
    // Vietnam
    'vietcombank', 'techcombank', 'vietinbank', 'bidv', 'agribank', 'mbbank', 'vpbank', 'tpbank', 'acb', 'sacombank',
    'hdbank', 'momo', 'zalopay', 'shopee', 'lazada', 'tiki', 'zalo', 'vnexpress', 'dichvucong', 'chinhphu', 'viettel',
    'vnpt', 'vneid',
  ];
  const BRAND_BY_SKELETON = new Map();
  for (const b of BRANDS) if (!BRAND_BY_SKELETON.has(skeleton(b))) BRAND_BY_SKELETON.set(skeleton(b), b);

  const MULTI_SUFFIX = new Set(['co.uk', 'org.uk', 'ac.uk', 'com.vn', 'net.vn', 'org.vn', 'edu.vn', 'gov.vn', 'gouv.fr',
    'com.au', 'net.au', 'co.jp', 'ne.jp', 'or.jp', 'co.kr', 'com.br', 'com.cn', 'com.sg', 'co.nz', 'com.tr', 'co.in', 'github.io']);
  const TLD_LIKE = /^(com|net|org|fr|vn|io|co|uk|de|be|ch|eu|info|app|dev)$/;

  function registrable(labels) {
    const last2 = labels.slice(-2).join('.');
    const n = MULTI_SUFFIX.has(last2) && labels.length >= 3 ? 3 : 2;
    return { name: labels[labels.length - n] || '', domain: labels.slice(-n).join('.'), sub: labels.slice(0, -n) };
  }

  /**
   * @returns {{ host, unicode, risk: 'none'|'warn'|'high', reasons: Array<{type, label, looksLike?, chars?}> }}
   */
  function check(hostname) {
    const host = hostname.toLowerCase().replace(/\.$/, '');
    const unicode = toUnicode(host);
    const result = { host, unicode, risk: 'none', reasons: [] };
    if (/^[\d.]+$/.test(host) || !host.includes('.')) return result; // IP or local name

    const labels = unicode.split('.');
    const reg = registrable(labels);
    const bump = (r) => { if (r === 'high' || result.risk === 'none') result.risk = r; };

    for (const label of labels) {
      const scripts = scriptsIn(label).filter((s) => s !== 'Other');
      const nonAscii = [...label].filter((c) => c.charCodeAt(0) > 127);
      if (scripts.length > 1 && !ALLOWED_MIX.some((ok) => scripts.every((s) => ok.includes(s)))) {
        result.reasons.push({ type: 'mixed-script', label, scripts, chars: nonAscii.filter((c) => scriptOf(c) !== 'Latin' || CONFUSABLE[c]) });
        bump('high');
      } else if (scripts.length === 1 && scripts[0] !== 'Latin' && [...label].every((c) => CONFUSABLE[c] || /[0-9\-]/.test(c))) {
        result.reasons.push({ type: 'whole-script', label, scripts, chars: nonAscii, looksLike: [...label].map((c) => CONFUSABLE[c] ?? c).join('') });
        bump('high');
      } else {
        // Latin letters no everyday language uses (phonetic alphabet, small capitals,
        // Roman-numeral letters…): they exist in a name only to look like a-z.
        const rare = nonAscii.filter(isRareLatin);
        const dotless = nonAscii.filter((c) => c === 'ı' || c === 'ȷ');
        if (rare.length) {
          result.reasons.push({ type: 'rare-latin', label, chars: rare, looksLike: [...label].map((c) => CONFUSABLE[c] ?? c).join('') });
          bump('high');
        } else if (dotless.length && nonAscii.length === dotless.length) {
          // "ı" is a real Turkish letter, so only a softer warning when it is the sole odd letter
          result.reasons.push({ type: 'rare-latin', label, chars: dotless, looksLike: [...label].map((c) => CONFUSABLE[c] ?? c).join('') });
          bump('warn');
        }
      }
    }
    // any character outside a-z, 0-9, "-" (used for the softer "check before you log in" note)
    result.special = [...new Set([...unicode].filter((c) => c.charCodeAt(0) > 127))];

    // lookalike of a well-known name (only when the name is NOT exactly that brand)
    const brand = BRAND_BY_SKELETON.get(skeleton(reg.name));
    if (brand && reg.name !== brand) {
      result.reasons.push({ type: 'lookalike', label: reg.name, looksLike: brand, chars: [...reg.name].filter((c, i) => c !== brand[i]) });
      bump('high');
    }

    // a well-known domain written as a prefix: paypal.com.account-check.xyz
    for (let i = 0; i + 1 < reg.sub.length; i++) {
      if (BRANDS.includes(reg.sub[i]) && TLD_LIKE.test(reg.sub[i + 1]) && reg.name !== reg.sub[i]) {
        result.reasons.push({ type: 'subdomain', label: `${reg.sub[i]}.${reg.sub[i + 1]}`, looksLike: `${reg.sub[i]}.${reg.sub[i + 1]}`, realDomain: reg.domain });
        bump('warn');
        break;
      }
    }
    return result;
  }

  const api = { check, toUnicode, decodePunycode, skeleton };
  root.AdTrayDomain = api;
})(typeof self !== 'undefined' ? self : globalThis);
