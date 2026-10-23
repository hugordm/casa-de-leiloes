// Regras de lance — a parte mais sensível do sistema.
const prisma = require('../lib/prisma');
const AppError = require('../errors/AppError');
const walletService = require('./wallet.service');
const hashChain = require('./hashChain.service');
const { serializeLot } = require('./lot.service');
const { getMinNextBidCents } = require('../utils/lot');
const { isCents } = require('../utils/validation');
const { formatBRL } = require('../utils/money');

const MAX_BID_CENTS = 1_000_000_000;
const ANTI_SNIPING_WINDOW_MS = 2 * 60 * 1000; // faltando menos de 2 min...
const ANTI_SNIPING_EXTENSION_MS = 2 * 60 * 1000; // ...o leilão ganha +2 min

async function placeBid(lotId, userId, amountCents) {
  // Formato do valor (antes das regras de negócio): inteiro em centavos.
  if (!isCents(amountCents, { min: 1, max: MAX_BID_CENTS })) {
    throw new AppError(400, 'INVALID_AMOUNT', 'Informe um valor de lance válido');
  }

  return prisma.$transaction(async (tx) => {
    // TRAVAS (SELECT ... FOR UPDATE), sempre na ordem lote → usuário:
    // - lote: dois lances simultâneos no mesmo lote são processados um de cada vez,
    //   então o segundo já enxerga o lance atual/líder atualizados pelo primeiro;
    // - usuário: o mesmo licitante dando lances em dois lotes ao mesmo tempo não
    //   consegue usar o mesmo saldo disponível duas vezes.
    // Os travamentos duram até o fim da transação (commit ou rollback).
    const lockedLot = await tx.$queryRaw`SELECT id FROM "Lot" WHERE id = ${lotId} FOR UPDATE`;
    const lot = lockedLot.length ? await tx.lot.findUnique({ where: { id: lotId } }) : null;
    const now = new Date();

    // 1. Lote inexistente ou cancelado
    if (!lot || lot.status === 'CANCELLED') {
      throw new AppError(404, 'LOT_NOT_FOUND', 'Lote não encontrado');
    }
    // 2. Ainda não começou
    if (now < lot.startsAt) {
      throw new AppError(409, 'LOT_NOT_STARTED', 'Lote ainda não iniciado');
    }
    // 3. Já terminou (ou já foi liquidado)
    if (now >= lot.endsAt || lot.status === 'SETTLED') {
      throw new AppError(409, 'LOT_ENDED', 'Lote encerrado');
    }

    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId } });

    // 4. Só licitante dá lance (a rota já bloqueia; aqui é a segunda barreira)
    if (!user || user.role !== 'BIDDER') {
      throw new AppError(403, 'ROLE_CANNOT_BID', 'Leiloeiros não podem dar lances');
    }
    // 5. Não pode cobrir o próprio lance
    if (lot.leaderId === userId) {
      throw new AppError(409, 'ALREADY_LEADING', 'Você já está ganhando');
    }
    // 6. Valor mínimo: lance inicial (sem lances) ou lance atual + incremento
    const minCents = getMinNextBidCents(lot);
    if (amountCents < minCents) {
      throw new AppError(
        400,
        'BID_TOO_LOW',
        `Lance abaixo do mínimo (mínimo: ${formatBRL(minCents)})`
      );
    }
    // 7. Saldo disponível = total - comprometido em outros lotes que ele lidera.
    // (Ele não lidera ESTE lote — regra 5 —, então este lote não entra na soma.)
    const committedCents = await walletService.getCommittedCents(userId, tx);
    const availableCents = user.balanceCents - committedCents;
    if (amountCents > availableCents) {
      throw new AppError(400, 'INSUFFICIENT_BALANCE', 'Saldo insuficiente');
    }

    // ---- Lance aceito ----
    const seq = lot.bidCount + 1;
    const bidderAlias = hashChain.bidderAlias(lotId, userId);
    const prevHash = lot.lastHash ?? hashChain.genesisHash(lotId);
    // createdAt é definido aqui (e não pelo banco) porque entra no cálculo do hash.
    const createdAt = now;
    const hash = hashChain.computeBidHash({
      prevHash,
      lotId,
      seq,
      bidderAlias,
      amountCents,
      createdAt,
    });

    const bid = await tx.bid.create({
      data: { lotId, bidderId: userId, amountCents, seq, bidderAlias, createdAt, prevHash, hash },
    });

    // Anti-sniping: lance nos últimos 2 minutos estende o fim em +2 min,
    // dando chance de resposta aos outros licitantes.
    const extended = lot.endsAt.getTime() - now.getTime() < ANTI_SNIPING_WINDOW_MS;
    const endsAt = extended
      ? new Date(lot.endsAt.getTime() + ANTI_SNIPING_EXTENSION_MS)
      : lot.endsAt;

    const updatedLot = await tx.lot.update({
      where: { id: lotId },
      data: {
        currentBidCents: amountCents,
        leaderId: userId,
        bidCount: seq,
        lastHash: hash,
        seal: hashChain.computeSeal({ lotId, bidCount: seq, lastHash: hash }),
        endsAt,
      },
      include: { auctioneer: { select: { id: true, name: true } } },
    });

    return {
      bid: {
        seq: bid.seq,
        bidderAlias: bid.bidderAlias,
        amountCents: bid.amountCents,
        createdAt: bid.createdAt,
      },
      extended,
      lot: serializeLot(updatedLot, now),
    };
  });
}

// GET /me/bids — lotes em que o licitante deu lance, com a situação dele em cada um.
async function listMyBids(userId) {
  const lots = await prisma.lot.findMany({
    where: { bids: { some: { bidderId: userId } } },
    orderBy: { endsAt: 'desc' },
    include: { auctioneer: { select: { id: true, name: true } } },
  });

  // Maior lance do usuário em cada lote
  const myMax = await prisma.bid.groupBy({
    by: ['lotId'],
    where: { bidderId: userId },
    _max: { amountCents: true },
  });
  const myMaxByLot = new Map(myMax.map((m) => [m.lotId, m._max.amountCents]));

  const now = new Date();
  return lots.map((lot) => ({
    lot: serializeLot(lot, now),
    myBestBidCents: myMaxByLot.get(lot.id),
    isLeader: lot.leaderId === userId && lot.status !== 'CANCELLED',
    won: lot.winnerId === userId,
  }));
}

module.exports = { placeBid, listMyBids };
