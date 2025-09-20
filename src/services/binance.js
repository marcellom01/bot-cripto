const Binance = require('node-binance-api');
const Decimal = require('decimal.js');
const config = require('../config/env');

function deriveCombineStream(wsBase) {
  if (/\/ws$/.test(wsBase)) return wsBase.replace(/\/ws$/, '/stream?streams=');
  if (/\/stream$/.test(wsBase)) return wsBase + '?streams=';
  if (/\/stream\?streams=$/.test(wsBase)) return wsBase;
  return wsBase.replace(/\/+$/, '') + '/stream?streams=';
}

function withTimeout(promise, ms, label) {
  const t = setTimeout(() => {}, 0); // noop to keep similar timing
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout em ${label} (${ms}ms)`)), ms)
    ),
  ]).finally(() => clearTimeout(t));
}

const binance = new Binance().options({
  APIKEY: config.binance.apiKey,
  APISECRET: config.binance.apiSecret,
  // Sincroniza timestamp automaticamente para evitar assinatura inválida (-1022)
  useServerTime: true,
  recvWindow: 60000,
  // "test" em node-binance-api usa /order/test (apenas validação). Mantemos false para executar ordens reais (na testnet ou produção conforme URLs)
  test: false,
  urls: {
    base: config.binance.apiBase,                         // ex: https://api.binance.com/api/
    sapi: config.binance.apiBase.replace('/api/', '/sapi/'),
    wapi: config.binance.apiBase.replace('/api/', '/wapi/'),
    fapi: config.binance.testnet ? 'https://testnet.binancefuture.com/fapi/' : 'https://fapi.binance.com/fapi/',
    dapi: config.binance.testnet ? 'https://testnet.binancefuture.com/dapi/' : 'https://dapi.binance.com/dapi/',
    stream: config.binance.wsBase,                        // ex: wss://stream.binance.com:9443/ws
    combineStream: deriveCombineStream(config.binance.wsBase),
  },
});

// Log não-sensível para debug operacional
console.log(
  `[Binance] base=${config.binance.apiBase} ws=${config.binance.wsBase} testnet=${config.binance.testnet} useServerTime=true recvWindow=60000`
);

function requireApiCreds() {
  if (!config.binance.apiKey || !config.binance.apiSecret) {
    throw new Error('BINANCE_API_KEY/BINANCE_API_SECRET não configurados no .env');
  }
}

const exchangeInfoCache = { symbols: null, updatedAt: 0 };
async function getExchangeInfo() {
  if (exchangeInfoCache.symbols && Date.now() - exchangeInfoCache.updatedAt < 5 * 60 * 1000) {
    return exchangeInfoCache.symbols;
  }
  const data = await withTimeout(
    new Promise((resolve, reject) => {
      binance.exchangeInfo((error, data) => (error ? reject(error) : resolve(data)));
    }),
    config.binance.requestTimeoutMs,
    'exchangeInfo'
  );
  exchangeInfoCache.symbols = data.symbols;
  exchangeInfoCache.updatedAt = Date.now();
  return data.symbols;
}

async function getAllUSDTpairs() {
  const symbols = await getExchangeInfo();
  return symbols
    .filter((s) => s.quoteAsset === 'USDT' && s.status === 'TRADING')
    .map((s) => s.symbol);
}

async function fetchCandles(symbol, interval = config.binance.defaultInterval, limit = 200) {
  return await withTimeout(
    new Promise((resolve, reject) => {
      binance.candlesticks(
        symbol,
        interval,
        (error, ticks) => (error ? reject(error) : resolve(ticks)),
        { limit }
      );
    }),
    config.binance.requestTimeoutMs,
    `candlesticks ${symbol} ${interval}`
  );
}

async function getAccountBalance() {
  requireApiCreds();
  const balances = await withTimeout(
    new Promise((resolve, reject) => {
      binance.balance((error, balances) => (error ? reject(error) : resolve(balances)));
    }),
    config.binance.requestTimeoutMs,
    'balance'
  );
  const usdt = balances.USDT;
  const available = usdt ? parseFloat(usdt.available) : 0;
  return { asset: 'USDT', available };
}

async function getOpenOrders(symbol = false) {
  requireApiCreds();
  try {
    if (symbol) {
      return await withTimeout(
        binance.openOrders(symbol),
        config.binance.requestTimeoutMs,
        `openOrders ${symbol}`
      );
    }
    return await withTimeout(
      binance.openOrders(),
      config.binance.requestTimeoutMs,
      'openOrders'
    );
  } catch (err) {
    // Propaga erro com mensagem da Binance (ex.: 401/403 ou testnet sem credenciais válidas)
    throw err;
  }
}

async function prices(symbol) {
  return await withTimeout(
    new Promise((resolve, reject) => {
      binance.prices(symbol, (error, ticker) => (error ? reject(error) : resolve(ticker)));
    }),
    config.binance.requestTimeoutMs,
    `prices ${symbol || 'ALL'}`
  );
}

async function getFilters(symbol) {
  const symbols = await getExchangeInfo();
  const meta = symbols.find((s) => s.symbol === symbol);
  if (!meta) throw new Error(`Symbol ${symbol} não encontrado no exchangeInfo`);
  const lotSize = meta.filters.find((f) => f.filterType === 'LOT_SIZE');
  const priceFilter = meta.filters.find((f) => f.filterType === 'PRICE_FILTER');
  const minNotional = meta.filters.find((f) => f.filterType === 'MIN_NOTIONAL');
  return {
    stepSize: lotSize ? lotSize.stepSize : null,
    tickSize: priceFilter ? priceFilter.tickSize : null,
    minNotional: minNotional ? minNotional.minNotional : null,
  };
}

function roundStep(value, step) {
  if (!step) return value;
  const d = new Decimal(value);
  const stepD = new Decimal(step);
  const precision = Math.max(0, stepD.dp());
  const quant = d.div(stepD).floor().mul(stepD);
  return Number(quant.toFixed(precision));
}

async function placeBuyOrder(symbol, amountInUSDT) {
  requireApiCreds();
  const priceMap = await prices(symbol);
  const price = parseFloat(priceMap[symbol]);
  const { stepSize, minNotional } = await getFilters(symbol);
  const rawQty = amountInUSDT / price;
  const qty = roundStep(rawQty, stepSize);
  const notional = qty * price;
  if (minNotional && notional < parseFloat(minNotional)) {
    throw new Error(`Notional ${notional} menor que o mínimo ${minNotional} para ${symbol}`);
  }
  const order = await withTimeout(
    new Promise((resolve, reject) => {
      binance.marketBuy(symbol, qty, (error, response) => (error ? reject(error) : resolve(response)));
    }),
    config.binance.requestTimeoutMs,
    `marketBuy ${symbol}`
  );
  return { order, qty, price };
}

async function placeSellOrder(symbol, quantity) {
  requireApiCreds();
  const { stepSize } = await getFilters(symbol);
  const qty = roundStep(quantity, stepSize);
  const order = await withTimeout(
    new Promise((resolve, reject) => {
      binance.marketSell(symbol, qty, (error, response) => (error ? reject(error) : resolve(response)));
    }),
    config.binance.requestTimeoutMs,
    `marketSell ${symbol}`
  );
  return { order, qty };
}

function candlestickWS(symbol, interval, onKline) {
  const stream = `${symbol.toLowerCase()}@kline_${interval}`;
  binance.websockets.candlesticks(symbol, interval, (candlesticks) => {
    const { e: eventType, E: eventTime, s: s, k: ticks } = candlesticks;
    onKline({ eventType, eventTime, symbol: s, kline: ticks });
  });
  return stream;
}

function terminateKlineWS(symbol, interval) {
  const stream = `${symbol.toLowerCase()}@kline_${interval}`;
  const subs = binance.websockets.subscriptions();
  if (subs[stream]) {
    try {
      binance.websockets.terminate(stream);
    } catch (e) {
      // noop
    }
  }
}

module.exports = {
  binance,
  getAllUSDTpairs,
  fetchCandles,
  getAccountBalance,
  getOpenOrders,
  prices,
  getFilters,
  roundStep,
  placeBuyOrder,
  placeSellOrder,
  candlestickWS,
  terminateKlineWS,
};
