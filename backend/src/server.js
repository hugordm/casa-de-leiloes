// Ponto de entrada: sobe o servidor HTTP e o job de liquidação.
const app = require('./app');
const env = require('./config/env');
const { startSettlementJob } = require('./jobs/settlement.job');

app.listen(env.PORT, () => {
  console.log(`API rodando em http://localhost:${env.PORT}`);
});

// Segunda proteção (a primeira é os testes não importarem este arquivo).
if (env.NODE_ENV !== 'test') {
  startSettlementJob();
}
