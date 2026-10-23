// GET /audit/:lotId — verificação pública da corrente de lances de um lote.
const prisma = require('../lib/prisma');
const AppError = require('../errors/AppError');
const { verifyChain } = require('./hashChain.service');
const { getDisplayStatus } = require('../utils/lot');

async function getAudit(lotId) {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new AppError(404, 'LOT_NOT_FOUND', 'Lote não encontrado');

  const bids = await prisma.bid.findMany({ where: { lotId }, orderBy: { seq: 'asc' } });
  const result = verifyChain(lot, bids);

  return {
    lot: {
      id: lot.id,
      title: lot.title,
      artist: lot.artist,
      status: lot.status,
      displayStatus: getDisplayStatus(lot),
      bidCount: lot.bidCount,
      lastHash: lot.lastHash,
      seal: lot.seal,
    },
    intact: result.intact,
    brokenAtSeq: result.brokenAtSeq,
    reason: result.reason,
    message: result.intact ? 'Corrente íntegra: nenhum lance foi alterado, removido ou inserido' : result.message,
    // Só dados públicos: apelido, nunca bidderId/nome/e-mail.
    bids: bids.map((b) => ({
      seq: b.seq,
      bidderAlias: b.bidderAlias,
      amountCents: b.amountCents,
      createdAt: b.createdAt,
      prevHash: b.prevHash,
      hash: b.hash,
      // Lances antes do ponto de quebra continuam confiáveis.
      valid: result.intact || result.brokenAtSeq === undefined || b.seq < result.brokenAtSeq,
    })),
  };
}

module.exports = { getAudit };
