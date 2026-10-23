const {
  prisma,
  resetDb,
  createUser,
  createLot,
  bid,
  MINUTE,
  HOUR,
} = require('./helpers');
const bidService = require('../src/services/bid.service');
const hashChain = require('../src/services/hashChain.service');

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

describe('lance aceito', () => {
  test('primeiro lance igual ao inicial é aceito e inicia a corrente de hashes', async () => {
    const lot = await createLot(auctioneer);

    const res = await bid(lot.id, ana, 100000);

    expect(res.status).toBe(201);
    expect(res.body.bid).toMatchObject({ seq: 1, amountCents: 100000 });
    expect(res.body.bid.bidderAlias).toMatch(/^Licitante #[0-9A-F]{6}$/);
    expect(res.body.lot).toMatchObject({ currentBidCents: 100000, bidCount: 1, minNextBidCents: 105000 });

    const saved = await prisma.bid.findFirst({ where: { lotId: lot.id } });
    const updatedLot = await prisma.lot.findUnique({ where: { id: lot.id } });
    expect(saved.prevHash).toBe(`GENESIS:${lot.id}`);
    expect(saved.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(updatedLot.leaderId).toBe(ana.id);
    expect(updatedLot.lastHash).toBe(saved.hash);
    expect(updatedLot.seal).toBe(
      hashChain.computeSeal({ lotId: lot.id, bidCount: 1, lastHash: saved.hash })
    );
  });

  test('segundo lance encadeia no hash do primeiro', async () => {
    const lot = await createLot(auctioneer);
    await bid(lot.id, ana, 100000);
    await bid(lot.id, bruno, 105000);

    const [first, second] = await prisma.bid.findMany({ where: { lotId: lot.id }, orderBy: { seq: 'asc' } });
    expect(second.seq).toBe(2);
    expect(second.prevHash).toBe(first.hash);
  });

  test('mesmo licitante tem o mesmo apelido no lote e apelidos diferentes entre lotes', async () => {
    const lot1 = await createLot(auctioneer);
    const lot2 = await createLot(auctioneer);
    await bid(lot1.id, ana, 100000);
    await bid(lot1.id, bruno, 105000);
    await bid(lot1.id, ana, 110000);
    await bid(lot2.id, ana, 100000);

    const anaBids = await prisma.bid.findMany({ where: { bidderId: ana.id }, orderBy: { id: 'asc' } });
    expect(anaBids[0].bidderAlias).toBe(anaBids[1].bidderAlias); // mesmo lote
    expect(anaBids[2].bidderAlias).not.toBe(anaBids[0].bidderAlias); // outro lote
  });
});

describe('regras de recusa', () => {
  test('lance abaixo do mínimo sem lances (mínimo = lance inicial)', async () => {
    const lot = await createLot(auctioneer);
    const res = await bid(lot.id, ana, 99999);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Lance abaixo do mínimo (mínimo: R$ 1.000,00)');
  });

  test('lance abaixo do mínimo com lances (mínimo = atual + incremento)', async () => {
    const lot = await createLot(auctioneer);
    await bid(lot.id, ana, 100000);

    const low = await bid(lot.id, bruno, 104999);
    expect(low.status).toBe(400);
    expect(low.body.error.message).toBe('Lance abaixo do mínimo (mínimo: R$ 1.050,00)');

    const ok = await bid(lot.id, bruno, 105000);
    expect(ok.status).toBe(201);
  });

  test('saldo insuficiente', async () => {
    const pobre = await createUser({ balanceCents: 50000 }); // R$ 500
    const lot = await createLot(auctioneer, { startingBidCents: 1000 });

    const res = await bid(lot.id, pobre, 60000);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Saldo insuficiente');
  });

  test('saldo comprometido em outro lote não pode ser usado de novo', async () => {
    const carla = await createUser({ balanceCents: 150000 }); // R$ 1.500
    const lot1 = await createLot(auctioneer);
    const lot2 = await createLot(auctioneer);

    expect((await bid(lot1.id, carla, 100000)).status).toBe(201); // compromete R$ 1.000
    const res = await bid(lot2.id, carla, 100000); // só tem R$ 500 disponíveis
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Saldo insuficiente');
  });

  test('líder não pode cobrir o próprio lance', async () => {
    const lot = await createLot(auctioneer);
    await bid(lot.id, ana, 100000);

    const res = await bid(lot.id, ana, 200000);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Você já está ganhando');
  });

  test('lote ainda não iniciado', async () => {
    const lot = await createLot(auctioneer, {
      startsAt: new Date(Date.now() + HOUR),
      endsAt: new Date(Date.now() + 2 * HOUR),
    });
    const res = await bid(lot.id, ana, 100000);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Lote ainda não iniciado');
  });

  test('lote encerrado', async () => {
    const lot = await createLot(auctioneer, {
      startsAt: new Date(Date.now() - 2 * HOUR),
      endsAt: new Date(Date.now() - MINUTE),
    });
    const res = await bid(lot.id, ana, 100000);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Lote encerrado');
  });

  test('lote cancelado ou inexistente → "Lote não encontrado"', async () => {
    const lot = await createLot(auctioneer, { status: 'CANCELLED' });

    const cancelled = await bid(lot.id, ana, 100000);
    expect(cancelled.status).toBe(404);
    expect(cancelled.body.error.message).toBe('Lote não encontrado');

    const missing = await bid(999999, ana, 100000);
    expect(missing.status).toBe(404);
  });

  test('leiloeiro não pode dar lance (barrado na rota e no service)', async () => {
    const lot = await createLot(auctioneer);

    // Pela API: o middleware requireRole('BIDDER') barra antes de chegar ao service
    const res = await bid(lot.id, auctioneer, 100000);
    expect(res.status).toBe(403);

    // Direto no service: a regra 4 também barra (defesa em profundidade)
    await expect(bidService.placeBid(lot.id, auctioneer.id, 100000)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Leiloeiros não podem dar lances',
    });
  });

  test('sem login → 401; valor inválido → 400', async () => {
    const lot = await createLot(auctioneer);
    const { request, app } = require('./helpers');

    const anon = await request(app).post(`/lots/${lot.id}/bids`).send({ amountCents: 100000 });
    expect(anon.status).toBe(401);

    for (const amount of [100000.5, '100000', -1, null]) {
      const res = await bid(lot.id, ana, amount);
      expect(res.status).toBe(400);
    }
  });
});

describe('anti-sniping', () => {
  test('lance nos últimos 2 minutos estende o fim em +2 min', async () => {
    const endsAt = new Date(Date.now() + MINUTE); // falta 1 min
    const lot = await createLot(auctioneer, { endsAt });

    const res = await bid(lot.id, ana, 100000);

    expect(res.body.extended).toBe(true);
    const updated = await prisma.lot.findUnique({ where: { id: lot.id } });
    expect(updated.endsAt.getTime()).toBe(endsAt.getTime() + 2 * MINUTE);
  });

  test('lance com mais de 2 minutos restantes não altera o fim', async () => {
    const endsAt = new Date(Date.now() + 10 * MINUTE);
    const lot = await createLot(auctioneer, { endsAt });

    const res = await bid(lot.id, ana, 100000);

    expect(res.body.extended).toBe(false);
    const updated = await prisma.lot.findUnique({ where: { id: lot.id } });
    expect(updated.endsAt.getTime()).toBe(endsAt.getTime());
  });
});

describe('concorrência (SELECT ... FOR UPDATE)', () => {
  test('dois lances simultâneos de mesmo valor no mesmo lote: só um é aceito', async () => {
    const lot = await createLot(auctioneer);

    const results = await Promise.all([bid(lot.id, ana, 100000), bid(lot.id, bruno, 100000)]);
    const statuses = results.map((r) => r.status).sort();

    expect(statuses).toEqual([201, 400]); // o segundo vira "abaixo do mínimo"
    const updated = await prisma.lot.findUnique({ where: { id: lot.id } });
    expect(updated.bidCount).toBe(1);
  });

  test('mesmo licitante em dois lotes ao mesmo tempo não gasta o saldo duas vezes', async () => {
    const carla = await createUser({ balanceCents: 100000 }); // saldo para UM lance
    const lot1 = await createLot(auctioneer);
    const lot2 = await createLot(auctioneer);

    const results = await Promise.all([bid(lot1.id, carla, 100000), bid(lot2.id, carla, 100000)]);
    const statuses = results.map((r) => r.status).sort();

    expect(statuses).toEqual([201, 400]);
    expect(results.find((r) => r.status === 400).body.error.message).toBe('Saldo insuficiente');
  });
});
