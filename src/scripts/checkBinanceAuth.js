const { getAccountBalance, getOpenOrders } = require('../services/binance');
const config = require('../config/env');

(async () => {
  console.log(`[Check] testnet=${config.binance.testnet} base=${config.binance.apiBase}`);
  try {
    const bal = await getAccountBalance();
    console.log(`[Check] USDT available: ${bal.available}`);
  } catch (e) {
    console.error('[Check] balance erro:', e.message);
  }

  try {
    const orders = await getOpenOrders(false);
    const count = Array.isArray(orders) ? orders.length : (orders && orders.length) || 0;
    console.log(`[Check] openOrders count: ${count}`);
  } catch (e) {
    console.error('[Check] openOrders erro:', e.message);
  }
})();
