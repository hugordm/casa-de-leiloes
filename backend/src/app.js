// Monta o app Express (rotas e middlewares), SEM chamar listen().
// Assim os testes (Supertest) importam o app sem abrir uma porta.
const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const catalogRoutes = require('./routes/catalog.routes');
const lotsRoutes = require('./routes/lots.routes');
const walletRoutes = require('./routes/wallet.routes');
const meRoutes = require('./routes/me.routes');
const publicRoutes = require('./routes/public.routes');
const imagesRoutes = require('./routes/images.routes');
const docsRoutes = require('./routes/docs.routes');
const assistantRoutes = require('./routes/assistant.routes');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();

// No Render a API fica atrás de um proxy: sem isto, req.ip seria o IP do proxy e o limite
// por IP do assistente valeria para todos os visitantes juntos. Só em produção, porque
// localmente não há proxy e o cabeçalho X-Forwarded-For poderia ser forjado pelo cliente.
if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

app.use(cors({ origin: env.CORS_ORIGINS }));
app.use(express.json());

app.use('/health', healthRoutes);
app.use('/docs', docsRoutes); // Swagger UI (docs/openapi.yaml)
app.use('/auth', authRoutes);
app.use('/catalog', catalogRoutes);
app.use('/lots', lotsRoutes);
app.use('/wallet', walletRoutes);
app.use('/me', meRoutes);
app.use('/images', imagesRoutes);
app.use('/assistant', assistantRoutes); // chat com a IA (Anthropic)
app.use(publicRoutes); // /audit/:lotId e /receipts/:code

// Precisam ficar por último: 404 para rotas desconhecidas e tratamento central de erros.
app.use(notFound);
app.use(errorHandler);

module.exports = app;
