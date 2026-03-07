#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════╗
 *   DEADPOOL'S POOL — HTTP/HTTPS Proxy
 *   Node.js · Zero dependencies · Deep Space Edition
 * ╚══════════════════════════════════════════════════╝
 *
 * Usage:
 *   node proxy.js
 *   node proxy.js --port 9090
 *   node proxy.js --host 127.0.0.1 --port 8888 --workers 20 --log
 *
 * Then set your browser/system proxy to:
 *   Host: 127.0.0.1   Port: 8080
 */

const net  = require('net');
const http = require('http');
const url  = require('url');

// ── CLI ARGS ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const arg  = (flag, def) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i+1] ? args[i+1] : def;
};

const HOST       = arg('--host',    '0.0.0.0');
const PORT       = parseInt(arg('--port',    '8080'), 10);
const MAX_CONN   = parseInt(arg('--workers', '10'),   10);
const VERBOSE    = args.includes('--log');
const TIMEOUT_MS = 10_000;

// ── LOGGING ───────────────────────────────────────────────────────────────────
const c = {
  red:    '\x1b[38;5;196m',
  red2:   '\x1b[38;5;203m',
  gray:   '\x1b[38;5;240m',
  silver: '\x1b[38;5;250m',
  green:  '\x1b[38;5;82m',
  yellow: '\x1b[38;5;226m',
  bold:   '\x1b[1m',
  reset:  '\x1b[0m',
  dim:    '\x1b[2m',
};

function ts() {
  return new Date().toTimeString().slice(0,8);
}

function log(method, target, status) {
  if (!VERBOSE && method !== 'SYSTEM' && method !== 'ERROR') return;
  const col = method === 'CONNECT' ? c.red2
            : method === 'SYSTEM'  ? c.green
            : method === 'ERROR'   ? c.yellow
            : c.silver;
  const pad = method.padEnd(8);
  console.log(
    `${c.dim}${ts()}${c.reset}  ${col}${c.bold}${pad}${c.reset}  ${c.gray}${target}${c.reset}  ${status || ''}`
  );
}

// ── BANNER ────────────────────────────────────────────────────────────────────
function banner() {
  console.log(`
${c.red}${c.bold}
  ██████╗ ███████╗ █████╗ ██████╗ ██████╗  ██████╗  ██████╗ ██╗     ███████╗
  ██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔══██╗██╔═══██╗██╔═══██╗██║     ██╔════╝
  ██║  ██║█████╗  ███████║██║  ██║██████╔╝██║   ██║██║   ██║██║     ███████╗
  ██║  ██║██╔══╝  ██╔══██║██║  ██║██╔═══╝ ██║   ██║██║   ██║██║     ╚════██║
  ██████╔╝███████╗██║  ██║██████╔╝██║     ╚██████╔╝╚██████╔╝███████╗███████║
  ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═════╝ ╚═╝      ╚═════╝  ╚═════╝ ╚══════╝╚══════╝
${c.reset}${c.red}
         ██████╗  ██████╗  ██████╗ ██╗
         ██╔══██╗██╔═══██╗██╔═══██╗██║
         ██████╔╝██║   ██║██║   ██║██║
         ██╔═══╝ ██║   ██║██║   ██║██║
         ██║     ╚██████╔╝╚██████╔╝███████╗
         ╚═╝      ╚═════╝  ╚═════╝ ╚══════╝
${c.reset}
  ${c.dim}· Intergalactic Proxy Command · Deep Space Edition ·${c.reset}
  ${c.gray}  "Maximum effort. Maximum throughput."${c.reset}

  ${c.silver}Host     ${c.reset}${c.bold}${HOST}${c.reset}
  ${c.silver}Port     ${c.reset}${c.bold}${PORT}${c.reset}
  ${c.silver}Workers  ${c.reset}${c.bold}${MAX_CONN}${c.reset}
  ${c.silver}Logging  ${c.reset}${c.bold}${VERBOSE ? 'verbose' : 'warnings only'}${c.reset}
  ${c.silver}Started  ${c.reset}${c.bold}${new Date().toLocaleString()}${c.reset}

  ${c.dim}Press Ctrl+C to eject from orbit.${c.reset}
  ${'─'.repeat(60)}
`);
}

// ── ACTIVE CONNECTION TRACKING ────────────────────────────────────────────────
let active = 0;

function acquire() {
  if (active >= MAX_CONN) return false;
  active++;
  return true;
}

function release() {
  if (active > 0) active--;
}

// ── HTTPS TUNNEL (CONNECT) ────────────────────────────────────────────────────
function handleConnect(req, clientSocket, head) {
  if (!acquire()) {
    clientSocket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
    clientSocket.destroy();
    return;
  }

  const [host, portStr] = req.url.split(':');
  const port = parseInt(portStr, 10) || 443;

  const remote = net.createConnection({ host, port }, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head && head.length) remote.write(head);
    remote.pipe(clientSocket);
    clientSocket.pipe(remote);
    log('CONNECT', `${host}:${port}`, '200');
  });

  remote.setTimeout(TIMEOUT_MS);

  const cleanup = (label) => () => {
    release();
    remote.destroy();
    clientSocket.destroy();
  };

  remote.on('error',   (e) => { log('ERROR', `${host}:${port}`, e.code); cleanup()(); });
  remote.on('timeout', ()  => { log('ERROR', `${host}:${port}`, 'TIMEOUT'); cleanup()(); });
  remote.on('end',     cleanup('remote end'));
  clientSocket.on('error', cleanup('client error'));
  clientSocket.on('end',   cleanup('client end'));
}

// ── HTTP FORWARDING ───────────────────────────────────────────────────────────
function handleRequest(req, res) {
  if (!acquire()) {
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    res.end('503 — Too many connections. Even Deadpool has limits.\n');
    return;
  }

  let parsed;
  try {
    parsed = new URL(req.url);
  } catch {
    release();
    res.writeHead(400); res.end('400 Bad Request\n');
    return;
  }

  const options = {
    hostname: parsed.hostname,
    port:     parsed.port || 80,
    path:     parsed.pathname + (parsed.search || ''),
    method:   req.method,
    headers:  { ...req.headers, host: parsed.host },
    timeout:  TIMEOUT_MS,
  };

  // Strip proxy-specific headers
  delete options.headers['proxy-connection'];
  delete options.headers['proxy-authorization'];

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
    proxyRes.on('end', release);
    log(req.method, `${parsed.hostname}${options.path}`, proxyRes.statusCode);
  });

  proxyReq.on('error', (e) => {
    release();
    log('ERROR', parsed.hostname, e.code);
    if (!res.headersSent) {
      res.writeHead(502); res.end('502 Bad Gateway\n');
    }
  });

  proxyReq.on('timeout', () => {
    release();
    log('ERROR', parsed.hostname, 'TIMEOUT');
    proxyReq.destroy();
    if (!res.headersSent) {
      res.writeHead(504); res.end('504 Gateway Timeout\n');
    }
  });

  req.pipe(proxyReq);
}

// ── SERVER ────────────────────────────────────────────────────────────────────
const server = http.createServer(handleRequest);
server.on('connect', handleConnect);

server.on('error', (e) => {
  console.error(`\n${c.yellow}[ERROR] Server error: ${e.message}${c.reset}\n`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  banner();
  log('SYSTEM', `Proxy live on ${HOST}:${PORT}`, '✓');
});

// ── GRACEFUL SHUTDOWN ─────────────────────────────────────────────────────────
process.on('SIGINT', () => {
  console.log(`\n\n  ${c.red}Deadpool is ejecting from orbit...${c.reset}\n`);
  server.close(() => process.exit(0));
});
