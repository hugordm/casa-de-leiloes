// Sala do lote (GET /lots/:id) e "meus lances" (GET /me/bids).
const { prisma, request, app, resetDb, createUser, createLot, bid } = require('./helpers');

let auctioneer;
let ana;
let bruno;
let lot;

beforeEach(async () => {
  await resetDb();
  auctioneer = await createUser({ role: 'AUCTIONEER' });
  ana = await createUser({ balanceCents: 500000 });
  bruno = await createUser({ balanceCents: 500000 });
  lot = await createLot(auctioneer);
  await bid(lot.id, ana, 100000);
  await bid(lot.id, bruno, 105000);
});

afterAll(() => prisma.$disconnect());

function getLot(user) {
  const req = request(app).get(`/lots/${lot.id}`);
  return user ? req.set('Authorization', `Bearer ${user.token}`) : req;
}

test('visitante vê lances só com apelido, sem bloco "me"', async () => {
  const res = await getLot();

  expect(res.status).toBe(200);
  expect(res.body.lot.me).toBeUndefined();
  expect(res.body.lot.recentBids).toHaveLength(2);
  expect(res.body.lot.recentBids[0]).toEqual({
    seq: 2,
    bidderAlias: expect.stringMatching(/^Licitante #/),
    amountCents: 105000,
    createdAt: expect.any(String),
  });
  // Nada que identifique o licitante
  const body = JSON.stringify(res.body);
  expect(body).not.toContain(ana.email);
  expect(body).not.toContain(ana.name);
  expect(res.body.lot.leaderId).toBeUndefined();
});

test('licitante logado vê se está ganhando ou foi superado, e sua posição', async () => {
  const brunoView = (await getLot(bruno)).body.lot.me;
  expect(brunoView).toEqual({ status: 'leading', myBestBidCents: 105000, position: 1, totalBidders: 2 });

  const anaView = (await getLot(ana)).body.lot.me;
  expect(anaView).toEqual({ status: 'outbid', myBestBidCents: 100000, position: 2, totalBidders: 2 });
});

test('token inválido na sala é tratado como visitante (não bloqueia)', async () => {
  const res = await request(app).get(`/lots/${lot.id}`).set('Authorization', 'Bearer token-ruim');
  expect(res.status).toBe(200);
  expect(res.body.lot.me).toBeUndefined();
});

test('GET /me/bids lista os lotes em que dei lance', async () => {
  const res = await request(app).get('/me/bids').set('Authorization', `Bearer ${ana.token}`);

  expect(res.status).toBe(200);
  expect(res.body.items).toHaveLength(1);
  expect(res.body.items[0]).toMatchObject({ myBestBidCents: 100000, isLeader: false, won: false });
  expect(res.body.items[0].lot.id).toBe(lot.id);
});
