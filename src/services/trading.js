const config = require('../config/env');
const { createTrade, isPositionOpen, closeTrade, setClosedManually, listOpenTrades } = require('../repositories/tradeRepository');
const { fetchCandles, placeBuyOrder: placeBuy, placeSellOrder: placeSell, getAllQuotePairs, getOpenOrders, candlestickWS, terminateKlineWS } = require('./binance');
const { calculateIndicators } = require('../indicators/indicators');

async function processWithConcurrency(items, limit, handler) {
  const size = items.length;
  const results = new Array(size);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, size) }, () => (async () => {
    while (true) {
      const i = index++;
      if (i >= size) break;
      try {
        results[i] = await handler(items[i], i);
      } catch (e) {
        results[i] = { error: e };
      }
    }
  })());
  await Promise.all(workers);
  return results;
}

async function initialSyncOpenOrders() {
  const dbOpen = await listOpenTrades();
  let binanceOpen = [];
  try {
    binanceOpen = await getOpenOrders(false);
  } catch (err) {
    console.warn('Não foi possível obter openOrders da Binance:', err.message);
  }
  const binanceKey = new Set(binanceOpen.map((o) => `${o.symbol}:${o.orderId}`));
  for (const t of dbOpen) {
    const key = `${t.pair}:${t.orderId}`;
    if (!binanceKey.has(key)) {
      await setClosedManually({ pair: t.pair, orderId: t.orderId });
      console.log(`Trade ${key} marcada como CLOSED_MANUALLY após sync.`);
    }
  }
  for (const o of binanceOpen) {
    const found = dbOpen.find((t) => t.pair === o.symbol && String(t.orderId) === String(o.orderId));
    if (!found) {
      console.warn(`Aviso: ordem aberta na Binance sem registro local: ${o.symbol}#${o.orderId}`);
    }
  }
}

async function decideAndTrade() {
  const { getAccountBalance } = require('./binance');
  const startedAt = Date.now();
  const interval = config.binance.defaultInterval;
  const candleLimit = config.trade.candleLimit || 200;
  const assetSymbol = (config.trade.quoteAsset || 'USDT').toUpperCase();

  // Saldo
  const balance = await getAccountBalance(assetSymbol).catch((err) => {
    console.warn('Não foi possível obter saldo. Abortando rodada:', err.message);
    return { available: 0 };
  });
  const buyPct = Number(config.trade.buyBudgetPct || 0.9);
  let capital_disponivel = Number((balance.available || 0) * buyPct);
  console.log(`Capital disponível calculado (${(buyPct * 100).toFixed(0)}%): ${capital_disponivel.toFixed(2)} ${assetSymbol}`);

  // Posições abertas (para evitar checagem de DB por par)
  const openNow = await listOpenTrades().catch(() => []);
  const openSet = new Set(openNow.map((t) => t.pair));

  // Pares e limitação por rodada
  const allPairs = await getAllQuotePairs(config.trade.quoteAsset);
  const filteredPairs = allPairs.filter((p) => !openSet.has(p));
  const maxPairs = config.trade.maxPairsPerRound || filteredPairs.length;
  const pairs = filteredPairs.slice(0, maxPairs);

  // Processa com concorrência limitada
  const conc = Math.max(1, Number(config.trade.concurrentRequests || 5));
  let candidatesFound = 0;
  let failures = 0;
  const results = await processWithConcurrency(pairs, conc, async (pair) => {
    try {
      const candles = await fetchCandles(pair, interval, candleLimit);
      const indicators = calculateIndicators(candles);
      const last_close = indicators.last.last_close;
      const supertrend = indicators.last.supertrend;
      const sma_low_3 = indicators.last.sma_low_3;
      if (last_close > supertrend && last_close < sma_low_3) {
        candidatesFound++;
        return { candidate: { pair, last_close, supertrend, sma_low_3 } };
      }
      return { candidate: null };
    } catch (err) {
      failures++;
      console.warn(`Falha ao buscar/analisar ${pair}: ${err.message}`);
      return { error: err };
    }
  });

  const candidatos = results
    .map((r) => (r && r.candidate ? r.candidate : null))
    .filter(Boolean);

  // Execução de compras (sequencial para controle de capital)
  let buys = 0;
  for (const c of candidatos) {
    if (capital_disponivel >= config.trade.unitUSDT) {
      try {
        const { order, qty, price } = await placeBuy(c.pair, config.trade.unitUSDT);
        await createTrade({ pair: c.pair, orderId: order.orderId, entry_price: price, quantity: qty });
        capital_disponivel -= config.trade.unitUSDT;
        buys++;
        console.log(`Compra executada ${c.pair}: qty=${qty}, price=${price}. Capital restante: ${capital_disponivel.toFixed(2)} USDT`);
      } catch (err) {
        console.warn(`Falha ao comprar ${c.pair}: ${err.message}`);
      }
    } else {
      break;
    }
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `Resumo da análise: pares considerados=${pairs.length}, candidatos=${candidatesFound}, falhas=${failures}, compras=${buys}, duração=${durationMs}ms`
  );

  // Resumo para logging externo
  const openTrades = await listOpenTrades().catch(() => []);
  return {
    asset: assetSymbol,
    assetAvailable: Number(balance.available || 0),
    capitalDisponivel: Number(capital_disponivel),
    openTradesCount: Array.isArray(openTrades) ? openTrades.length : 0,
  };
}

function startExitMonitoring() {
  const interval = config.binance.defaultInterval;
  listOpenTrades()
    .then((openTrades) => {
      const symbols = openTrades.map((t) => t.pair);
      if (symbols.length === 0) return;
      symbols.forEach((symbol) => {
        const stream = candlestickWS(symbol, interval, async ({ symbol, kline }) => {
          try {
            if (!kline.x) return;
            const candles = await fetchCandles(symbol, interval, 50);
            const inds = calculateIndicators(candles);
            const last_close = inds.last.last_close;
            const sma_high_5 = inds.last.sma_high_5;
            if (last_close > sma_high_5) {
              const opens = await listOpenTrades();
              const trade = opens.find((t) => t.pair === symbol);
              if (trade) {
                const { order } = await placeSell(symbol, trade.quantity);
                await closeTrade({ id: trade.id, exit_price: last_close });
                console.log(`Venda executada ${symbol}. Trade id ${trade.id} fechado.`);
                // Encerra o WebSocket correspondente após a venda
                terminateKlineWS(symbol, interval);
              }
            }
          } catch (err) {
            console.warn(`Erro no monitoramento de saída para ${symbol}: ${err.message}`);
          }
        });
      });
    })
    .catch((err) => console.warn('Erro ao iniciar monitoramento de saída:', err.message));
}

module.exports = { initialSyncOpenOrders, decideAndTrade, startExitMonitoring };
