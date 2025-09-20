const { SMA, ATR } = require('technicalindicators');

function toNumber(x) {
  return typeof x === 'string' ? parseFloat(x) : x;
}

function mapCandles(candles) {
  return candles.map((c) => ({
    open: toNumber(c[1]),
    high: toNumber(c[2]),
    low: toNumber(c[3]),
    close: toNumber(c[4]),
  }));
}

function calculateSMA(values, period) {
  return SMA.calculate({ period, values });
}

function calculateSupertrendFromCandles(candles, atrPeriod = 10, multiplier = 3) {
  const mapped = mapCandles(candles);
  const high = mapped.map((c) => c.high);
  const low = mapped.map((c) => c.low);
  const close = mapped.map((c) => c.close);
  const atr = ATR.calculate({ high, low, close, period: atrPeriod });
  const startIndex = candles.length - atr.length;
  const basicUpperBand = [];
  const basicLowerBand = [];
  const finalUpperBand = [];
  const finalLowerBand = [];
  const supertrend = [];
  const trend = [];
  for (let i = startIndex; i < candles.length; i++) {
    const idx = i - startIndex;
    const hl2 = (high[i] + low[i]) / 2;
    const atrVal = atr[idx];
    basicUpperBand[idx] = hl2 + multiplier * atrVal;
    basicLowerBand[idx] = hl2 - multiplier * atrVal;

    if (idx === 0) {
      finalUpperBand[idx] = basicUpperBand[idx];
      finalLowerBand[idx] = basicLowerBand[idx];
      trend[idx] = true;
      supertrend[idx] = finalLowerBand[idx];
    } else {
      finalUpperBand[idx] = close[i - 1] <= finalUpperBand[idx - 1]
        ? Math.min(basicUpperBand[idx], finalUpperBand[idx - 1])
        : basicUpperBand[idx];
      finalLowerBand[idx] = close[i - 1] >= finalLowerBand[idx - 1]
        ? Math.max(basicLowerBand[idx], finalLowerBand[idx - 1])
        : basicLowerBand[idx];

      if (supertrend[idx - 1] === finalUpperBand[idx - 1]) {
        trend[idx] = close[i] > finalUpperBand[idx] ? true : false;
      } else {
        trend[idx] = close[i] < finalLowerBand[idx] ? false : true;
      }
      supertrend[idx] = trend[idx] ? finalLowerBand[idx] : finalUpperBand[idx];
    }
  }
  return { supertrend, startIndex, close, high, low };
}

function calculateIndicators(candles) {
  const mapped = mapCandles(candles);
  const highs = mapped.map((c) => c.high);
  const lows = mapped.map((c) => c.low);
  const closes = mapped.map((c) => c.close);
  const st = calculateSupertrendFromCandles(candles, 10, 3);
  const sma_low_3_series = SMA.calculate({ period: 3, values: lows });
  const sma_high_5_series = SMA.calculate({ period: 5, values: highs });
  const last_close = closes[closes.length - 1];
  const last_supertrend = st.supertrend[st.supertrend.length - 1];
  const last_sma_low_3 = sma_low_3_series[sma_low_3_series.length - 1];
  const last_sma_high_5 = sma_high_5_series[sma_high_5_series.length - 1];
  return {
    last: {
      supertrend: last_supertrend,
      sma_low_3: last_sma_low_3,
      sma_high_5: last_sma_high_5,
      last_close,
    },
    series: {
      supertrend: st.supertrend,
      sma_low_3_series,
      sma_high_5_series,
      closes,
      highs,
      lows,
    },
  };
}

module.exports = { calculateIndicators, calculateSMA, calculateSupertrendFromCandles };
