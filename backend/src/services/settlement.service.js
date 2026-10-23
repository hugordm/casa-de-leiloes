// Liquidação: quando o lote encerra, o dinheiro sai do vencedor e vai para o leiloeiro.
//
// Chamada por:
//   - jobs/settlement.job.js (a cada ~15s, para todos os lotes vencidos);
//   - "sob demanda" ao consultar um lote/lista vencido (garante consistência se o
//     servidor ficou dormindo no Render e o job não rodou na hora).
//
// É IDEMPOTENTE: rodar duas vezes (ou o job e uma consulta ao mesmo tempo) não liquida
// duas vezes, porque tudo acontece com a linha do lote travada e o status é conferido
// de novo depois da trava.
const crypto = require('crypto');
const prisma = require('../lib/prisma');

const BATCH_SIZE = 50;

// Código público do comprovante: aleatório e impossível de adivinhar
// (diferente de um id sequencial, ninguém acha o comprovante dos outros chutando números).
function generateReceiptCode() {
  return crypto.randomBytes(12).toString('base64url'); // 16 caracteres [A-Za-z0-9_-]
}

// Liquida UM lote, se ele estiver mesmo vencido. Retorna { settled, outcome, receiptCode? }.
async function settleLot(lotId) {
  return prisma.$transaction(async (tx) => {
    // Mesma trava usada pelos lances: se um lance estiver sendo processado neste lote,
    // a liquidação espera ele terminar (e vice-versa).
    const locked = await tx.$queryRaw`SELECT id FROM "Lot" WHERE id = ${lotId} FOR UPDATE`;
    if (locked.length === 0) return { settled: false, outcome: 'NOT_FOUND' };

    // Relê o lote DEPOIS de travar: os dados podem ter mudado enquanto esperávamos.
    const lot = await tx.lot.findUnique({ where: { id: lotId } });
    const now = new Date();

    // Já liquidado (ou cancelado) → não faz nada. É isto que torna a liquidação idempotente.
    if (lot.status !== 'ACTIVE') {
      return { settled: false, outcome: lot.status === 'SETTLED' ? 'ALREADY_SETTLED' : 'CANCELLED' };
    }
    // Ainda não venceu. Importante: o anti-sniping pode ter estendido o endsAt
    // depois que o job decidiu que este lote estava vencido.
    if (now < lot.endsAt) return { settled: false, outcome: 'NOT_DUE' };

    // Sem lances: encerra sem vencedor, nenhum dinheiro se move.
    if (!lot.leaderId) {
      await tx.lot.update({ where: { id: lotId }, data: { status: 'SETTLED' } });
      return { settled: true, outcome: 'UNSOLD' };
    }

    const winnerId = lot.leaderId;
    const amountCents = lot.currentBidCents;

    // Trava vencedor e leiloeiro (sempre em ordem de id, para evitar deadlock
    // entre duas liquidações que envolvam as mesmas pessoas).
    await tx.$queryRaw`SELECT id FROM "User" WHERE id IN (${winnerId}, ${lot.auctioneerId}) ORDER BY id FOR UPDATE`;

    // O valor já estava "comprometido" (reservado) desde o lance; agora sai de fato do saldo.
    // Como o lote deixa de ser ACTIVE, ele também deixa de contar como comprometido,
    // então o disponível do vencedor não muda nesta operação — só o total.
    await tx.user.update({
      where: { id: winnerId },
      data: { balanceCents: { decrement: amountCents } },
    });
    await tx.user.update({
      where: { id: lot.auctioneerId },
      data: { balanceCents: { increment: amountCents } },
    });
    // Valores positivos; o tipo (DEBIT/CREDIT) diz a direção.
    await tx.walletTransaction.createMany({
      data: [
        { userId: winnerId, type: 'DEBIT', amountCents, lotId },
        { userId: lot.auctioneerId, type: 'CREDIT', amountCents, lotId },
      ],
    });

    // Receipt.lotId é @unique: segunda barreira contra comprovante duplicado.
    const receipt = await tx.receipt.create({
      data: { code: generateReceiptCode(), lotId, winnerId, amountCents },
    });

    await tx.lot.update({
      where: { id: lotId },
      data: { status: 'SETTLED', winnerId, finalPriceCents: amountCents },
    });

    return { settled: true, outcome: 'SOLD', receiptCode: receipt.code };
  });
}

// Liquida os lotes vencidos (ACTIVE com endsAt <= agora).
// `extraWhere` permite restringir, ex.: { auctioneerId } ou { leaderId }.
async function settleDueLots(extraWhere = {}) {
  const due = await prisma.lot.findMany({
    where: { status: 'ACTIVE', endsAt: { lte: new Date() }, ...extraWhere },
    select: { id: true },
    orderBy: { endsAt: 'asc' },
    take: BATCH_SIZE,
  });

  const results = [];
  for (const { id } of due) {
    try {
      results.push({ lotId: id, ...(await settleLot(id)) });
    } catch (err) {
      // Um lote com problema não impede a liquidação dos outros.
      console.error(`[settlement] falha ao liquidar o lote ${id}:`, err);
    }
  }
  return results;
}

// Liquidação sob demanda de um lote específico (usada em GET /lots/:id).
async function settleIfDue(lotId) {
  const lot = await prisma.lot.findUnique({
    where: { id: lotId },
    select: { status: true, endsAt: true },
  });
  if (lot && lot.status === 'ACTIVE' && lot.endsAt <= new Date()) {
    await settleLot(lotId);
  }
}

module.exports = { settleLot, settleDueLots, settleIfDue };
