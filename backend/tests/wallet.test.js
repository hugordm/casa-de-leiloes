const { prisma, request, app, resetDb, createUser, createLot, bid, getWallet } = require('./helpers');

let auctioneer;
let ana;
let bruno;

beforeEach(async () => {
  await resetDb();
  auctioneer = await createUser({ role: 'AUCTIONEER' });
  ana = await createUser({ balanceCents: 500000 });
  bruno = await createUser({ balanceCents: 500000 });
});

afterAll(() => prisma.$disconnect());

function deposit(user, amountCents) {
  return request(app)
    .post('/wallet/deposit')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ amountCents });
}

test('carteira nova: tudo disponível, nada comprometido', async () => {
  const res = await getWallet(ana);
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ balanceCents: 500000, committedCents: 0, availableCents: 500000 });
});

test('liberação do comprometido ao ser superado', async () => {
  const lot = await createLot(auctioneer);

  // Ana lidera: R$ 1.000 comprometidos
  await bid(lot.id, ana, 100000);
  expect((await getWallet(ana)).body).toMatchObject({
    balanceCents: 500000,
    committedCents: 100000,
    availableCents: 400000,
  });

  // Bruno supera: o valor da Ana volta ao disponível automaticamente
  await bid(lot.id, bruno, 105000);
  expect((await getWallet(ana)).body).toMatchObject({
    balanceCents: 500000,
    committedCents: 0,
    availableCents: 500000,
  });
  expect((await getWallet(bruno)).body).toMatchObject({ committedCents: 105000, availableCents: 395000 });
});

test('lote cancelado deixa de comprometer o saldo do líder', async () => {
  const lot = await createLot(auctioneer);
  await bid(lot.id, ana, 100000);

  await prisma.lot.update({ where: { id: lot.id }, data: { status: 'CANCELLED' } });

  expect((await getWallet(ana)).body.committedCents).toBe(0);
});

test('depósito soma ao saldo e gera transação DEPOSIT', async () => {
  const res = await deposit(ana, 25050);

  expect(res.status).toBe(201);
  expect(res.body.balanceCents).toBe(525050);
  expect(res.body.transactions[0]).toMatchObject({ type: 'DEPOSIT', amountCents: 25050 });
});

test('depósito inválido é recusado', async () => {
  for (const amount of [0, -100, 10.5, '1000', null, 10_000_001]) {
    const res = await deposit(ana, amount);
    expect(res.status).toBe(400);
  }
  expect((await getWallet(ana)).body.balanceCents).toBe(500000);
});

test('leiloeiro não acessa a carteira de licitante', async () => {
  expect((await getWallet(auctioneer)).status).toBe(403);
});
