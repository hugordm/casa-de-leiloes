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

// Segredos precisam existir E ser longos: um segredo curto pode ser adivinhado
// por força bruta, e aí tanto o JWT quanto a auditoria perderiam o valor.
function requiredSecret(name) {
  const value = required(name);
  if (value.length < 16) {
    throw new Error(`${name} muito curto: use pelo menos 16 caracteres aleatórios`);
  }
  return value;
}

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT) || 3333,
  DATABASE_URL: required('DATABASE_URL'),
  JWT_SECRET: requiredSecret('JWT_SECRET'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1d',
  // Segredo da corrente de hashes da auditoria e dos apelidos. Fica só no ambiente, nunca no banco:
  // quem tiver acesso só ao banco não consegue recalcular os hashes. A API não inicia sem ele.
  AUDIT_SECRET: requiredSecret('AUDIT_SECRET'),
  // Endereços do front autorizados no CORS (separados por vírgula)
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  // API do Art Institute of Chicago (catálogo de obras)
  AIC_API_URL: process.env.AIC_API_URL || 'https://api.artic.edu/api/v1',
  // A AIC bloqueia (Cloudflare) requisições sem este cabeçalho de identificação
  AIC_USER_AGENT: process.env.AIC_USER_AGENT || 'casa-de-leiloes-verzel',
};
