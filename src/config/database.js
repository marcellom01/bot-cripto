const { Sequelize, DataTypes } = require('sequelize');
const config = require('./env');

const dialectOptions = {};
if (config.db.ssl) {
  dialectOptions.ssl = {
    rejectUnauthorized: !!config.db.sslRejectUnauthorized,
  };
}
if (config.db.connectTimeout) {
  dialectOptions.connectTimeout = config.db.connectTimeout; // ms
}

const sequelize = new Sequelize(config.db.name, config.db.user, config.db.password, {
  host: config.db.host,
  port: config.db.port,
  dialect: config.db.dialect,
  logging: false,
  pool: config.db.pool,
  dialectOptions,
});

const Trade = require('../models/trade')(sequelize, DataTypes);

async function initDatabase() {
  const maxTries = 3;
  const baseDelay = 2000; // ms
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    try {
      await sequelize.authenticate();
      await sequelize.sync();
      console.log('Database conectado e modelos sincronizados.');
      return;
    } catch (err) {
      console.error(`Tentativa ${attempt}/${maxTries} — erro de conexão/sync com o banco:`, err.message);
      if (attempt === maxTries) {
        throw err;
      }
      const wait = baseDelay * attempt;
      await new Promise((res) => setTimeout(res, wait));
    }
  }
}

module.exports = { sequelize, Trade, initDatabase };
