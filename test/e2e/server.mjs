import http from 'node:http'; import { readFile } from 'node:fs/promises';
export const hits = [];
export function start() { return new Promise(r => { const s = http.createServer(async (req, res) => {
  hits.push(req.headers.host + req.url);
  const name = req.url.split('?')[0].split('/').pop() || 'index.html';
  try { const b = await readFile(new URL('./site/' + name, import.meta.url)); res.writeHead(200, {'content-type': name.endsWith('.js') ? 'text/javascript' : 'text/html'}); res.end(b); }
  catch { res.writeHead(404); res.end(); } }); s.listen(8080, () => r(s)); }); }
