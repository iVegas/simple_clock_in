// Dependency-free static file server for local development (runs in the dev container).
// Usage: node tools/serve.mjs [root=.] [port=8000]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] ?? '.');
const port = Number(process.argv[3] ?? 8000);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    const decoded = decodeURIComponent(pathname);
    let file = normalize(join(root, decoded));
    // No path traversal, no dotfiles (.git, .idea, ...).
    if ((file !== root && !file.startsWith(root + sep)) || decoded.includes('/.')) throw new Error('forbidden');
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}).listen(port, '0.0.0.0', () => console.log(`Serving ${root} at http://localhost:${port}`));
