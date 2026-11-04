// Comprovante público: mostra o APELIDO do vencedor no lote, nunca nome ou e-mail.
const prisma = require('../lib/prisma');
const AppError = require('../errors/AppError');
const { bidderAlias } = require('./hashChain.service');
const { toPublicImageUrl } = require('./image.service');

async function getReceipt(code) {
  const receipt =
    typeof code === 'string' && code.length <= 64
      ? await prisma.receipt.findUnique({ where: { code }, include: { lot: true } })
      : null;
  if (!receipt) throw new AppError(404, 'RECEIPT_NOT_FOUND', 'Comprovante não encontrado');

  const { lot } = receipt;
  return {
    code: receipt.code,
    amountCents: receipt.amountCents,
    settledAt: receipt.createdAt,
    winnerAlias: bidderAlias(lot.id, receipt.winnerId),
    lot: {
      id: lot.id,
      title: lot.title,
      artist: lot.artist,
      imageUrl: toPublicImageUrl(lot.imageUrl),
      attributes: lot.attributes,
      bidCount: lot.bidCount,
      endsAt: lot.endsAt,
    },
    auditUrl: `/auditoria/${lot.id}`,
    auditApiUrl: `/audit/${lot.id}`,
  };
}

module.exports = { getReceipt };
