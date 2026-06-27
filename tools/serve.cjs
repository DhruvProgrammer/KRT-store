const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.resolve(__dirname, '..', 'dist');
const PORT = 4317;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8'
};

const safeJoin = (root, target) => {
  const resolved = path.resolve(path.join(root, decodeURIComponent(target)));
  if (!resolved.startsWith(root)) return null;
  return resolved;
};

const server = http.createServer((req, res) => {
  try {
    const reqUrl = url.parse(req.url);
    let pathname = reqUrl.pathname || '/';
    if (pathname.endsWith('/')) pathname += 'index.html';
    let filepath = safeJoin(ROOT, pathname);
    if (!filepath) {
      res.statusCode = 400;
      return res.end('Bad path');
    }
    if (!fs.existsSync(filepath)) {
      // try .html fallback
      const tryHtml = filepath + '.html';
      if (fs.existsSync(tryHtml)) filepath = tryHtml;
      else {
        res.statusCode = 404;
        return res.end('Not found');
      }
    }
    const ext = path.extname(filepath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    fs.createReadStream(filepath).pipe(res);
  } catch (err) {
    res.statusCode = 500;
    res.end(String(err));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Serving dist on http://127.0.0.1:' + PORT);
});
