// Iniciado SOMENTE pelo server.js: os testes importam o app.js e, por isso, nunca o disparam.
const settlementService = require('../services/settlement.service');
const notifications = require('../services/email/notification.service');
const demoLotService = require('../services/demoLot.service');

const DEFAULT_INTERVAL_MS = 15 * 1000;

function startSettlementJob({ intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  let running = false;
  let digestRunning = false;
  let warnedNoDemoAuctioneer = false;

  async function tick() {
    sendDigests(); // em paralelo: e-mail lento não pode atrasar a liquidação
    // Se a rodada anterior ainda não terminou, pula esta (evita rodadas sobrepostas).
    if (running) return;
    running = true;
    try {
      const results = await settlementService.settleDueLots();
      for (const r of results.filter((x) => x.settled)) {
        console.log(`[settlement] lote ${r.lotId} liquidado (${r.outcome})`);
      }
      // Depois de liquidar: um lote que acabou de encerrar já não conta como "ao vivo".
      const demo = await demoLotService.ensureLiveDemoLot();
      if (demo.created) console.log(`[demo] nenhum lote ao vivo: lote de demonstração ${demo.lotId} criado`);
      if (demo.reason === 'NO_AUCTIONEER' && !warnedNoDemoAuctioneer) {
        console.warn('[demo] DEMO_KEEP_LIVE ligado, mas o leiloeiro demo não existe');
        warnedNoDemoAuctioneer = true; // avisa uma vez, não a cada 15 s
      }
    } catch (err) {
      console.error('[settlement] erro na rodada do job:', err);
    } finally {
      running = false;
    }
  }

  // Trava própria, separada da liquidação: lentidão ou erro nos e-mails não atrapalha
  // liquidar (e vice-versa).
  async function sendDigests() {
    if (digestRunning) return;
    digestRunning = true;
    try {
      await notifications.sendDueBidDigests();
    } catch (err) {
      console.error('[email] erro ao enviar resumos de lances:', err);
    } finally {
      digestRunning = false;
    }
  }

  tick(); // roda já na subida: liquida o que venceu enquanto o servidor estava parado/dormindo
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}

module.exports = { startSettlementJob };
