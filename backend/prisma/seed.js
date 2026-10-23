// Popula o banco com dados de demonstração.
// Rodar com: npm run db:seed   (apaga os dados atuais e recria tudo)
//
// Fase 1 (seed básico): usuários com saldo + 3 lotes (ao vivo, agendado, encerrado).
// Na Fase 5 este seed ganha lances com corrente de hashes válida e um lote liquidado com comprovante.
require('dotenv').config({ quiet: true });
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const SEED_PASSWORD = 'senha123';
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// Snapshot de obras reais da API do Art Institute of Chicago
// (mesmo formato que será copiado ao criar um lote pela API na Fase 3).
const artworks = {
  nighthawks: {
    externalId: 111628,
    title: 'Nighthawks',
    artist: 'Edward Hopper (American, 1882–1967)',
    imageUrl:
      'https://www.artic.edu/iiif/2/831a05de-d3f6-f4fa-a460-23008dd58dda/full/843,/0/default.jpg',
    attributes: { date: '1942', medium: 'Oil on canvas' },
  },
  bedroom: {
    externalId: 28560,
    title: 'The Bedroom',
    artist: 'Vincent van Gogh (Dutch, 1853–1890)',
    imageUrl:
      'https://www.artic.edu/iiif/2/6644829f-f292-c5c4-a73c-0356a6fdbf0d/full/843,/0/default.jpg',
    attributes: { date: '1889', medium: 'Oil on canvas' },
  },
  grandeJatte: {
    externalId: 27992,
    title: 'A Sunday on La Grande Jatte — 1884',
    artist: 'Georges Seurat (French, 1859–1891)',
    imageUrl:
      'https://www.artic.edu/iiif/2/2d484387-2509-5e8e-2c43-22f9981972eb/full/843,/0/default.jpg',
    attributes: { date: '1884–86, border added 1888–89', medium: 'Oil on canvas' },
  },
};

async function main() {
  // Apaga na ordem inversa das dependências (filhos antes dos pais).
  await prisma.walletTransaction.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.bid.deleteMany();
  await prisma.lot.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  const auctioneer = await prisma.user.create({
    data: { name: 'Leiloeiro Demo', email: 'leiloeiro@demo.com', passwordHash, role: 'AUCTIONEER' },
  });

  // Licitantes começam com saldo. Cada saldo tem uma transação DEPOSIT correspondente,
  // para o extrato da carteira bater com o balanceCents.
  const bidders = [
    { name: 'Ana Licitante', email: 'ana@demo.com', balanceCents: 500000 }, // R$ 5.000,00
    { name: 'Bruno Licitante', email: 'bruno@demo.com', balanceCents: 300000 }, // R$ 3.000,00
  ];
  for (const b of bidders) {
    await prisma.user.create({
      data: {
        ...b,
        passwordHash,
        role: 'BIDDER',
        transactions: { create: { type: 'DEPOSIT', amountCents: b.balanceCents } },
      },
    });
  }

  const now = Date.now();

  // AO VIVO: começou há 1h e termina em 2h.
  await prisma.lot.create({
    data: {
      ...artworks.nighthawks,
      auctioneerId: auctioneer.id,
      startingBidCents: 100000, // R$ 1.000,00
      minIncrementCents: 5000, // R$ 50,00
      startsAt: new Date(now - HOUR),
      endsAt: new Date(now + 2 * HOUR),
    },
  });

  // AGENDADO: começa amanhã e dura 3h.
  await prisma.lot.create({
    data: {
      ...artworks.bedroom,
      auctioneerId: auctioneer.id,
      startingBidCents: 80000,
      minIncrementCents: 2500,
      startsAt: new Date(now + 24 * HOUR),
      endsAt: new Date(now + 27 * HOUR),
    },
  });

  // ENCERRADO: terminou há 30 min. Fica ACTIVE de propósito: o job de liquidação
  // (Fase 5) vai encontrá-lo e liquidá-lo.
  await prisma.lot.create({
    data: {
      ...artworks.grandeJatte,
      auctioneerId: auctioneer.id,
      startingBidCents: 150000,
      minIncrementCents: 10000,
      startsAt: new Date(now - 3 * HOUR),
      endsAt: new Date(now - 30 * MINUTE),
    },
  });

  console.log('Seed concluído. Senha de todos os usuários: ' + SEED_PASSWORD);
  console.log('  leiloeiro@demo.com (AUCTIONEER)');
  console.log('  ana@demo.com, bruno@demo.com (BIDDER)');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
