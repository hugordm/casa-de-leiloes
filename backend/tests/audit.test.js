// Auditoria: os testes simulam um atacante com acesso DIRETO ao banco (via prisma),
// mas sem o AUDIT_SECRET, e verificam que GET /audit/:lotId detecta cada adulteração.
const crypto = require('crypto');
const { prisma, request, app, resetDb, createUser, createLot, bid } = require('./helpers');
const settlementService = require('../src/services/settlement.service');

let auctioneer;
let ana;
let bruno;
let lot;

// Lote com 3 lances: #1 Ana R$ 1.000 | #2 Bruno R$ 1.050 | #3 Ana R$ 1.100
beforeEach(async () => {
  await resetDb();
  auctioneer = await createUser({ role: 'AUCTIONEER' });
  ana = await createUser({ balanceCents: 500000 });
  bruno = await createUser({ balanceCents: 500000 });
  lot = await createLot(auctioneer);
  await bid(lot.id, ana, 100000);
  await bid(lot.id, bruno, 105000);
  await bid(lot.id, ana, 110000);
});

afterAll(() => prisma.$disconnect());

async function audit(lotId = lot.id) {
  const res = await request(app).get(`/audit/${lotId}`); // público: sem token
  return res.body;
}

function getBid(seq) {
  return prisma.bid.findFirst({ where: { lotId: lot.id, seq } });
}

test('corrente íntegra', async () => {
  const result = await audit();

  expect(result.intact).toBe(true);
  expect(result.brokenAtSeq).toBeUndefined();
  expect(result.bids.map((b) => b.seq)).toEqual([1, 2, 3]);
  expect(result.bids.every((b) => b.valid)).toBe(true);
});

test('lote sem lances também é íntegro (selo criado junto com o lote)', async () => {
  const empty = await createLot(auctioneer);
  expect((await audit(empty.id)).intact).toBe(true);
});

test('lote liquidado continua íntegro', async () => {
  await prisma.lot.update({ where: { id: lot.id }, data: { endsAt: new Date(Date.now() - 1000) } });
  await settlementService.settleLot(lot.id);
  expect((await audit()).intact).toBe(true);
});

test('resposta pública não expõe nome, e-mail nem ids dos licitantes', async () => {
  const body = JSON.stringify(await audit());
  expect(body).not.toContain(ana.email);
  expect(body).not.toContain(ana.name);
  expect(body).not.toContain('bidderId');
});

describe('detecta adulteração direto no banco', () => {
  test('alteração do valor de um lance', async () => {
    const bid2 = await getBid(2);
    await prisma.bid.update({ where: { id: bid2.id }, data: { amountCents: 101000 } });

    const result = await audit();

    expect(result).toMatchObject({ intact: false, brokenAtSeq: 2, reason: 'HASH_MISMATCH' });
    expect(result.bids.map((b) => b.valid)).toEqual([true, false, false]);
  });

  test('alteração da data de um lance', async () => {
    const bid1 = await getBid(1);
    await prisma.bid.update({ where: { id: bid1.id }, data: { createdAt: new Date(bid1.createdAt.getTime() - 1) } });

    expect(await audit()).toMatchObject({ intact: false, brokenAtSeq: 1, reason: 'HASH_MISMATCH' });
  });

  test('troca do autor de um lance', async () => {
    const bid1 = await getBid(1);
    await prisma.bid.update({ where: { id: bid1.id }, data: { bidderId: bruno.id } });

    expect(await audit()).toMatchObject({ intact: false, brokenAtSeq: 1, reason: 'BIDDER_MISMATCH' });
  });

  test('remoção do último lance', async () => {
    const bid3 = await getBid(3);
    await prisma.bid.delete({ where: { id: bid3.id } });

    expect(await audit()).toMatchObject({ intact: false, brokenAtSeq: 3, reason: 'CHAIN_TAIL_MISMATCH' });
  });

  test('remoção do último lance "consertando" o lote (o selo denuncia)', async () => {
    const bid2 = await getBid(2);
    const bid3 = await getBid(3);
    await prisma.bid.delete({ where: { id: bid3.id } });
    // O atacante ajusta o lote para parecer que o lance #2 era o último...
    await prisma.lot.update({
      where: { id: lot.id },
      data: { bidCount: 2, lastHash: bid2.hash, currentBidCents: 105000, leaderId: bruno.id },
    });
    // ...mas não consegue recalcular o selo sem o AUDIT_SECRET.

    expect(await audit()).toMatchObject({ intact: false, brokenAtSeq: 3, reason: 'SEAL_MISMATCH' });
  });

  test('remoção de um lance do meio', async () => {
    const bid2 = await getBid(2);
    await prisma.bid.delete({ where: { id: bid2.id } });

    expect(await audit()).toMatchObject({ intact: false, brokenAtSeq: 2, reason: 'SEQ_GAP' });
  });

  test('remoção de TODOS os lances, zerando o lote', async () => {
    await prisma.bid.deleteMany({ where: { lotId: lot.id } });
    await prisma.lot.update({
      where: { id: lot.id },
      data: { bidCount: 0, lastHash: null, currentBidCents: null, leaderId: null },
    });

    expect(await audit()).toMatchObject({ intact: false, reason: 'SEAL_MISMATCH' });
  });

  test('inserção de lance falso no fim (hash calculado sem o segredo verdadeiro)', async () => {
    const bid2 = await getBid(2);
    const bid3 = await getBid(3);
    const createdAt = new Date();
    // O atacante conhece o algoritmo, mas não o AUDIT_SECRET: só pode chutar um segredo.
    const fakeHash = crypto
      .createHmac('sha256', 'segredo-chutado')
      .update([bid3.hash, lot.id, 4, bid2.bidderAlias, 120000, createdAt.toISOString()].join('|'))
      .digest('hex');

    await prisma.bid.create({
      data: {
        lotId: lot.id,
        bidderId: bruno.id,
        amountCents: 120000,
        seq: 4,
        bidderAlias: bid2.bidderAlias, // copia o apelido do Bruno de um lance real
        createdAt,
        prevHash: bid3.hash,
        hash: fakeHash,
      },
    });
    await prisma.lot.update({
      where: { id: lot.id },
      data: { bidCount: 4, lastHash: fakeHash, currentBidCents: 120000, leaderId: bruno.id },
    });

    const result = await audit();
    expect(result).toMatchObject({ intact: false, brokenAtSeq: 4, reason: 'HASH_MISMATCH' });
    expect(result.bids.map((b) => b.valid)).toEqual([true, true, true, false]);
  });

  test('alteração do lance atual do lote sem mexer nos lances', async () => {
    await prisma.lot.update({ where: { id: lot.id }, data: { currentBidCents: 50000 } });
    expect(await audit()).toMatchObject({ intact: false, reason: 'LOT_STATE_MISMATCH' });
  });

  test('troca do vencedor de um lote liquidado', async () => {
    await prisma.lot.update({ where: { id: lot.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    await settlementService.settleLot(lot.id);
    await prisma.lot.update({ where: { id: lot.id }, data: { winnerId: bruno.id } });

    expect(await audit()).toMatchObject({ intact: false, reason: 'LOT_STATE_MISMATCH' });
  });
});

test('lote inexistente → 404', async () => {
  expect((await request(app).get('/audit/999999')).status).toBe(404);
});
