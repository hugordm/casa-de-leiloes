// Lê as variáveis de ambiente em um único lugar.
// Em desenvolvimento elas vêm do arquivo backend/.env; em produção (Render), do painel.
require('dotenv').config({ quiet: true });

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT) || 3333,
  DATABASE_URL: required('DATABASE_URL'),
  JWT_SECRET: required('JWT_SECRET'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1d',
  // Endereços do front autorizados no CORS (separados por vírgula)
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  // API do Art Institute of Chicago (catálogo de obras)
  AIC_API_URL: process.env.AIC_API_URL || 'https://api.artic.edu/api/v1',
  // A AIC bloqueia (Cloudflare) requisições sem este cabeçalho de identificação
  AIC_USER_AGENT: process.env.AIC_USER_AGENT || 'casa-de-leiloes-verzel',
};
