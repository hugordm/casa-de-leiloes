// E-mails transacionais com o cliente do Resend SIMULADO (nenhum e-mail real é enviado).
const mockSend = jest.fn();
jest.mock('../src/lib/resendClient', () => ({
  getResendClient: () => ({ emails: { send: mockSend } }),
}));

const { prisma, resetDb, createUser, createLot, bid, MINUTE } = require('./helpers');
const env = require('../src/config/env');
const settlementService = require('../src/services/settlement.service');
const { waitForPendingEmails, sendDueBidDigests } = require('../src/services/email/notification.service');

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

    expect(sentTo(ana.email)).toHaveLength(1);
    expect(sentTo(bruno.email)).toHaveLength(0); // 1º lance (da Ana) não tinha líder anterior
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

describe('leiloeiro: lances no lote dele', () => {
  // Nos testes o "agora" do resumo é simulado: minutesLater(16) = 16 min no futuro.
  const minutesLater = (min) => new Date(Date.now() + min * MINUTE);
  const auctioneerEmails = () => sentTo(auctioneer.email);
  const bidderAliasOf = async (lotId, user) =>
    (await prisma.bid.findFirst({ where: { lotId, bidderId: user.id } })).bidderAlias;

  test('1º lance: "Seu lote começou a receber lances" na hora, só com o apelido do licitante', async () => {
    const lot = await createLot(auctioneer, { title: 'Nighthawks' });
    await bid(lot.id, ana, 100000);
    await waitForPendingEmails();

    const [email] = auctioneerEmails();
    expect(email.subject).toBe('Seu lote "Nighthawks" começou a receber lances');
    expect(email.text).toContain('Primeiro lance: R$ 1.000,00');
    expect(email.text).toContain(`Licitante: ${await bidderAliasOf(lot.id, ana)}`);
    expect(email.text).toMatch(/Tempo restante: (59 min|1 h 00 min)/);
    expect(email.html).toContain(`https://leiloes.exemplo.com/lotes/${lot.id}`);
    for (const content of [email.html, email.text, email.subject]) {
      expect(content).not.toContain('Ana');
      expect(content).not.toContain(ana.email);
    }
  });

  test('lances seguintes não geram e-mail imediato ao leiloeiro', async () => {
    const lot = await createLot(auctioneer);
    await bid(lot.id, ana, 100000);
    await bid(lot.id, bruno, 105000);
    await bid(lot.id, ana, 110000);
    await waitForPendingEmails();

    expect(auctioneerEmails()).toHaveLength(1); // só o do 1º lance
  });

  test('resumo: no máximo 1 a cada 15 min, com lances novos, lance atual, líder e tempo restante', async () => {
    const lot = await createLot(auctioneer, { title: 'Nighthawks' });
    await bid(lot.id, ana, 100000); // aviso do 1º lance (agora)
    await bid(lot.id, bruno, 105000);
    await bid(lot.id, ana, 110000);
    await waitForPendingEmails();
    mockSend.mockClear();

    // 14 min depois do 1º aviso: ainda dentro da janela → nada
    await sendDueBidDigests({ now: minutesLater(14) });
    expect(mockSend).not.toHaveBeenCalled();

    // 16 min depois: resumo dos 2 lances seguintes
    await sendDueBidDigests({ now: minutesLater(16) });
    expect(mockSend).toHaveBeenCalledTimes(1);
    const [digest] = auctioneerEmails();
    expect(digest.subject).toBe('"Nighthawks": 2 lances novos');
    expect(digest.text).toContain('Lances novos: 2');
    expect(digest.text).toContain('Lance atual: R$ 1.100,00');
    expect(digest.text).toContain(`Liderando: ${await bidderAliasOf(lot.id, ana)}`);
    expect(digest.text).toContain('Total de lances: 3');
    expect(digest.text).toMatch(/Tempo restante: 4\d min/); // fim em ~60 min, "agora" = +16 min
    for (const content of [digest.html, digest.text, digest.subject]) {
      for (const user of [ana, bruno]) {
        expect(content).not.toContain(user.name);
        expect(content).not.toContain(user.email);
      }
    }

    // Sem lances novos, nenhum resumo (nem depois de mais 15 min)
    await sendDueBidDigests({ now: minutesLater(40) });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test('a janela de 15 min conta a partir do último aviso', async () => {
    const lot = await createLot(auctioneer);
    await bid(lot.id, ana, 100000);
    await bid(lot.id, bruno, 105000);
    await waitForPendingEmails();
    await sendDueBidDigests({ now: minutesLater(16) }); // resumo nº 1 (aviso em +16)
    mockSend.mockClear();

    await bid(lot.id, ana, 110000);
    await waitForPendingEmails(); // ("superado" do Bruno; aqui só interessam os do leiloeiro)
    await sendDueBidDigests({ now: minutesLater(30) }); // só 14 min desde o último aviso
    expect(auctioneerEmails()).toHaveLength(0);

    await sendDueBidDigests({ now: minutesLater(31) }); // 15 min → resumo nº 2
    expect(auctioneerEmails()).toHaveLength(1);
    expect(auctioneerEmails()[0].subject).toContain('1 lance novo');
  });

  test('lances dentro da janela entram no resumo mesmo sem lance depois dela', async () => {
    const lot = await createLot(auctioneer);
    await bid(lot.id, ana, 100000);
    await bid(lot.id, bruno, 105000); // dentro da janela; ninguém mais dá lance
    await waitForPendingEmails();
    mockSend.mockClear();

    await sendDueBidDigests({ now: minutesLater(15) });
    expect(auctioneerEmails()).toHaveLength(1);
  });

  test('lote já encerrado não recebe resumo (o "Seu lote foi encerrado" cobre)', async () => {
    const lot = await createLot(auctioneer, { endsAt: new Date(Date.now() + 10 * MINUTE) });
    await bid(lot.id, ana, 100000);
    await bid(lot.id, bruno, 105000);
    await waitForPendingEmails();
    mockSend.mockClear();

    await sendDueBidDigests({ now: minutesLater(16) }); // o lote terminou em +10 min
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('duas rodadas simultâneas enviam um único resumo', async () => {
    const lot = await createLot(auctioneer);
    await bid(lot.id, ana, 100000);
    await bid(lot.id, bruno, 105000);
    await waitForPendingEmails();
    mockSend.mockClear();

    const now = minutesLater(16);
    await Promise.all([sendDueBidDigests({ now }), sendDueBidDigests({ now }), sendDueBidDigests({ now })]);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test('é enviado só depois do commit e falha do Resend não afeta o lance', async () => {
    const lot = await createLot(auctioneer);
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    let seenBidCount;
    mockSend.mockImplementation(async () => {
      seenBidCount = (await prisma.lot.findUnique({ where: { id: lot.id } })).bidCount;
      throw new Error('rede caiu');
    });

    const res = await bid(lot.id, ana, 100000);
    await waitForPendingEmails();

    expect(res.status).toBe(201);
    expect(seenBidCount).toBe(1); // o lance já estava confirmado quando o e-mail saiu
    expect((await prisma.lot.findUnique({ where: { id: lot.id } })).leaderId).toBe(ana.id);
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('[email] falha'), 'rede caiu');
  });

  test('não bloqueia a resposta do 1º lance (Resend lento)', async () => {
    const lot = await createLot(auctioneer);
    mockSend.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ data: {}, error: null }), 1500)));

    const started = Date.now();
    const res = await bid(lot.id, ana, 100000);

    expect(res.status).toBe(201);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  test('falha no resumo de um lote não impede o de outro', async () => {
    const lotA = await createLot(auctioneer, { title: 'Lote A' });
    const lotB = await createLot(auctioneer, { title: 'Lote B' });
    for (const lot of [lotA, lotB]) {
      await bid(lot.id, ana, 100000);
      await bid(lot.id, bruno, 105000);
    }
    await waitForPendingEmails();
    mockSend.mockClear();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSend
      .mockRejectedValueOnce(new Error('rede caiu'))
      .mockResolvedValue({ data: { id: 'ok' }, error: null });

    await sendDueBidDigests({ now: minutesLater(16) });
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  test('leiloeiro @demo.com não recebe resumo', async () => {
    await prisma.user.update({ where: { id: auctioneer.id }, data: { email: 'leiloeiro@demo.com' } });
    const lot = await createLot(auctioneer);
    await bid(lot.id, ana, 100000);
    await bid(lot.id, bruno, 105000);
    await waitForPendingEmails();
    mockSend.mockClear();

    await sendDueBidDigests({ now: minutesLater(16) });
    expect(mockSend).not.toHaveBeenCalled();
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
  test('endereços @demo.com são ignorados (licitante e leiloeiro)', async () => {
    const demo = await createUser({ balanceCents: 500000 });
    await prisma.user.update({ where: { id: demo.id }, data: { email: 'ana@demo.com' } });
    await prisma.user.update({ where: { id: auctioneer.id }, data: { email: 'leiloeiro@demo.com' } });
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
