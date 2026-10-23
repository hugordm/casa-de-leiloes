const { prisma, request, app, resetDb, createUser, createLot, bid, getWallet, MINUTE } = require('./helpers');
const settlementService = require('../src/services/settlement.service');

let auctioneer;
let ana;
let bruno;

beforeEach(async () => {
  await resetDb();
  auctioneer = await createUser({ role: 'AUCTIONEER' });
  ana = await createUser({ balanceCents: 500000 }); // R$ 5.000
  bruno = await createUser({ balanceCents: 500000 });
});

afterAll(() => prisma.$disconnect());

// "Encerra" o lote movendo o fim para o passado (lances já dados continuam válidos).
function endLot(lotId) {
  return prisma.lot.update({ where: { id: lotId }, data: { endsAt: new Date(Date.now() - 1000) } });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Lote ao vivo com Ana superada por Bruno (R$ 1.050), já encerrado.
async function endedLotWonByBruno() {
  const lot = await createLot(auctioneer);
  await bid(lot.id, ana, 100000);
  await bid(lot.id, bruno, 105000);
  await endLot(lot.id);
  return lot;
}

describe('liquidação', () => {
  test('com lances: debita o vencedor, credita o leiloeiro e emite comprovante', async () => {
    const lot = await endedLotWonByBruno();

    const result = await settlementService.settleLot(lot.id);

    expect(result).toMatchObject({ settled: true, outcome: 'SOLD' });
    expect(result.receiptCode).toMatch(/^[A-Za-z0-9_-]{16}$/);

    const settled = await prisma.lot.findUnique({ where: { id: lot.id } });
    expect(settled).toMatchObject({ status: 'SETTLED', winnerId: bruno.id, finalPriceCents: 105000 });

    // Saldos: Bruno 5.000 - 1.050 | leiloeiro 0 + 1.050 | Ana intacta
    const users = await prisma.user.findMany({ orderBy: { id: 'asc' } });
    expect(users.map((u) => u.balanceCents)).toEqual([105000, 500000, 395000]);

    const txs = await prisma.walletTransaction.findMany({ where: { lotId: lot.id }, orderBy: { id: 'asc' } });
    expect(txs.map((t) => [t.userId, t.type, t.amountCents])).toEqual([
      [bruno.id, 'DEBIT', 105000],
      [auctioneer.id, 'CREDIT', 105000],
    ]);

    const receipt = await prisma.receipt.findUnique({ where: { lotId: lot.id } });
    expect(receipt).toMatchObject({ code: result.receiptCode, winnerId: bruno.id, amountCents: 105000 });
  });

  test('depois de liquidar, o valor deixa de estar comprometido (total cai, disponível não muda)', async () => {
    const lot = await endedLotWonByBruno();
    expect((await getWallet(bruno)).body).toMatchObject({ balanceCents: 500000, committedCents: 105000, availableCents: 395000 });

    await settlementService.settleLot(lot.id);

    expect((await getWallet(bruno)).body).toMatchObject({ balanceCents: 395000, committedCents: 0, availableCents: 395000 });
  });

  test('sem lances: encerra sem vencedor e nenhum dinheiro se move', async () => {
    const lot = await createLot(auctioneer);
    await endLot(lot.id);

    const result = await settlementService.settleLot(lot.id);

    expect(result).toEqual({ settled: true, outcome: 'UNSOLD' });
    const settled = await prisma.lot.findUnique({ where: { id: lot.id } });
    expect(settled).toMatchObject({ status: 'SETTLED', winnerId: null, finalPriceCents: null });
    expect(await prisma.walletTransaction.count()).toBe(0);
    expect(await prisma.receipt.count()).toBe(0);
  });

  test('lote que ainda não venceu não é liquidado', async () => {
    const lot = await createLot(auctioneer);
    await bid(lot.id, ana, 100000);

    expect(await settlementService.settleLot(lot.id)).toEqual({ settled: false, outcome: 'NOT_DUE' });
    expect((await prisma.lot.findUnique({ where: { id: lot.id } })).status).toBe('ACTIVE');
  });

  test('idempotente: rodar de novo não liquida duas vezes', async () => {
    const lot = await endedLotWonByBruno();

    await settlementService.settleLot(lot.id);
    const second = await settlementService.settleLot(lot.id);
    const sweep = await settlementService.settleDueLots();

    expect(second).toEqual({ settled: false, outcome: 'ALREADY_SETTLED' });
    expect(sweep).toEqual([]); // nada mais vencido para liquidar
    expect(await prisma.receipt.count()).toBe(1);
    expect(await prisma.walletTransaction.count({ where: { lotId: lot.id } })).toBe(2);
    expect((await prisma.user.findUnique({ where: { id: bruno.id } })).balanceCents).toBe(395000);
  });

  test('idempotente sob concorrência: várias liquidações simultâneas → uma só', async () => {
    const lot = await endedLotWonByBruno();

    const results = await Promise.all([
      settlementService.settleLot(lot.id),
      settlementService.settleLot(lot.id),
      settlementService.settleLot(lot.id),
    ]);

    expect(results.filter((r) => r.settled)).toHaveLength(1);
    expect(await prisma.receipt.count()).toBe(1);
    expect((await prisma.user.findUnique({ where: { id: bruno.id } })).balanceCents).toBe(395000);
  });

  test('lote cancelado não é liquidado', async () => {
    const lot = await createLot(auctioneer, { status: 'CANCELLED' });
    await endLot(lot.id);
    expect(await settlementService.settleLot(lot.id)).toEqual({ settled: false, outcome: 'CANCELLED' });
  });
});

describe('lance x liquidação simultâneos', () => {
  test('liquidação espera o lance em andamento e reconfere o endsAt estendido pelo anti-sniping', async () => {
    const lot = await createLot(auctioneer);
    await bid(lot.id, ana, 100000);
    await endLot(lot.id); // para o job, este lote está vencido

    // Simula um lance em andamento: trava a linha do lote e, como faria o anti-sniping,
    // estende o fim antes de liberar a trava.
    let releaseLock;
    const gate = new Promise((resolve) => (releaseLock = resolve));
    let signalLocked;
    const locked = new Promise((resolve) => (signalLocked = resolve));
    const bidInProgress = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Lot" WHERE id = ${lot.id} FOR UPDATE`;
      signalLocked();
      await gate;
      await tx.lot.update({ where: { id: lot.id }, data: { endsAt: new Date(Date.now() + 2 * MINUTE) } });
    });
    await locked;

    // O job lê o lote como vencido (leitura sem trava) e fica esperando a trava do lote.
    const sweep = settlementService.settleDueLots();
    await sleep(300);
    releaseLock();
    await bidInProgress;

    // Ao conseguir a trava, a liquidação relê o lote, vê o novo endsAt e NÃO liquida.
    expect(await sweep).toEqual([{ lotId: lot.id, settled: false, outcome: 'NOT_DUE' }]);
    expect((await prisma.lot.findUnique({ where: { id: lot.id } })).status).toBe('ACTIVE');
    expect(await prisma.receipt.count()).toBe(0);
  });

  test('lance disparado junto com a liquidação de um lote vencido é recusado', async () => {
    const lot = await endedLotWonByBruno();

    const [settle, lateBid] = await Promise.all([
      settlementService.settleLot(lot.id),
      bid(lot.id, ana, 200000),
    ]);

    expect(settle.outcome).toBe('SOLD');
    expect(lateBid.status).toBe(409);
    expect(lateBid.body.error.message).toBe('Lote encerrado');
    expect((await prisma.lot.findUnique({ where: { id: lot.id } })).finalPriceCents).toBe(105000);
  });
});

describe('liquidação sob demanda e telas de resultado', () => {
  test('GET /lots/:id liquida um lote vencido e mostra "won" + comprovante ao vencedor', async () => {
    const lot = await endedLotWonByBruno(); // job não roda nos testes: lote segue ACTIVE

    const res = await request(app).get(`/lots/${lot.id}`).set('Authorization', `Bearer ${bruno.token}`);

    expect(res.body.lot.status).toBe('SETTLED');
    expect(res.body.lot.me.status).toBe('won');
    expect(res.body.lot.me.receiptCode).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(res.body.lot.winnerAlias).toBe(res.body.lot.recentBids[0].bidderAlias);

    const anaView = await request(app).get(`/lots/${lot.id}`).set('Authorization', `Bearer ${ana.token}`);
    expect(anaView.body.lot.me.status).toBe('lost');
    expect(anaView.body.lot.me.receiptCode).toBeUndefined();
  });

  test('comprovante público: apelido, valor, data, obra e link da auditoria — sem nome/e-mail', async () => {
    const lot = await endedLotWonByBruno();
    const { receiptCode } = await settlementService.settleLot(lot.id);

    const res = await request(app).get(`/receipts/${receiptCode}`);

    expect(res.status).toBe(200);
    expect(res.body.receipt).toMatchObject({
      code: receiptCode,
      amountCents: 105000,
      settledAt: expect.any(String),
      winnerAlias: expect.stringMatching(/^Licitante #/),
      lot: { id: lot.id, title: 'Obra de teste' },
      auditUrl: `/auditoria/${lot.id}`,
    });
    const lastBid = await prisma.bid.findFirst({ where: { lotId: lot.id }, orderBy: { seq: 'desc' } });
    expect(res.body.receipt.winnerAlias).toBe(lastBid.bidderAlias);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain(bruno.email);
    expect(body).not.toContain(bruno.name);

    expect((await request(app).get('/receipts/codigo-inexistente')).status).toBe(404);
  });

  test('GET /me/bids traz o código do comprovante só nos lotes vencidos pelo usuário', async () => {
    const lot = await endedLotWonByBruno();

    const brunoItems = (await request(app).get('/me/bids').set('Authorization', `Bearer ${bruno.token}`)).body.items;
    const anaItems = (await request(app).get('/me/bids').set('Authorization', `Bearer ${ana.token}`)).body.items;

    const receipt = await prisma.receipt.findUnique({ where: { lotId: lot.id } });
    expect(brunoItems[0]).toMatchObject({ won: true, receiptCode: receipt.code, isLeader: false });
    expect(anaItems[0]).toMatchObject({ won: false, receiptCode: null });
  });

  test('GET /me/lots: resultado de cada lote e total recebido', async () => {
    const sold1 = await endedLotWonByBruno(); // vende por R$ 1.050
    const sold2 = await createLot(auctioneer);
    await bid(sold2.id, ana, 100000); // vende por R$ 1.000
    await endLot(sold2.id);
    const unsold = await createLot(auctioneer);
    await endLot(unsold.id);
    const live = await createLot(auctioneer);
    const cancelled = await createLot(auctioneer, { status: 'CANCELLED' });

    const res = await request(app).get('/me/lots').set('Authorization', `Bearer ${auctioneer.token}`);

    expect(res.status).toBe(200);
    expect(res.body.totalReceivedCents).toBe(205000);
    expect(res.body.soldCount).toBe(2);
    const resultById = Object.fromEntries(res.body.lots.map((i) => [i.lot.id, i.result]));
    expect(resultById).toEqual({
      [sold1.id]: 'sold',
      [sold2.id]: 'sold',
      [unsold.id]: 'unsold',
      [live.id]: 'live',
      [cancelled.id]: 'cancelled',
    });
    const sold1Item = res.body.lots.find((i) => i.lot.id === sold1.id);
    expect(sold1Item.winnerAlias).toMatch(/^Licitante #/);
    expect(sold1Item.receiptCode).toEqual(expect.any(String));

    // Licitante não acessa o painel do leiloeiro
    expect((await request(app).get('/me/lots').set('Authorization', `Bearer ${ana.token}`)).status).toBe(403);
  });
});
