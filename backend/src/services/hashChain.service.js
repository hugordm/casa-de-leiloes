// Corrente de hashes da auditoria + apelidos dos licitantes.
//
// Ideia: cada lance guarda um HMAC que "amarra" seus dados ao hash do lance anterior.
// Alterar qualquer lance antigo muda o hash dele e quebra todos os seguintes.
// Como o HMAC usa AUDIT_SECRET (só no ambiente, nunca no banco), quem tiver acesso
// apenas ao banco não consegue recalcular hashes válidos para forjar a corrente.
//
const crypto = require('crypto');
const env = require('../config/env');

function hmac(data) {
  return crypto.createHmac('sha256', env.AUDIT_SECRET).update(data).digest('hex');
}

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

// ---------- Verificação ----------

function verifyChain(lot, bids) {
  const ordered = [...bids].sort((a, b) => a.seq - b.seq);
  let expectedPrevHash = genesisHash(lot.id);

  for (let i = 0; i < ordered.length; i++) {
    const bid = ordered[i];
    const expectedSeq = i + 1;

    // Buraco no seq = lance removido do meio da corrente.
    if (bid.seq !== expectedSeq) {
      return broken(expectedSeq, 'SEQ_GAP', `Falta o lance #${expectedSeq} na sequência`);
    }
    if (bid.prevHash !== expectedPrevHash) {
      return broken(bid.seq, 'PREV_HASH_MISMATCH', `O lance #${bid.seq} não aponta para o lance anterior`);
    }
    const recalculated = computeBidHash({
      prevHash: bid.prevHash,
      lotId: lot.id,
      seq: bid.seq,
      bidderAlias: bid.bidderAlias,
      amountCents: bid.amountCents,
      createdAt: bid.createdAt,
    });
    if (recalculated !== bid.hash) {
      return broken(bid.seq, 'HASH_MISMATCH', `Os dados do lance #${bid.seq} foram alterados`);
    }
    // bidderId não entra no hash (só o apelido), então a troca de autor é pega aqui.
    if (bidderAlias(lot.id, bid.bidderId) !== bid.bidderAlias) {
      return broken(bid.seq, 'BIDDER_MISMATCH', `O autor do lance #${bid.seq} foi alterado`);
    }
    expectedPrevHash = bid.hash;
  }

  const last = ordered[ordered.length - 1] ?? null;
  const tailSeq = ordered.length + 1;

  // Remover ou acrescentar lances no FIM não quebra a corrente; só o lote denuncia.
  if (lot.bidCount !== ordered.length || (lot.lastHash ?? null) !== (last?.hash ?? null)) {
    return broken(
      Math.min(ordered.length, lot.bidCount) + 1,
      'CHAIN_TAIL_MISMATCH',
      'Lance(s) removido(s) ou adicionado(s) no fim da corrente'
    );
  }
  // Sem o selo, bastaria "consertar" bidCount/lastHash do lote junto com a adulteração.
  if (lot.seal !== computeSeal({ lotId: lot.id, bidCount: lot.bidCount, lastHash: lot.lastHash })) {
    return broken(tailSeq, 'SEAL_MISMATCH', 'O selo do lote não confere: o fim da corrente foi adulterado');
  }
  // Valor/líder/vencedor do lote não estão no hash: conferidos contra o último lance.
  const stateOk =
    (lot.currentBidCents ?? null) === (last?.amountCents ?? null) &&
    (lot.leaderId ?? null) === (last?.bidderId ?? null) &&
    (lot.status !== 'SETTLED' ||
      ((lot.winnerId ?? null) === (last?.bidderId ?? null) &&
        (lot.finalPriceCents ?? null) === (last?.amountCents ?? null)));
  if (!stateOk) {
    return broken(undefined, 'LOT_STATE_MISMATCH', 'O lance atual/vencedor do lote não confere com os lances');
  }

  return { intact: true };
}

function broken(brokenAtSeq, reason, message) {
  return { intact: false, brokenAtSeq, reason, message };
}

module.exports = { genesisHash, computeBidHash, computeSeal, bidderAlias, verifyChain };
