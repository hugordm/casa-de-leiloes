// Módulo próprio para os testes poderem substituí-lo por um mock (sem gastar créditos).
const Anthropic = require('@anthropic-ai/sdk');
const env = require('../config/env');

const TIMEOUT_MS = 10_000;
const MAX_RETRIES = 1; // com o timeout, o pior caso fica em ~20 s

let client = null;

function getAnthropicClient() {
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: TIMEOUT_MS, maxRetries: MAX_RETRIES });
  }
  return client;
}

module.exports = { getAnthropicClient };
