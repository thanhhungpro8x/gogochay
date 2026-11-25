# Security

Please report vulnerabilities privately via GitHub Security Advisories
("Report a vulnerability" on the repository's Security tab) rather than in a public issue.

Design guarantees, all enforced by `scripts/verify.mjs` in CI:
* permissions limited to `declarativeNetRequest`, `storage`, `activeTab`, `sidePanel`; no host permissions
* extension pages CSP: `script-src 'self'; connect-src 'self'; object-src 'none'`
* no `eval`, `new Function`, `innerHTML`, dynamic `import()`, network APIs, cookies/history/webRequest/scripting APIs
* bundled filter data is pure data and is reproducible from the pinned EasyList commit
