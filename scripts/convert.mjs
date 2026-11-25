// Converts Adblock Plus / EasyList filter syntax into:
//   1. Chrome/Safari declarativeNetRequest (DNR) static rules (network blocking)
//   2. A cosmetic config (CSS selectors to hide, per domain)
//
// Pure functions, no dependencies, no I/O — easy to audit and unit-test.
// Rules that cannot be translated faithfully are SKIPPED (never guessed).

const RESOURCE_TYPES = {
  script: 'script',
  image: 'image',
  stylesheet: 'stylesheet',
  object: 'object',
  xmlhttprequest: 'xmlhttprequest',
  subdocument: 'sub_frame',
  ping: 'ping',
  media: 'media',
  font: 'font',
  websocket: 'websocket',
  other: 'other',
};

// Selectors using procedural / extended syntax that plain CSS cannot express.
const EXTENDED_SELECTOR = /:(-abp-|has-text|contains|xpath|style\(|remove\(|upward|matches-css|matches-attr|matches-path|min-text-length|watch-attr|others|nth-ancestor|properties|if\(|if-not)/;

const PRIORITY = { block: 1, allow: 2, important: 3 };

const isAscii = (s) => /^[\x20-\x7e]*$/.test(s);
const isPlainDomain = (d) => /^[a-z0-9.-]+$/.test(d) && d.includes('.');

/** Parse `domain=a.com|~b.com` (or cosmetic `a.com,~b.com`) into include/exclude lists. */
export function parseDomains(list, sep) {
  const include = [];
  const exclude = [];
  for (const raw of list.split(sep)) {
    const d = raw.trim().toLowerCase();
    if (!d) continue;
    const neg = d.startsWith('~');
    const name = neg ? d.slice(1) : d;
    if (!isPlainDomain(name)) return null; // wildcard (example.*) or non-ASCII: unsupported
    (neg ? exclude : include).push(name);
  }
  return { include, exclude };
}

/**
 * Parse one network filter line.
 * Returns { kind: 'rule', rule } | { kind: 'cosmeticException', domain, type } | null (skipped).
 */
export function parseNetworkFilter(line) {
  let text = line.trim();
  const isException = text.startsWith('@@');
  if (isException) text = text.slice(2);

  let pattern = text;
  let optionsText = '';
  const dollar = text.lastIndexOf('$');
  if (dollar !== -1 && !text.startsWith('/')) {
    pattern = text.slice(0, dollar);
    optionsText = text.slice(dollar + 1);
  }
  if (pattern.startsWith('/') && pattern.endsWith('/') && pattern.length > 2) return null; // regex: skipped
  if (!pattern || pattern === '*' || !isAscii(pattern)) return null;

  const condition = {};
  const resourceTypes = [];
  const excludedResourceTypes = [];
  let important = false;
  let documentLevel = false;
  const cosmeticExceptions = [];

  for (const opt of optionsText ? optionsText.split(',') : []) {
    const [rawName, value] = opt.split('=');
    const neg = rawName.startsWith('~');
    const name = neg ? rawName.slice(1) : rawName;

    if (name === 'third-party' || name === '3p') {
      condition.domainType = neg ? 'firstParty' : 'thirdParty';
    } else if (name === 'first-party' || name === '1p') {
      condition.domainType = neg ? 'thirdParty' : 'firstParty';
    } else if (RESOURCE_TYPES[name]) {
      (neg ? excludedResourceTypes : resourceTypes).push(RESOURCE_TYPES[name]);
    } else if (name === 'domain' && value) {
      const d = parseDomains(value, '|');
      if (!d) return null;
      if (d.include.length) condition.initiatorDomains = d.include;
      if (d.exclude.length) condition.excludedInitiatorDomains = d.exclude;
    } else if (name === 'match-case') {
      condition.isUrlFilterCaseSensitive = true;
    } else if (name === 'important') {
      important = true;
    } else if (name === 'document' && isException) {
      documentLevel = true;
    } else if ((name === 'elemhide' || name === 'generichide') && isException) {
      cosmeticExceptions.push(name);
    } else {
      return null; // csp, rewrite, redirect, popup, removeparam, header... unsupported → skip
    }
  }

  if (cosmeticExceptions.length) {
    // @@||site.com^$generichide → disable (generic) cosmetic hiding on that site
    const m = pattern.match(/^\|\|([a-z0-9.-]+)\^?$/i);
    if (!m) return null;
    return { kind: 'cosmeticException', domain: m[1].toLowerCase(), types: cosmeticExceptions };
  }

  if (resourceTypes.length) condition.resourceTypes = resourceTypes;
  if (excludedResourceTypes.length) condition.excludedResourceTypes = excludedResourceTypes;

  let action;
  let priority;
  if (isException) {
    priority = PRIORITY.allow;
    if (documentLevel) {
      action = { type: 'allowAllRequests' };
      condition.resourceTypes = ['main_frame', 'sub_frame'];
      delete condition.excludedResourceTypes;
    } else {
      action = { type: 'allow' };
    }
  } else {
    action = { type: 'block' };
    priority = important ? PRIORITY.important : PRIORITY.block;
  }

  const domainOnly = pattern.match(/^\|\|([a-z0-9.-]+)\^$/i);
  if (domainOnly && isPlainDomain(domainOnly[1].toLowerCase())) {
    condition.requestDomains = [domainOnly[1].toLowerCase()];
  } else {
    if (pattern.startsWith('||*')) pattern = pattern.slice(2);
    condition.urlFilter = pattern;
  }
  return { kind: 'rule', rule: { priority, action, condition } };
}

/** Parse one cosmetic (element hiding) filter. Returns null if skipped. */
export function parseCosmeticFilter(line) {
  const m = line.match(/^([^#]*)(#@#|##|#\?#|#\$#|#@\?#|#@\$#|#%#|#@%#)(.+)$/);
  if (!m) return null;
  const [, domainsText, sep, selector] = m;
  if (sep !== '##' && sep !== '#@#') return null; // extended / scriptlet syntax: skipped
  if (EXTENDED_SELECTOR.test(selector) || !isAscii(selector)) return null;
  const domains = domainsText ? parseDomains(domainsText, ',') : { include: [], exclude: [] };
  if (!domains) return null;
  return { exception: sep === '#@#', selector: selector.trim(), ...domains };
}

/** Merge rules that differ only by requestDomains into a single rule (huge size win). */
function compress(rules) {
  const groups = new Map();
  const out = [];
  for (const r of rules) {
    if (!r.condition.requestDomains) { out.push(r); continue; }
    const { requestDomains, ...rest } = r.condition;
    const key = JSON.stringify([r.priority, r.action, rest]);
    if (!groups.has(key)) groups.set(key, { priority: r.priority, action: r.action, rest, domains: new Set() });
    for (const d of requestDomains) groups.get(key).domains.add(d);
  }
  for (const g of groups.values()) {
    out.push({ priority: g.priority, action: g.action, condition: { requestDomains: [...g.domains].sort(), ...g.rest } });
  }
  return out;
}

/** Convert the full text of one or more filter lists. */
export function convertLists(text) {
  const networkRules = [];
  const generic = new Set();
  const specific = {}; // domain -> Set(selector)
  const exceptions = {}; // domain -> Set(selector)  (#@#)
  const genericExceptions = new Set(); // #@#selector with no domain
  const genericHideDomains = new Set();
  const elemHideDomains = new Set();
  const stats = { lines: 0, network: 0, cosmetic: 0, skipped: 0 };

  const add = (map, domain, sel) => (map[domain] ??= new Set()).add(sel);

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('!') || line.startsWith('[')) continue;
    stats.lines++;

    if (/#@?[#?$%]#|#@?#/.test(line) && !line.startsWith('@@') && !line.startsWith('||') && !line.startsWith('|')) {
      const c = parseCosmeticFilter(line);
      if (!c) { stats.skipped++; continue; }
      stats.cosmetic++;
      if (c.exception) {
        if (!c.include.length) genericExceptions.add(c.selector);
        for (const d of c.include) add(exceptions, d, c.selector);
      } else if (c.include.length) {
        for (const d of c.include) add(specific, d, c.selector);
      } else {
        generic.add(c.selector);
        for (const d of c.exclude) add(exceptions, d, c.selector);
      }
      continue;
    }

    const n = parseNetworkFilter(line);
    if (!n) { stats.skipped++; continue; }
    stats.network++;
    if (n.kind === 'cosmeticException') {
      if (n.types.includes('elemhide')) elemHideDomains.add(n.domain);
      if (n.types.includes('generichide')) genericHideDomains.add(n.domain);
    } else {
      networkRules.push(n.rule);
    }
  }

  for (const s of genericExceptions) generic.delete(s);

  const rules = compress(networkRules).map((r, i) => ({ id: i + 1, ...r }));
  const toObj = (map) => Object.fromEntries(Object.keys(map).sort().map((k) => [k, [...map[k]].sort()]));

  return {
    rules,
    cosmetic: {
      generic: [...generic].sort(),
      specific: toObj(specific),
      exceptions: toObj(exceptions),
      genericHide: [...genericHideDomains].sort(),
      elemHide: [...elemHideDomains].sort(),
    },
    stats: { ...stats, dnrRules: rules.length },
  };
}
