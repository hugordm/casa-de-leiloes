// Corrente de hashes da auditoria + apelidos dos licitantes.
//
// Ideia: cada lance guarda um HMAC que "amarra" seus dados ao hash do lance anterior.
// Alterar qualquer lance antigo muda o hash dele e quebra todos os seguintes.
// Como o HMAC usa AUDIT_SECRET (só no ambiente, nunca no banco), quem tiver acesso
// apenas ao banco não consegue recalcular hashes válidos para forjar a corrente.
//
// Fase 4: geração (usada ao registrar lances).  Fase 5: verificação (GET /audit/:lotId).
const crypto = require('crypto');
const env = require('../config/env');

function hmac(data) {
  return crypto.createHmac('sha256', env.AUDIT_SECRET).update(data).digest('hex');
}

// prevHash do PRIMEIRO lance de um lote.
function genesisHash(lotId) {
  return `GENESIS:${lotId}`;
}

// hash_n = HMAC(prevHash | lotId | seq | bidderAlias | amountCents | createdAt ISO)
function computeBidHash({ prevHash, lotId, seq, bidderAlias, amountCents, createdAt }) {
  return hmac([prevHash, lotId, seq, bidderAlias, amountCents, createdAt.toISOString()].join('|'));
}

// Selo do lote = HMAC(lotId | bidCount | lastHash).
// Detecta o que a corrente sozinha não pega: remover ou acrescentar lances NO FIM.
function computeSeal({ lotId, bidCount, lastHash }) {
  return hmac([lotId, bidCount, lastHash ?? genesisHash(lotId)].join('|'));
}

// Apelido público: "Licitante #" + 6 caracteres de HMAC(lotId | bidderId).
// Mesmo licitante → mesmo apelido dentro do lote; apelidos diferentes entre lotes
// (não dá para rastrear a mesma pessoa de um lote para outro).
function bidderAlias(lotId, bidderId) {
  return `Licitante #${hmac(`${lotId}|${bidderId}`).slice(0, 6).toUpperCase()}`;
}

module.exports = { genesisHash, computeBidHash, computeSeal, bidderAlias };
