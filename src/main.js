const cron = require('node-cron');
const config = require('./config/env');
const { initDatabase } = require('./config/database');
const { initialSyncOpenOrders, decideAndTrade, startExitMonitoring } = require('./services/trading');

let isProcessing = false;

async function bootstrap() {
  await initDatabase();
  await initialSyncOpenOrders();
  startExitMonitoring();

  // Scheduler parametrizável via .env
  if (config.scheduler.enabled) {
    const expr = config.scheduler.cron;
    if (!cron.validate(expr)) {
      console.error(`Expressão CRON inválida em SCHEDULER_CRON: "${expr}". Scheduler não iniciado.`);
    } else {
      cron.schedule(expr, async () => {
        if (isProcessing) {
          console.warn(`[${new Date().toISOString()}] Rodada anterior ainda em execução. Pulando nova execução.`);
          return;
        }
        isProcessing = true;
        const startedAt = new Date();
        console.log(`[${startedAt.toISOString()}] Rodada de análise iniciada`);
        try {
          const summary = await decideAndTrade();
          const finishedAt = new Date();
          if (summary) {
            console.log(
              `[${finishedAt.toISOString()}] Rodada de análise finalizada | USDT disponível: ${Number(summary.usdtAvailable).toFixed(2)} | Capital para compras: ${Number(summary.capitalDisponivel).toFixed(2)} | Trades em aberto: ${summary.openTradesCount}`
            );
          } else {
            console.log(`[${finishedAt.toISOString()}] Rodada de análise finalizada`);
          }
        } catch (err) {
          console.error('Erro na rotina principal:', err.message);
        } finally {
          isProcessing = false;
        }
      });
      console.log(`Scheduler habilitado com CRON: ${expr}`);
    }
  } else {
    console.log('Scheduler desabilitado por configuração (.env SCHEDULER_ENABLED=false).');
  }

  // Execução imediata na inicialização, se habilitada
  if (config.scheduler.runOnStart) {
    if (isProcessing) {
      console.warn(`[${new Date().toISOString()}] Rodada anterior ainda em execução. Pulando runOnStart.`);
    } else {
      isProcessing = true;
      const startedAt = new Date();
      console.log(`[${startedAt.toISOString()}] Rodada de análise iniciada (runOnStart)`);
      try {
        const summary = await decideAndTrade();
        const finishedAt = new Date();
        if (summary) {
          console.log(
            `[${finishedAt.toISOString()}] Rodada de análise finalizada (runOnStart) | USDT disponível: ${Number(summary.usdtAvailable).toFixed(2)} | Capital para compras: ${Number(summary.capitalDisponivel).toFixed(2)} | Trades em aberto: ${summary.openTradesCount}`
          );
        } else {
          console.log(`[${finishedAt.toISOString()}] Rodada de análise finalizada (runOnStart)`);
        }
      } catch (e) {
        console.error('Erro na rotina principal (runOnStart):', e.message);
      } finally {
        isProcessing = false;
      }
    }
  }
}

bootstrap().catch((err) => {
  console.error('Erro no bootstrap:', err.message);
  process.exit(1);
});
