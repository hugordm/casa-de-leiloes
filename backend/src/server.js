// Ponto de entrada: sobe o servidor HTTP.
// (O job de liquidação será iniciado aqui na Fase 5.)
const app = require('./app');
const env = require('./config/env');

app.listen(env.PORT, () => {
  console.log(`API rodando em http://localhost:${env.PORT}`);
});
