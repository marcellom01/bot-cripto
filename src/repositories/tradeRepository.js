const { Trade } = require('../config/database');

async function isPositionOpen(pair) {
  const count = await Trade.count({ where: { pair, status: 'OPEN' } });
  return count > 0;
}

async function createTrade({ pair, orderId, entry_price, quantity }) {
  return Trade.create({ pair, orderId, entry_price, quantity, status: 'OPEN' });
}

async function closeTrade({ id, exit_price }) {
  const trade = await Trade.findByPk(id);
  if (!trade) return null;
  const pl = exit_price && trade.entry_price ? (Number(exit_price) - Number(trade.entry_price)) * Number(trade.quantity) : null;
  trade.status = 'CLOSED';
  trade.exit_price = exit_price;
  trade.profit_loss = pl;
  await trade.save();
  return trade;
}

async function setClosedManually({ pair, orderId }) {
  const trade = await Trade.findOne({ where: { pair, orderId, status: 'OPEN' } });
  if (!trade) return null;
  trade.status = 'CLOSED_MANUALLY';
  await trade.save();
  return trade;
}

async function listOpenTrades() {
  return Trade.findAll({ where: { status: 'OPEN' } });
}

module.exports = { isPositionOpen, createTrade, closeTrade, setClosedManually, listOpenTrades };
