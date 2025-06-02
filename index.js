require('dotenv').config();
const Binance = require('binance-api-node').default;
const { RSI } = require('technicalindicators');
const cron = require('node-cron');
const winston = require('winston');

// Configuração do logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'bot.log' })
  ]
});

// Inicialização do cliente Binance
const client = Binance({
  apiKey: process.env.BINANCE_API_KEY,
  apiSecret: process.env.BINANCE_API_SECRET,
  // Usar o servidor de teste se necessário
  // useServerTime: true,
});

// Configurações
const SYMBOL = 'USDTBRL';
const INTERVAL = '1d'; // Intervalo diário
const RSI_PERIOD = 2; // Período padrão para o RSI
const RSI_THRESHOLD = parseInt(process.env.RSI_THRESHOLD) || 30;
const TRADE_AMOUNT_PERCENT = parseInt(process.env.TRADE_AMOUNT_PERCENT) || 50;

// Variáveis de estado
let lastBuyPrice = 0;
let inPosition = false;
let previousCandle = null;

/**
 * Calcula o RSI com base nos preços de fechamento
 * @param {Array} closePrices - Array com preços de fechamento
 * @returns {number} - Valor do RSI
 */
function calculateRSI(closePrices) {
  const rsiInput = {
    values: closePrices,
    period: RSI_PERIOD
  };
  
  const rsiValues = RSI.calculate(rsiInput);
  return rsiValues[rsiValues.length - 1];
}

/**
 * Obtém o saldo da conta
 * @returns {Object} - Objeto com saldos de BRL e USDT
 */
async function getAccountBalance() {
  try {
    const accountInfo = await client.accountInfo();
    const balances = {};
    
    accountInfo.balances.forEach(balance => {
      if (balance.asset === 'BRL' || balance.asset === 'USDT') {
        balances[balance.asset] = parseFloat(balance.free);
      }
    });
    
    logger.info(`Saldo atual: ${balances.BRL} BRL, ${balances.USDT} USDT`);
    return balances;
  } catch (error) {
    logger.error(`Erro ao obter saldo da conta: ${error.message}`);
    throw error;
  }
}

/**
 * Compra USDT usando BRL
 * @param {number} brlAmount - Quantidade de BRL para usar na compra
 */
async function buyUSDT(brlAmount) {
  try {
    logger.info(`Iniciando compra de USDT com ${brlAmount} BRL`);
    
    // Obtém o preço atual
    const tickerPrice = await client.prices({ symbol: SYMBOL });
    const currentPrice = parseFloat(tickerPrice[SYMBOL]);
    
    // Calcula a quantidade de USDT a ser comprada
    const usdtAmount = (brlAmount / currentPrice).toFixed(2);
    
    logger.info(`Preço atual: ${currentPrice} BRL por USDT`);
    logger.info(`Tentando comprar aproximadamente ${usdtAmount} USDT`);
    
    // Executa a ordem de compra
    const order = await client.order({
      symbol: SYMBOL,
      side: 'BUY',
      type: 'MARKET',
      quoteOrderQty: brlAmount.toFixed(2)
    });
    
    logger.info(`Compra realizada com sucesso! ID da ordem: ${order.orderId}`);
    logger.info(`Detalhes: Preço médio: ${order.fills[0].price}, Quantidade: ${order.executedQty} USDT`);
    
    lastBuyPrice = currentPrice;
    inPosition = true;
    
    return order;
  } catch (error) {
    logger.error(`Erro ao comprar USDT: ${error.message}`);
    throw error;
  }
}

/**
 * Vende todo o USDT para BRL
 * @param {number} usdtAmount - Quantidade de USDT para vender
 */
async function sellUSDT(usdtAmount) {
  try {
    logger.info(`Iniciando venda de ${usdtAmount} USDT`);
    
    // Executa a ordem de venda
    const order = await client.order({
      symbol: SYMBOL,
      side: 'SELL',
      type: 'MARKET',
      quantity: usdtAmount.toFixed(2)
    });
    
    logger.info(`Venda realizada com sucesso! ID da ordem: ${order.orderId}`);
    logger.info(`Detalhes: Preço médio: ${order.fills[0].price}, Quantidade: ${order.executedQty} USDT`);
    
    inPosition = false;
    
    return order;
  } catch (error) {
    logger.error(`Erro ao vender USDT: ${error.message}`);
    throw error;
  }
}

/**
 * Analisa os candles e executa a estratégia de trading
 */
async function analyzeMarket() {
  try {
    logger.info('Iniciando análise de mercado...');
    
    // Obtém os candles diários
    const candles = await client.candles({
      symbol: SYMBOL,
      interval: INTERVAL,
      limit: RSI_PERIOD + 1 // Precisamos de candles suficientes para calcular o RSI
    });
    
    // Extrai os preços de fechamento
    const closePrices = candles.map(candle => parseFloat(candle.close));
    
    // Calcula o RSI
    const currentRSI = calculateRSI(closePrices);
    logger.info(`RSI atual: ${currentRSI}`);
    
    // Obtém o candle atual e o anterior
    const currentCandle = candles[candles.length - 1];
    const previousCandle = candles[candles.length - 2];
    
    // Verifica se o RSI está abaixo do limite e não estamos em posição
    if (currentRSI <= RSI_THRESHOLD && !inPosition) {
      logger.info(`RSI (${currentRSI}) está abaixo do limite (${RSI_THRESHOLD}). Preparando para comprar USDT.`);
      
      // Obtém o saldo da conta
      const balances = await getAccountBalance();
      
      // Calcula o valor em BRL para comprar (50% do saldo)
      const brlAmount = balances.BRL * (TRADE_AMOUNT_PERCENT / 100);
      
      if (brlAmount > 10) { // Verifica se o valor é suficiente para uma ordem (mínimo arbitrário)
        await buyUSDT(brlAmount);
      } else {
        logger.info(`Valor insuficiente para compra (${brlAmount} BRL). Mínimo recomendado: 10 BRL`);
      }
    }
    // Verifica se estamos em posição e se a máxima do candle atual atingiu a abertura do candle anterior
    else if (inPosition && parseFloat(currentCandle.high) >= parseFloat(previousCandle.open)) {
      logger.info(`Máxima atual (${currentCandle.high}) atingiu ou superou a abertura do candle anterior (${previousCandle.open}). Preparando para vender USDT.`);
      
      // Obtém o saldo da conta
      const balances = await getAccountBalance();
      
      if (balances.USDT > 0) {
        await sellUSDT(balances.USDT);
      } else {
        logger.info('Sem USDT disponível para venda.');
      }
    } else {
      if (inPosition) {
        logger.info(`Em posição, mas condições de venda não atingidas. Máxima atual: ${currentCandle.high}, Abertura anterior: ${previousCandle.open}`);
      } else {
        logger.info(`RSI (${currentRSI}) acima do limite (${RSI_THRESHOLD}). Aguardando oportunidade de compra.`);
      }
    }
  } catch (error) {
    logger.error(`Erro durante a análise de mercado: ${error.message}`);
  }
}

/**
 * Função principal que inicia o robô
 */
async function startBot() {
  try {
    logger.info('Iniciando o robô de trading Binance...');
    
    // Verifica se as credenciais foram configuradas
    if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET) {
      logger.error('Credenciais da API Binance não configuradas. Verifique o arquivo .env');
      process.exit(1);
    }
    
    // Verifica a conexão com a Binance
    try {
      await client.ping();
      logger.info('Conexão com a Binance estabelecida com sucesso!');
    } catch (error) {
      logger.error(`Falha na conexão com a Binance: ${error.message}`);
      process.exit(1);
    }
    
    // Executa a análise inicial
    await analyzeMarket();
    
    // Agenda a execução diária às 00:05 (após o fechamento do candle diário)
    cron.schedule('5 0 * * *', async () => {
      logger.info('Executando análise agendada...');
      await analyzeMarket();
    });
    
    logger.info('Robô iniciado com sucesso! Aguardando próxima execução agendada.');
    
  } catch (error) {
    logger.error(`Erro ao iniciar o robô: ${error.message}`);
    process.exit(1);
  }
}

// Inicia o robô
startBot();

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  logger.error(`Erro não tratado: ${error.message}`);
  logger.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promessa rejeitada não tratada:');
  logger.error(`Razão: ${reason}`);
});

// Tratamento de sinais de encerramento
process.on('SIGINT', async () => {
  logger.info('Encerrando o robô...');
  process.exit(0);
});
