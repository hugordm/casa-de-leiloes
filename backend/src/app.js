// Monta o app Express (rotas e middlewares), SEM chamar listen().
// Assim os testes (Supertest) importam o app sem abrir uma porta.
const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const devRoutes = require('./routes/dev.routes');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()) }));
app.use(express.json());

app.use('/health', healthRoutes);
app.use('/auth', authRoutes);

// Rotas de teste de papéis: nunca expostas em produção.
if (env.NODE_ENV !== 'production') {
  app.use('/dev', devRoutes);
}

// Precisam ficar por último: 404 para rotas desconhecidas e tratamento central de erros.
app.use(notFound);
app.use(errorHandler);

module.exports = app;
