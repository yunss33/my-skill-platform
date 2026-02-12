import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import RPASkill from '../dist/index.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    const value = next && !next.startsWith('--') ? next : 'true';
    args[key] = value;
    if (value !== 'true') i += 1;
  }
  return args;
}

function toBool(value, defaultValue) {
  if (value === undefined) return defaultValue;
  return value === 'true' || value === '1' || value === 'yes';
}

function toInt(value, defaultValue) {
  if (value === undefined) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
  });
}

function writeJson(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj, null, 2) + '\n');
}

function ensureDirForFile(filePath) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(`Usage:
  node cli/session_server.mjs --port 38200 [--host 127.0.0.1] [--headless true|false] [--channel msedge|chrome] [--userDataDir <dir>]
`);
    process.exitCode = 2;
    return;
  }

  const host = args.host ?? '127.0.0.1';
  const port = toInt(args.port, 38200);
  const userDataDir = args.userDataDir ? String(args.userDataDir) : undefined;

  const rpa = new RPASkill();
  await rpa.initBrowser({
    headless: toBool(args.headless, false),
    channel: args.channel,
    executablePath: args.executablePath,
    slowMo: toInt(args.slowMo, 0),
    timeout: toInt(args.timeout, 0),
    args: args.args ? safeJsonParse(args.args) ?? [] : [],
    viewport: args.viewport ? safeJsonParse(args.viewport) : undefined,
    userDataDir,
    storageStatePath: args.storageStatePath,
  });

  const allowed = new Set([
    'newPage',
    'navigate',
    'waitForLoadState',
    'goBack',
    'goForward',
    'refresh',
    'getUrl',
    'getTitle',
    'waitForNavigation',
    'waitForURL',
    'click',
    'rightClick',
    'doubleClick',
    'input',
    'type',
    'press',
    'selectOption',
    'check',
    'uncheck',
    'hover',
    'dragAndDrop',
    'waitForSelector',
    'waitForElementVisible',
    'waitForElementHidden',
    'focus',
    'blur',
    'extractText',
    'extractAllText',
    'extractAttribute',
    'extractAllAttributes',
    'extractTable',
    'extractImage',
    'extractAllImages',
    'extractPageSource',
    'extractTitle',
    'extractUrl',
    'extractCookies',
    'extractLocalStorage',
    'extractSessionStorage',
    'captureScreenshot',
    'webSearch',
    'adaptiveSearch',
    'searchOnSite',
    'searchProductsHeuristic',
    'inspectPage',
    'saveStorageState',
  ]);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${host}:${port}`);
      if (req.method === 'GET' && url.pathname === '/health') {
        writeJson(res, 200, { ok: true, pid: process.pid });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/call') {
        const body = await readBody(req);
        const payload = safeJsonParse(body) ?? {};
        const method = String(payload.method ?? '');
        const params = payload.params ?? [];
        if (!method || !allowed.has(method)) {
          writeJson(res, 400, { ok: false, error: `method not allowed: ${method}` });
          return;
        }
        const fn = rpa[method];
        if (typeof fn !== 'function') {
          writeJson(res, 400, { ok: false, error: `method not found: ${method}` });
          return;
        }
        const argsList = Array.isArray(params) ? params : [params];
        const result = await fn.apply(rpa, argsList);
        writeJson(res, 200, { ok: true, method, result });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/close') {
        writeJson(res, 200, { ok: true, closing: true });
        server.close(() => process.exit(0));
        // Close browser after we responded.
        try {
          await rpa.closeBrowser();
        } catch {
          // ignore
        }
        return;
      }

      writeJson(res, 404, { ok: false, error: 'not found' });
    } catch (err) {
      writeJson(res, 500, { ok: false, error: (err && err.message) || String(err) });
    }
  });

  server.listen(port, host, () => {
    const baseUrl = `http://${host}:${port}`;
    // eslint-disable-next-line no-console
    console.log(baseUrl);
  });
}

main().catch((err) => {
  console.error('session_server failed:', err);
  process.exitCode = 1;
});
