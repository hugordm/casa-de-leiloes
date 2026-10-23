// Cliente da API da Anthropic criado sob demanda (só quando há chave).
// Fica num módulo próprio para os testes poderem substituí-lo por um mock (sem gastar créditos).
const Anthropic = require('@anthropic-ai/sdk');
const env = require('../config/env');

const TIMEOUT_MS = 10_000; // cada tentativa espera no máximo 10 s
const MAX_RETRIES = 1; // o SDK repete 1 vez em erro temporário (rede, 429, 5xx) → no pior caso ~20 s

let client = null;

function getAnthropicClient() {
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: TIMEOUT_MS, maxRetries: MAX_RETRIES });
  }
  return client;
}

module.exports = { getAnthropicClient };
