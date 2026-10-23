// Cancelamento de lote pelo leiloeiro dono, inclusive com lances (estorno automático).
// O Resend é SIMULADO (nenhum e-mail real).
const mockSend = jest.fn();
jest.mock('../src/lib/resendClient', () => ({
  getResendClient: () => ({ emails: { send: mockSend } }),
}));

const { prisma, request, app, resetDb, createUser, createLot, bid, getWallet, MINUTE, HOUR } = require('./helpers');
const env = require('../src/config/env');
const { waitForPendingEmails } = require('../src/services/email/notification.service');

let auctioneer;
let ana;
let bruno;

const cancel = (lotId, user = auctioneer) =>
  request(app).post(`/lots/${lotId}/cancel`).set('Authorization', `Bearer ${user.token}`);
const sentTo = (email) => mockSend.mock.calls.map(([msg]) => msg).filter((msg) => msg.to === email);

beforeEach(async () => {
  await resetDb();
  mockSend.mockReset();
  mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });
  Object.assign(env, { EMAIL_ENABLED: true, RESEND_API_KEY: 're_teste', APP_URL: 'https://leiloes.exemplo.com' });

  auctioneer = await createUser({ role: 'AUCTIONEER', name: 'Leiloeira Lia' });
  ana = await createUser({ balanceCents: 500000, name: 'Ana Souza' });
  bruno = await createUser({ balanceCents: 500000, name: 'Bruno Lima' });
});

afterEach(() => waitForPendingEmails());

afterAll(async () => {
  Object.assign(env, { EMAIL_ENABLED: false, RESEND_API_KEY: '' });
  await prisma.$disconnect();
});

describe('cancelar lote COM lances (estorno)', () => {
  test('libera o comprometido do líder, sem mexer no saldo total, e registra REFUND informativo', async () => {
    const lot = await createLot(auctioneer);
    await bid(lot.id, ana, 100000);
    await bid(lot.id, bruno, 120000); // Bruno lidera com R$ 1.200,00 comprometidos

    const before = (await getWallet(bruno)).body;
    expect(before.committedCents).toBe(120000);
    expect(before.availableCents).toBe(380000);

    const res = await cancel(lot.id);
    expect(res.status).toBe(200);
    expect(res.body.lot.status).toBe('CANCELLED');

    const after = (await getWallet(bruno)).body;
    expect(after.balanceCents).toBe(500000); // nada foi debitado, nada é "devolvido" ao total
    expect(after.committedCents).toBe(0);
    expect(after.availableCents).toBe(500000);
    expect(after.transactions[0]).toMatchObject({ type: 'REFUND', amountCents: 120000, lot: { id: lot.id } });

    // Só o líder tinha valor comprometido: só ele recebe REFUND.
    const refunds = await prisma.walletTransaction.findMany({ where: { type: 'REFUND' } });
    expect(refunds).toHaveLength(1);
    expect(refunds[0].userId).toBe(bruno.id);
    expect((await getWallet(ana)).body.balanceCents).toBe(500000);
  });

  test('depois de cancelado, o lote some da vitrine, não aceita lance e não é liquidado', async () => {
    const lot = await createLot(auctioneer);
    await bid(lot.id, ana, 100000);
    await cancel(lot.id);

    const showcase = await request(app).get('/lots');
    expect(showcase.body.lots.map((l) => l.id)).not.toContain(lot.id);

    const late = await bid(lot.id, bruno, 200000);
    expect(late.status).toBe(404);
    expect(late.body.error.message).toBe('Lote não encontrado');

    const { settleDueLots } = require('../src/services/settlement.service');
    await prisma.lot.update({ where: { id: lot.id }, data: { endsAt: new Date(Date.now() - MINUTE) } });
    await settleDueLots();
    const after = await prisma.lot.findUnique({ where: { id: lot.id }, include: { receipt: true } });
    expect(after.status).toBe('CANCELLED');
    expect(after.receipt).toBeNull();
  });

  test('a auditoria do lote cancelado continua íntegra', async () => {
    const lot = await createLot(auctioneer);
    await bid(lot.id, ana, 100000);
    await bid(lot.id, bruno, 105000);
    await cancel(lot.id);

    const audit = await request(app).get(`/audit/${lot.id}`);
    expect(audit.body.intact).toBe(true);
  });

  test('e-mail "Lote cancelado" para cada licitante (líder com o valor liberado), após o commit', async () => {
    const lot = await createLot(auctioneer, { title: 'Nighthawks' });
    await bid(lot.id, ana, 100000);
    await bid(lot.id, bruno, 120000);
    await bid(lot.id, ana, 130000); // Ana lidera; ela deu 2 lances mas recebe 1 e-mail
    await waitForPendingEmails();
    mockSend.mockClear();
    let statusSeen;
    mockSend.mockImplementation(async () => {
      statusSeen = (await prisma.lot.findUnique({ where: { id: lot.id } })).status;
      return { data: { id: 'x' }, error: null };
    });

    await cancel(lot.id);
    await waitForPendingEmails();

    expect(statusSeen).toBe('CANCELLED');
    const [toAna] = sentTo(ana.email);
    const [toBruno] = sentTo(bruno.email);
    expect(sentTo(ana.email)).toHaveLength(1);
    expect(toAna.subject).toBe('Lote cancelado: "Nighthawks"');
    expect(toAna.text).toContain('O valor de R$ 1.300,00');
    expect(toAna.text).toContain('voltou para o seu saldo disponível');
    expect(toBruno.text).toContain('Nada foi debitado do seu saldo.');
    expect(toBruno.text).not.toContain('R$');
    expect(sentTo(auctioneer.email)).toHaveLength(0);
  });

  test('falha no e-mail não desfaz o cancelamento; @demo.com não recebe', async () => {
    const lot = await createLot(auctioneer);
    await prisma.user.update({ where: { id: ana.id }, data: { email: 'ana@demo.com' } });
    await bid(lot.id, ana, 100000);
    await bid(lot.id, bruno, 105000);
    await waitForPendingEmails();
    mockSend.mockReset();
    mockSend.mockRejectedValue(new Error('rede caiu'));
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await cancel(lot.id);
    await waitForPendingEmails();

    expect(res.status).toBe(200);
    expect((await prisma.lot.findUnique({ where: { id: lot.id } })).status).toBe('CANCELLED');
    expect(mockSend.mock.calls.map(([m]) => m.to)).toEqual([bruno.email]); // a Ana (@demo.com) é pulada
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });
});

describe('lance x cancelamento simultâneos', () => {
  test('com a mesma trava, o estado final é sempre consistente (nas duas ordens)', async () => {
    const outcomes = new Set();
    for (let round = 0; round < 10; round += 1) {
      const lot = await createLot(auctioneer);
      await bid(lot.id, ana, 100000);

      // Alterna quem é disparado primeiro, para exercitar as duas ordens possíveis.
      const bidFirst = round % 2 === 0;
      const [bidRes, cancelRes] = bidFirst
        ? await Promise.all([bid(lot.id, bruno, 150000), cancel(lot.id)])
        : await Promise.all([cancel(lot.id), bid(lot.id, bruno, 150000)]).then(([c, b]) => [b, c]);
      outcomes.add(bidRes.status);
      expect(cancelRes.status).toBe(200);
      expect([201, 404]).toContain(bidRes.status);

      const final = await prisma.lot.findUnique({ where: { id: lot.id } });
      const refunds = await prisma.walletTransaction.findMany({ where: { lotId: lot.id, type: 'REFUND' } });
      expect(final.status).toBe('CANCELLED');
      // O estorno vai exatamente para quem liderava no momento do cancelamento, com o valor dele.
      expect(refunds).toHaveLength(1);
      expect(refunds[0].userId).toBe(final.leaderId);
      expect(refunds[0].amountCents).toBe(final.currentBidCents);
      // Se o lance do Bruno foi aceito, ele veio antes do cancelamento e o estorno é dele.
      if (bidRes.status === 201) expect(final.leaderId).toBe(bruno.id);
      else expect(final.leaderId).toBe(ana.id);
      // Ninguém fica com valor preso.
      expect((await getWallet(bruno)).body.committedCents).toBe(0);
      expect((await getWallet(ana)).body.committedCents).toBe(0);
    }
    // As duas ordens aconteceram: lance antes (201, estorno para o Bruno) e cancelamento antes (404).
    expect([...outcomes].sort()).toEqual([201, 404]);
  });
});

describe('recusas', () => {
  test('lote encerrado (mesmo ainda não liquidado) → 409', async () => {
    const lot = await createLot(auctioneer, { startsAt: new Date(Date.now() - 2 * HOUR), endsAt: new Date(Date.now() - MINUTE) });
    const res = await cancel(lot.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: 'LOT_ENDED', message: 'Lote encerrado não pode ser cancelado' });
  });

  test('lote liquidado → 409', async () => {
    const lot = await createLot(auctioneer, { status: 'SETTLED', endsAt: new Date(Date.now() - MINUTE) });
    expect((await cancel(lot.id)).body.error.code).toBe('LOT_ENDED');
  });

  test('lote já cancelado → 409', async () => {
    const lot = await createLot(auctioneer);
    await cancel(lot.id);
    const res = await cancel(lot.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LOT_ALREADY_CANCELLED');
  });

  test('outro leiloeiro → 403, e nada muda', async () => {
    const other = await createUser({ role: 'AUCTIONEER' });
    const lot = await createLot(auctioneer);
    await bid(lot.id, ana, 100000);

    const res = await cancel(lot.id, other);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_LOT_OWNER');
    expect((await prisma.lot.findUnique({ where: { id: lot.id } })).status).toBe('ACTIVE');
    expect((await getWallet(ana)).body.committedCents).toBe(100000);
  });

  test('licitante não pode cancelar → 403', async () => {
    const lot = await createLot(auctioneer);
    expect((await cancel(lot.id, ana)).status).toBe(403);
  });

  test('lote agendado sem lances pode ser cancelado, sem REFUND nem e-mail', async () => {
    const lot = await createLot(auctioneer, { startsAt: new Date(Date.now() + HOUR), endsAt: new Date(Date.now() + 2 * HOUR) });
    const res = await cancel(lot.id);
    await waitForPendingEmails();

    expect(res.status).toBe(200);
    expect(await prisma.walletTransaction.count({ where: { type: 'REFUND' } })).toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
