// Lote de demonstração (DEMO_KEEP_LIVE): o portfólio publicado sempre tem um lote ao vivo.
const { prisma, resetDb, createLot, HOUR } = require('./helpers');
const { ensureLiveDemoLot, DEMO_AUCTIONEER_EMAIL } = require('../src/services/demoLot.service');
const { verifyChain } = require('../src/services/hashChain.service');

let auctioneer;

beforeEach(async () => {
  await resetDb();
  auctioneer = await prisma.user.create({
    data: { name: 'Leiloeiro Demo', email: DEMO_AUCTIONEER_EMAIL, passwordHash: 'x', role: 'AUCTIONEER' },
  });
});

afterAll(() => prisma.$disconnect());

describe('ensureLiveDemoLot', () => {
  it('com a variável desligada (padrão), não cria nada', async () => {
    const result = await ensureLiveDemoLot();

    expect(result).toEqual({ created: false, reason: 'DISABLED' });
    expect(await prisma.lot.count()).toBe(0);
  });

  it('se já existe um lote ao vivo, não cria nada', async () => {
    await createLot(auctioneer);

    const result = await ensureLiveDemoLot({ enabled: true });

    expect(result).toEqual({ created: false, reason: 'HAS_LIVE' });
    expect(await prisma.lot.count()).toBe(1);
  });

  it('sem lote ao vivo, cria exatamente um: sem lances, ao vivo por 30 dias e auditável', async () => {
    // Agendado e encerrado não contam como "ao vivo".
    await createLot(auctioneer, { startsAt: new Date(Date.now() + HOUR), endsAt: new Date(Date.now() + 2 * HOUR) });
    await createLot(auctioneer, { startsAt: new Date(Date.now() - 2 * HOUR), endsAt: new Date(Date.now() - HOUR) });
    const now = new Date();

    const result = await ensureLiveDemoLot({ enabled: true, now });

    expect(result.created).toBe(true);
    const live = await prisma.lot.findMany({ where: { startsAt: { lte: now }, endsAt: { gt: now } } });
    expect(live).toHaveLength(1);
    const lot = live[0];
    expect(lot.id).toBe(result.lotId);
    expect(lot.auctioneerId).toBe(auctioneer.id);
    expect(lot.bidCount).toBe(0);
    expect(lot.currentBidCents).toBeNull();
    expect(lot.endsAt.getTime() - lot.startsAt.getTime()).toBe(30 * 24 * HOUR);
    expect(verifyChain(lot, [])).toEqual({ intact: true });
  });

  it('duas rodadas ao mesmo tempo criam um lote só (trava)', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => ensureLiveDemoLot({ enabled: true }))
    );

    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(results.filter((r) => r.reason === 'HAS_LIVE')).toHaveLength(4);
    expect(await prisma.lot.count()).toBe(1);
  });

  it('sem o leiloeiro demo, não cria nada', async () => {
    await prisma.user.delete({ where: { id: auctioneer.id } });

    const result = await ensureLiveDemoLot({ enabled: true });

    expect(result).toEqual({ created: false, reason: 'NO_AUCTIONEER' });
    expect(await prisma.lot.count()).toBe(0);
  });
});
