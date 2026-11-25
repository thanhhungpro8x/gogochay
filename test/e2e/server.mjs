// Tiny static server for the e2e test. Listens on a free port chosen by the OS
// (or E2E_PORT if set) and writes that port into the test page.
import http from 'node:http';
import { readFile } from 'node:fs/promises';

export const hits = [];

export function start() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      hits.push(req.headers.host + req.url);
      const name = req.url.split('?')[0].split('/').pop() || 'index.html';
      try {
        let body = await readFile(new URL('./site/' + name, import.meta.url));
        if (name.endsWith('.html')) body = body.toString().replaceAll('__PORT__', String(server.address().port));
        res.writeHead(200, { 'content-type': name.endsWith('.js') ? 'text/javascript' : 'text/html' });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end();
      }
    });
    server.on('error', reject);
    server.listen(Number(process.env.E2E_PORT) || 0, '127.0.0.1', () => resolve(server));
  });
}
