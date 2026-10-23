// E-mails transacionais com o cliente do Resend SIMULADO (nenhum e-mail real é enviado).
const mockSend = jest.fn();
jest.mock('../src/lib/resendClient', () => ({
  getResendClient: () => ({ emails: { send: mockSend } }),
}));

const { prisma, resetDb, createUser, createLot, bid, MINUTE } = require('./helpers');
const env = require('../src/config/env');
const settlementService = require('../src/services/settlement.service');
const { waitForPendingEmails } = require('../src/services/email/notification.service');

let auctioneer;
let ana;
let bruno;

beforeEach(async () => {
  await resetDb();
  mockSend.mockReset();
  mockSend.mockResolvedValue({ data: { id: 'email-123' }, error: null });
  // Liga os e-mails só neste arquivo (o padrão nos testes é desligado).
  Object.assign(env, { EMAIL_ENABLED: true, RESEND_API_KEY: 're_teste', APP_URL: 'https://leiloes.exemplo.com' });

  auctioneer = await createUser({ role: 'AUCTIONEER', name: 'Leiloeira Lia' });
  ana = await createUser({ balanceCents: 500000, name: 'Ana Souza' });
  bruno = await createUser({ balanceCents: 500000, name: 'Bruno Lima' });
});

afterEach(async () => {
  await waitForPendingEmails();
});

afterAll(async () => {
  Object.assign(env, { EMAIL_ENABLED: false, RESEND_API_KEY: '' });
  await prisma.$disconnect();
});

const sentTo = (email) => mockSend.mock.calls.map(([msg]) => msg).filter((msg) => msg.to === email);

async function endedLotWonByBruno() {
  const lot = await createLot(auctioneer, { title: 'Nighthawks', artist: 'Edward Hopper' });
  await bid(lot.id, ana, 100000);
  await bid(lot.id, bruno, 105000);
  await prisma.lot.update({ where: { id: lot.id }, data: { endsAt: new Date(Date.now() - 1000) } });
  await waitForPendingEmails();
  mockSend.mockClear(); // descarta o "superado" da Ana; o foco aqui é a liquidação
  return lot;
}

describe('"Você foi superado"', () => {
  test('vai para o líder anterior, com o link da sala e sem revelar quem cobriu', async () => {
    const lot = await createLot(auctioneer, { title: 'Nighthawks' });
    await bid(lot.id, ana, 100000);
    await bid(lot.id, bruno, 105000);
    await waitForPendingEmails();

    expect(mockSend).toHaveBeenCalledTimes(1); // 1º lance não tinha líder anterior
    const [email] = sentTo(ana.email);
    expect(email.subject).toBe('Você foi superado em "Nighthawks"');
    expect(email.from).toBe(env.EMAIL_FROM);
    expect(email.html).toContain(`https://leiloes.exemplo.com/lotes/${lot.id}`);
    expect(email.text).toContain(`https://leiloes.exemplo.com/lotes/${lot.id}`);
    expect(email.text).toContain('R$ 1.050,00'); // lance atual
    expect(email.text).toContain('R$ 1.100,00'); // mínimo para cobrir

    // Nada que identifique quem deu o lance
    const brunoBid = await prisma.bid.findFirst({ where: { bidderId: bruno.id } });
    for (const content of [email.html, email.text, email.subject]) {
      expect(content).not.toContain('Bruno');
      expect(content).not.toContain(bruno.email);
      expect(content).not.toContain(brunoBid.bidderAlias);
    }
  });

  test('é enviado só depois do commit: o lance novo já está no banco', async () => {
    const lot = await createLot(auctioneer);
    await bid(lot.id, ana, 100000);
    let seenLeader;
    mockSend.mockImplementation(async () => {
      seenLeader = (await prisma.lot.findUnique({ where: { id: lot.id } })).leaderId;
      return { data: { id: 'x' }, error: null };
    });

    await bid(lot.id, bruno, 105000);
    await waitForPendingEmails();

    expect(seenLeader).toBe(bruno.id);
  });

  test('não bloqueia a resposta do lance (Resend lento)', async () => {
    const lot = await createLot(auctioneer);
    await bid(lot.id, ana, 100000);
    mockSend.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ data: {}, error: null }), 1500)));

    const started = Date.now();
    const res = await bid(lot.id, bruno, 105000);

    expect(res.status).toBe(201);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  test('falha do Resend não afeta o lance (só log)', async () => {
    const lot = await createLot(auctioneer);
    await bid(lot.id, ana, 100000);
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSend.mockRejectedValue(new Error('rede caiu'));

    const res = await bid(lot.id, bruno, 105000);
    await waitForPendingEmails();

    expect(res.status).toBe(201);
    expect((await prisma.lot.findUnique({ where: { id: lot.id } })).leaderId).toBe(bruno.id);
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('[email] falha'), 'rede caiu');
  });
});

describe('liquidação', () => {
  test('"Você venceu" (com link do comprovante) e "Seu lote foi encerrado" (com o resultado)', async () => {
    const lot = await endedLotWonByBruno();

    const { receiptCode } = await settlementService.settleLot(lot.id);
    await waitForPendingEmails();

    expect(mockSend).toHaveBeenCalledTimes(2);
    const [won] = sentTo(bruno.email);
    expect(won.subject).toBe('Você arrematou "Nighthawks"');
    expect(won.html).toContain(`https://leiloes.exemplo.com/comprovante/${receiptCode}`);
    expect(won.text).toContain('R$ 1.050,00');

    const [ended] = sentTo(auctioneer.email);
    expect(ended.subject).toBe('Seu lote "Nighthawks" foi encerrado');
    expect(ended.text).toContain('vendido por R$ 1.050,00');
    expect(ended.text).toMatch(/Arrematante: Licitante #[0-9A-F]{6}/);
    expect(ended.text).not.toContain('Bruno'); // leiloeiro vê só o apelido

    expect(sentTo(ana.email)).toHaveLength(0); // quem perdeu não recebe "você venceu"
  });

  test('lote sem lances: só o leiloeiro recebe, com "encerrado sem lances"', async () => {
    const lot = await createLot(auctioneer, { title: 'Water Lilies', endsAt: new Date(Date.now() - MINUTE) });

    await settlementService.settleLot(lot.id);
    await waitForPendingEmails();

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(sentTo(auctioneer.email)[0].text).toContain('encerrado sem lances');
  });

  test('é enviado só depois do commit: o lote já aparece liquidado com comprovante', async () => {
    const lot = await endedLotWonByBruno();
    const seen = [];
    mockSend.mockImplementation(async () => {
      const current = await prisma.lot.findUnique({ where: { id: lot.id }, include: { receipt: true } });
      seen.push([current.status, Boolean(current.receipt)]);
      return { data: { id: 'x' }, error: null };
    });

    await settlementService.settleLot(lot.id);
    await waitForPendingEmails();

    expect(seen).toEqual([['SETTLED', true], ['SETTLED', true]]);
  });

  test('idempotente: liquidar de novo não reenvia e-mails', async () => {
    const lot = await endedLotWonByBruno();
    await settlementService.settleLot(lot.id);
    await settlementService.settleLot(lot.id);
    await waitForPendingEmails();

    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  test('falha do Resend (resposta com erro) não desfaz a liquidação', async () => {
    const lot = await endedLotWonByBruno();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSend.mockResolvedValue({ data: null, error: { name: 'validation_error', message: 'domínio não verificado' } });

    const result = await settlementService.settleLot(lot.id);
    await waitForPendingEmails();

    expect(result.outcome).toBe('SOLD');
    const settled = await prisma.lot.findUnique({ where: { id: lot.id }, include: { receipt: true } });
    expect(settled.status).toBe('SETTLED');
    expect(settled.receipt).not.toBeNull();
    expect((await prisma.user.findUnique({ where: { id: bruno.id } })).balanceCents).toBe(395000);
  });
});

describe('quando NÃO enviar', () => {
  test('endereços @demo.com são ignorados', async () => {
    const demo = await createUser({ balanceCents: 500000 });
    await prisma.user.update({ where: { id: demo.id }, data: { email: 'ana@demo.com' } });
    const lot = await createLot(auctioneer);
    await bid(lot.id, demo, 100000);
    await bid(lot.id, bruno, 105000);
    await waitForPendingEmails();

    expect(mockSend).not.toHaveBeenCalled();
  });

  test('com EMAIL_ENABLED=false ou sem chave, nada é enviado (só log)', async () => {
    const lot = await createLot(auctioneer);
    await bid(lot.id, ana, 100000);

    for (const config of [{ EMAIL_ENABLED: false }, { EMAIL_ENABLED: true, RESEND_API_KEY: '' }]) {
      Object.assign(env, { EMAIL_ENABLED: true, RESEND_API_KEY: 're_teste' }, config);
      const info = jest.spyOn(console, 'info').mockImplementation(() => {});
      const [first, second] = [ana, bruno];
      const current = await prisma.lot.findUnique({ where: { id: lot.id } });
      const bidder = current.leaderId === first.id ? second : first;
      await bid(lot.id, bidder, current.currentBidCents + 5000);
      await waitForPendingEmails();
      expect(info).toHaveBeenCalledWith(expect.stringContaining('envio desativado'));
    }
    expect(mockSend).not.toHaveBeenCalled();
  });
});

test('HTML escapa o título da obra (vem de API externa)', async () => {
  const lot = await createLot(auctioneer, { title: '<script>alert(1)</script>' });
  await bid(lot.id, ana, 100000);
  await bid(lot.id, bruno, 105000);
  await waitForPendingEmails();

  const [email] = sentTo(ana.email);
  expect(email.html).not.toContain('<script>');
  expect(email.html).toContain('&lt;script&gt;');
});
