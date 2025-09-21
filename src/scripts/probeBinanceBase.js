// Testa conectividade aos endpoints públicos da Binance (v3/time) em múltiplos domínios
// Uso: npm run probe:binance

try {
  const dns = require('dns');
  if (typeof dns.setDefaultResultOrder === 'function') dns.setDefaultResultOrder('ipv4first');
} catch {}

const https = require('https');
const { URL } = require('url');

const candidates = [
  'https://api.binance.com/api/',
  'https://api1.binance.com/api/',
  'https://api2.binance.com/api/',
  'https://api3.binance.com/api/',
  'https://api-gcp.binance.com/api/',
];

function probe(base, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const url = new URL('v3/time', base);
    const started = Date.now();
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const ms = Date.now() - started;
        resolve({ base, ok: true, status: res.statusCode, ms, body: Buffer.concat(chunks).toString('utf8') });
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error(`timeout after ${timeoutMs}ms`));
    });
    req.on('error', (err) => {
      const ms = Date.now() - started;
      resolve({ base, ok: false, error: err.message, ms });
    });
  });
}

(async () => {
  console.log('[Probe] Testando conectividade com Binance public API (GET /api/v3/time) ...');
  for (const base of candidates) {
    const r = await probe(base, 10000);
    if (r.ok) {
      console.log(`[OK] ${base} status=${r.status} time=${r.ms}ms body=${r.body}`);
    } else {
      console.log(`[FAIL] ${base} time=${r.ms}ms error=${r.error}`);
    }
  }
  console.log('\nDica: defina BINANCE_API_BASE no .env com uma das bases [OK]. Ex.: BINANCE_API_BASE=https://api1.binance.com/api/');
})();
