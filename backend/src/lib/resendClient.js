// Cliente do Resend criado sob demanda (só quando há chave).
// Fica num módulo próprio para os testes poderem substituí-lo por um mock.
const { Resend } = require('resend');
const env = require('../config/env');

let client = null;

function getResendClient() {
  if (!client) client = new Resend(env.RESEND_API_KEY);
  return client;
}

module.exports = { getResendClient };
