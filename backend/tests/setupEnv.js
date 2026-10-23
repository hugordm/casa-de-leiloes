// Roda antes de cada arquivo de teste, ANTES de importar o app.
// Como o dotenv não sobrescreve variáveis já definidas, estas vencem as do .env.
Object.assign(process.env, require('./testEnv'));
