// Carteira simulada do licitante.
//
//   saldo total   = User.balanceCents (só muda com depósito e com a liquidação)
//   comprometido  = soma dos lances em que o usuário é LÍDER em lotes ACTIVE
//   disponível    = total - comprometido
//
// "Comprometido" NÃO é gravado: é calculado a cada consulta, então nunca dessincroniza.
// Quando alguém supera o lance, o usuário deixa de ser líder e o valor volta
// sozinho para o disponível — não há nenhum "estorno" a fazer.
const prisma = require('../lib/prisma');
const AppError = require('../errors/AppError');
const { isCents } = require('../utils/validation');

const MAX_DEPOSIT_CENTS = 10_000_000; // R$ 100.000,00 por depósito
const MAX_BALANCE_CENTS = 1_000_000_000; // R$ 10.000.000,00 de saldo total
const STATEMENT_LIMIT = 50;

// `db` pode ser o prisma normal ou o `tx` de uma transação (bid.service usa assim).
async function getCommittedCents(userId, db = prisma) {
  const result = await db.lot.aggregate({
    _sum: { currentBidCents: true },
    where: { leaderId: userId, status: 'ACTIVE' },
  });
  return result._sum.currentBidCents ?? 0;
}

async function getWallet(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const committedCents = await getCommittedCents(userId);

  const transactions = await prisma.walletTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: STATEMENT_LIMIT,
    include: { lot: { select: { id: true, title: true } } },
  });

  return {
    balanceCents: user.balanceCents,
    committedCents,
    availableCents: user.balanceCents - committedCents,
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amountCents: t.amountCents,
      lot: t.lot,
      createdAt: t.createdAt,
    })),
  };
}

async function deposit(userId, amountCents) {
  if (!isCents(amountCents, { min: 1, max: MAX_DEPOSIT_CENTS })) {
    throw new AppError(
      400,
      'INVALID_DEPOSIT',
      'Valor de depósito inválido (em centavos, entre R$ 0,01 e R$ 100.000,00)'
    );
  }

  await prisma.$transaction(async (tx) => {
    // Trava o usuário para que dois depósitos simultâneos não furem o teto de saldo.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId } });

    if (user.balanceCents + amountCents > MAX_BALANCE_CENTS) {
      throw new AppError(400, 'BALANCE_LIMIT', 'Limite de saldo da carteira atingido');
    }

    await tx.user.update({
      where: { id: userId },
      data: { balanceCents: { increment: amountCents } },
    });
    await tx.walletTransaction.create({ data: { userId, type: 'DEPOSIT', amountCents } });
  });

  return getWallet(userId);
}

module.exports = { getCommittedCents, getWallet, deposit };
