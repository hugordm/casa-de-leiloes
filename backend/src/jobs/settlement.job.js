// Job de liquidação: a cada ~15s procura lotes vencidos e liquida.
// Iniciado SOMENTE pelo server.js — os testes importam o app.js e, por isso, nunca o disparam.
const settlementService = require('../services/settlement.service');

const DEFAULT_INTERVAL_MS = 15 * 1000;

function startSettlementJob({ intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  let running = false;

  async function tick() {
    // Se a rodada anterior ainda não terminou, pula esta (evita rodadas sobrepostas).
    if (running) return;
    running = true;
    try {
      const results = await settlementService.settleDueLots();
      for (const r of results.filter((x) => x.settled)) {
        console.log(`[settlement] lote ${r.lotId} liquidado (${r.outcome})`);
      }
    } catch (err) {
      console.error('[settlement] erro na rodada do job:', err);
    } finally {
      running = false;
    }
  }

  tick(); // roda já na subida: liquida o que venceu enquanto o servidor estava parado/dormindo
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}

module.exports = { startSettlementJob };
