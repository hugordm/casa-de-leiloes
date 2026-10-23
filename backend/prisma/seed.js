// Popula o banco com dados de demonstração.
// Rodar com: npm run db:seed   (APAGA os dados atuais e recria tudo, com ids previsíveis)
//
// TRAVA DE SEGURANÇA: se o banco já tiver usuários, o seed se recusa a rodar
// (evita apagar dados de produção por engano). Para recriar de propósito:
//   SEED_FORCE=true npm run db:seed
//
// Usa o MESMO código da aplicação para gerar a corrente de hashes e para liquidar,
// então a auditoria dos lotes do seed dá "íntegra". Por isso o seed precisa rodar com
// o mesmo AUDIT_SECRET da API (em produção, rode o seed com as variáveis do Render).
//
// Resultado (ids fixos):
//   Lote #1 Nighthawks        AO VIVO, termina em 30 dias, 3 lances (Ana lidera)
//   Lote #2 Water Lilies      AO VIVO, termina 5 min após o seed, 2 lances (Bruno lidera)
//                             → demonstra a liquidação automática (job a cada 15s)
//   Lote #3 The Bedroom       AGENDADO (começa amanhã)
//   Lote #4 La Grande Jatte   LIQUIDADO ontem: Ana venceu, com comprovante
const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');
const hashChain = require('../src/services/hashChain.service');
const settlementService = require('../src/services/settlement.service');
const { waitForPendingEmails } = require('../src/services/email/notification.service');

const SEED_PASSWORD = 'senha123';
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Snapshot de obras reais da API do Art Institute of Chicago
// (mesmo formato copiado ao criar um lote pela API).
const iiif = (imageId) => `https://www.artic.edu/iiif/2/${imageId}/full/843,/0/default.jpg`;
const artworks = {
  nighthawks: {
    externalId: 111628,
    title: 'Nighthawks',
    artist: 'Edward Hopper (American, 1882–1967)',
    imageUrl: iiif('831a05de-d3f6-f4fa-a460-23008dd58dda'),
    attributes: { date: '1942', medium: 'Oil on canvas' },
  },
  waterLilies: {
    externalId: 16568,
    title: 'Water Lilies',
    artist: 'Claude Monet (French, 1840–1926)',
    imageUrl: iiif('3c27b499-af56-f0d5-93b5-a7f2f1ad5813'),
    attributes: { date: '1906', medium: 'Oil on canvas' },
  },
  bedroom: {
    externalId: 28560,
    title: 'The Bedroom',
    artist: 'Vincent van Gogh (Dutch, 1853–1890)',
    imageUrl: iiif('6644829f-f292-c5c4-a73c-0356a6fdbf0d'),
    attributes: { date: '1889', medium: 'Oil on canvas' },
  },
  grandeJatte: {
    externalId: 27992,
    title: 'A Sunday on La Grande Jatte — 1884',
    artist: 'Georges Seurat (French, 1859–1891)',
    imageUrl: iiif('2d484387-2509-5e8e-2c43-22f9981972eb'),
    attributes: { date: '1884–86, border added 1888–89', medium: 'Oil on canvas' },
  },
};

// Cria o lote já com o selo inicial (0 lances), como faz lot.service.createLot.
async function createLot(data) {
  const lot = await prisma.lot.create({ data });
  return prisma.lot.update({
    where: { id: lot.id },
    data: { seal: hashChain.computeSeal({ lotId: lot.id, bidCount: 0, lastHash: null }) },
  });
}

// Grava lances "históricos" (com datas no passado) montando a corrente de hashes
// exatamente como o bid.service faz. Não usamos placeBid porque ele usa a hora atual.
async function addBids(lot, bids) {
  let prevHash = hashChain.genesisHash(lot.id);
  let seq = 0;
  let last = null;

  for (const { bidder, amountCents, createdAt } of bids) {
    seq += 1;
    const bidderAlias = hashChain.bidderAlias(lot.id, bidder.id);
    const hash = hashChain.computeBidHash({ prevHash, lotId: lot.id, seq, bidderAlias, amountCents, createdAt });
    await prisma.bid.create({
      data: { lotId: lot.id, bidderId: bidder.id, amountCents, seq, bidderAlias, createdAt, prevHash, hash },
    });
    prevHash = hash;
    last = { bidder, amountCents, hash };
  }

  return prisma.lot.update({
    where: { id: lot.id },
    data: {
      currentBidCents: last.amountCents,
      leaderId: last.bidder.id,
      bidCount: seq,
      lastHash: last.hash,
      seal: hashChain.computeSeal({ lotId: lot.id, bidCount: seq, lastHash: last.hash }),
    },
  });
}

async function main() {
  const existingUsers = await prisma.user.count();
  // Modo usado pelo Docker Compose a cada subida: popula só um banco VAZIO (1ª subida).
  // Com o banco já populado, apenas avisa e sai com sucesso, para a API seguir subindo.
  if (existingUsers > 0 && process.env.SEED_IF_EMPTY === 'true') {
    console.log(`Seed ignorado: o banco já tem ${existingUsers} usuário(s).`);
    return;
  }
  if (existingUsers > 0 && process.env.SEED_FORCE !== 'true') {
    console.error(
      `\nSeed cancelado: o banco já tem ${existingUsers} usuário(s) e o seed APAGA tudo.\n` +
        'Se é isso mesmo que você quer (ex.: banco local), rode: SEED_FORCE=true npm run db:seed\n'
    );
    process.exitCode = 1;
    return;
  }

  // Apaga tudo e reinicia os ids (lote #1 é sempre o "ao vivo", etc.).
  await prisma.$executeRawUnsafe(
    'TRUNCATE "WalletTransaction", "Receipt", "Bid", "Lot", "User" RESTART IDENTITY CASCADE'
  );

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const now = Date.now();
  const ago = (ms) => new Date(now - ms);
  const fromNow = (ms) => new Date(now + ms);

  // ---- Usuários (ids 1, 2, 3) ----
  const auctioneer = await prisma.user.create({
    data: { name: 'Leiloeiro Demo', email: 'leiloeiro@demo.com', passwordHash, role: 'AUCTIONEER' },
  });
  // Cada saldo inicial tem a transação DEPOSIT correspondente (extrato bate com o saldo).
  const createBidder = (name, email, balanceCents) =>
    prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: 'BIDDER',
        balanceCents,
        transactions: { create: { type: 'DEPOSIT', amountCents: balanceCents, createdAt: ago(4 * DAY) } },
      },
    });
  const ana = await createBidder('Ana Licitante', 'ana@demo.com', 500000); // R$ 5.000
  const bruno = await createBidder('Bruno Licitante', 'bruno@demo.com', 300000); // R$ 3.000

  // ---- Lote #1: AO VIVO por 30 dias, com lances ----
  const live = await createLot({
    ...artworks.nighthawks,
    auctioneerId: auctioneer.id,
    startingBidCents: 100000, // R$ 1.000
    minIncrementCents: 5000, // R$ 50
    startsAt: ago(2 * HOUR),
    endsAt: fromNow(30 * DAY),
  });
  await addBids(live, [
    { bidder: ana, amountCents: 100000, createdAt: ago(90 * MINUTE) },
    { bidder: bruno, amountCents: 105000, createdAt: ago(60 * MINUTE) },
    { bidder: ana, amountCents: 120000, createdAt: ago(30 * MINUTE) },
  ]);

  // ---- Lote #2: termina em 5 minutos, com lances (demonstra a liquidação) ----
  const endingSoon = await createLot({
    ...artworks.waterLilies,
    auctioneerId: auctioneer.id,
    startingBidCents: 30000, // R$ 300
    minIncrementCents: 5000,
    startsAt: ago(HOUR),
    endsAt: fromNow(5 * MINUTE),
  });
  await addBids(endingSoon, [
    { bidder: ana, amountCents: 30000, createdAt: ago(40 * MINUTE) },
    { bidder: bruno, amountCents: 35000, createdAt: ago(20 * MINUTE) },
  ]);

  // ---- Lote #3: AGENDADO ----
  await createLot({
    ...artworks.bedroom,
    auctioneerId: auctioneer.id,
    startingBidCents: 80000,
    minIncrementCents: 2500,
    startsAt: fromNow(DAY),
    endsAt: fromNow(DAY + 3 * HOUR),
  });

  // ---- Lote #4: encerrado ontem e LIQUIDADO (Ana vence por R$ 1.600) ----
  const ended = await createLot({
    ...artworks.grandeJatte,
    auctioneerId: auctioneer.id,
    startingBidCents: 150000,
    minIncrementCents: 10000,
    startsAt: ago(3 * DAY),
    endsAt: ago(DAY),
  });
  await addBids(ended, [
    { bidder: bruno, amountCents: 150000, createdAt: ago(2 * DAY) },
    { bidder: ana, amountCents: 160000, createdAt: ago(DAY + 2 * HOUR) },
  ]);
  // Liquida com o serviço real: débito, crédito e comprovante.
  await settlementService.settleLot(ended.id);
  // O código é lido do banco (e não do retorno do settleLot) porque, se a API estiver no ar
  // apontando para o mesmo banco, o job de liquidação dela pode liquidar o lote #4 antes desta
  // linha. Aí o settleLot devolve "já liquidado" (sem código), mas o comprovante existe.
  const receipt = await prisma.receipt.findUnique({ where: { lotId: ended.id } });
  const receiptCode = receipt ? receipt.code : '(não encontrado: confira o lote #4)';

  console.log(`
Seed concluído. Senha de todos os usuários: ${SEED_PASSWORD}
  leiloeiro@demo.com  (AUCTIONEER)  recebeu R$ 1.600,00 pelo lote #4
  ana@demo.com        (BIDDER)      saldo R$ 3.400,00 | lidera o lote #1 (R$ 1.200,00) | venceu o lote #4
  bruno@demo.com      (BIDDER)      saldo R$ 3.000,00 | lidera o lote #2 (R$ 350,00)

  Lote #1 ao vivo (30 dias) | #2 termina às ${endingSoon.endsAt.toLocaleTimeString('pt-BR')} | #3 agendado | #4 liquidado
  Comprovante do lote #4: /comprovante/${receiptCode}   (API: GET /receipts/${receiptCode})
  Auditoria:              /auditoria/1 ... /auditoria/4  (API: GET /audit/1 ...)
`);
}

main()
  // A liquidação do lote #4 dispara e-mails em segundo plano (ignorados para @demo.com):
  // espera terminarem antes de fechar a conexão com o banco.
  .then(waitForPendingEmails)
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
