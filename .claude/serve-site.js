// Tiny dependency-free static server for the marketing site (preview only).
// Serves <repo>/site on port 5173. Used by .claude/launch.json → preview_start.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'site');
const PORT = 5173;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.xml': 'application/xml', '.ico': 'image/x-icon', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json',
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  let file = path.join(ROOT, urlPath);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) {
      // try clean-URL → .html, else 404 page
      fs.readFile(file + '.html', (e2, d2) => {
        if (!e2) { res.writeHead(200, { 'Content-Type': TYPES['.html'] }); return res.end(d2); }
        fs.readFile(path.join(ROOT, '404.html'), (e3, d3) => {
          res.writeHead(404, { 'Content-Type': TYPES['.html'] });
          res.end(e3 ? 'Not found' : d3);
        });
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log('site preview on http://localhost:' + PORT));
