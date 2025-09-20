require('dotenv').config();

function toBool(v, def = false) {
  if (v === undefined) return def;
  const s = String(v).toLowerCase().trim();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function toNum(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function trimEnv(v) {
  const s = (v ?? '').toString().trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('\'') && s.endsWith('\''))) {
    return s.slice(1, -1).trim();
  }
  return s;
}

function normalizeApiBase(raw, isTestnet) {
  if (typeof raw === 'string') raw = raw.trim();
  let base = raw || (isTestnet ? 'https://testnet.binance.vision/api/' : 'https://api.binance.com/api/');
  // remove trailing slashes
  base = base.replace(/\/+$/, '');
  // ensure protocol
  if (!/^https?:\/\//i.test(base)) {
    base = 'https://' + base;
  }
  // ensure ends with /api
  if (!/\/api$/.test(base)) {
    base = base + '/api';
  }
  // ensure trailing slash
  if (!/\/$/.test(base)) {
    base = base + '/';
  }
  return base;
}

function normalizeWsBase(raw, isTestnet) {
  if (typeof raw === 'string') raw = raw.trim();
  let base = raw || (isTestnet ? 'wss://testnet.binance.vision/ws' : 'wss://stream.binance.com:9443/ws');
  // remove trailing slashes
  base = base.replace(/\/+$/, '');
  // ensure protocol
  if (!/^wss?:\/\//i.test(base)) {
    base = 'wss://' + base;
  }
  // ensure ends with /ws or /stream
  if (!/\/(ws|stream)$/.test(base)) {
    base = base + '/ws';
  }
  return base;
}

const config = {
  db: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'test',
    port: toNum(process.env.DB_PORT, 3306),
    dialect: process.env.DB_DIALECT || 'mysql',
    connectTimeout: toNum(process.env.DB_CONNECT_TIMEOUT, 15000), // ms
    ssl: toBool(process.env.DB_SSL, false),
    sslRejectUnauthorized: toBool(process.env.DB_SSL_REJECT_UNAUTHORIZED, false),
    pool: {
      max: toNum(process.env.DB_POOL_MAX, 5),
      min: toNum(process.env.DB_POOL_MIN, 0),
      acquire: toNum(process.env.DB_POOL_ACQUIRE, 30000), // ms
      idle: toNum(process.env.DB_POOL_IDLE, 10000), // ms
    },
  },
  binance: {
    apiKey: trimEnv(process.env.BINANCE_API_KEY),
    apiSecret: trimEnv(process.env.BINANCE_API_SECRET),
    defaultInterval: process.env.BINANCE_DEFAULT_INTERVAL || '1h',
    testnet: toBool(process.env.BINANCE_TESTNET, false),
    apiBase: normalizeApiBase(process.env.BINANCE_API_BASE, toBool(process.env.BINANCE_TESTNET, false)),
    wsBase: normalizeWsBase(process.env.BINANCE_WS_BASE, toBool(process.env.BINANCE_TESTNET, false)),
    requestTimeoutMs: toNum(process.env.HTTP_TIMEOUT_MS, 20000),
  },
  scheduler: {
    enabled: toBool(process.env.SCHEDULER_ENABLED, true),
    cron: (process.env.SCHEDULER_CRON || '0 * * * *').toString().trim(),
    runOnStart: toBool(process.env.SCHEDULER_RUN_ON_START, true),
  },
  trade: {
    unitUSDT: toNum(process.env.TRADE_UNIT_USDT, 12),
    maxPairsPerRound: toNum(process.env.TRADE_MAX_PAIRS_PER_ROUND, 30),
    concurrentRequests: toNum(process.env.TRADE_CONCURRENT_REQUESTS, 5),
    candleLimit: toNum(process.env.TRADE_CANDLE_LIMIT, 200),
    buyBudgetPct: toNum(process.env.TRADE_BUY_BUDGET_PCT, 0.9),
  },
};

module.exports = config;
