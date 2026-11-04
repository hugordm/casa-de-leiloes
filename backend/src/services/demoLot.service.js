// Mantém o portfólio publicado sempre com um lote ao vivo: quando não há nenhum, cria um lote de
// demonstração SEM lances (quem visita dá o primeiro lance com uma conta demo). Lances automáticos
// ficaram de fora de propósito: cada liquidação debitaria os licitantes demo até zerar o saldo deles.
// Desligado por padrão; só roda com DEMO_KEEP_LIVE=true (ligado apenas no Render).
const prisma = require('../lib/prisma');
const env = require('../config/env');
const hashChain = require('./hashChain.service');

const DAY = 24 * 60 * 60 * 1000;
const DEMO_DURATION_MS = 30 * DAY; // o máximo que a criação de lote permite
const DEMO_AUCTIONEER_EMAIL = 'leiloeiro@demo.com'; // conta do seed

// Chave arbitrária do pg_advisory_xact_lock, reservada para esta rotina.
const DEMO_LOCK_KEY = 724001;

// Snapshot salvo no código: a criação não depende da API do Art Institute estar no ar.
const iiif = (imageId) => `https://www.artic.edu/iiif/2/${imageId}/full/843,/0/default.jpg`;
const DEMO_ARTWORKS = [
  {
    externalId: 16568,
    title: 'Water Lilies',
    artist: 'Claude Monet (French, 1840–1926)',
    imageUrl: iiif('3c27b499-af56-f0d5-93b5-a7f2f1ad5813'),
    attributes: { date: '1906', medium: 'Oil on canvas' },
  },
  {
    externalId: 28560,
    title: 'The Bedroom',
    artist: 'Vincent van Gogh (Dutch, 1853–1890)',
    imageUrl: iiif('6644829f-f292-c5c4-a73c-0356a6fdbf0d'),
    attributes: { date: '1889', medium: 'Oil on canvas' },
  },
  {
    externalId: 111628,
    title: 'Nighthawks',
    artist: 'Edward Hopper (American, 1882–1967)',
    imageUrl: iiif('831a05de-d3f6-f4fa-a460-23008dd58dda'),
    attributes: { date: '1942', medium: 'Oil on canvas' },
  },
];

// `enabled` e `now` existem para os testes; em produção valem a variável e a hora atual.
async function ensureLiveDemoLot({ enabled = env.DEMO_KEEP_LIVE, now = new Date() } = {}) {
  if (!enabled) return { created: false, reason: 'DISABLED' };

  return prisma.$transaction(async (tx) => {
    // Sem a trava, duas rodadas ao mesmo tempo (ou duas instâncias da API) contariam "zero lotes
    // ao vivo" juntas e criariam dois lotes. O advisory lock enfileira as rodadas: a segunda só
    // conta depois que a primeira fez commit, e então já enxerga o lote criado. Ele é liberado
    // sozinho no fim da transação. ($executeRaw porque a função devolve "void".)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DEMO_LOCK_KEY})`;

    const liveCount = await tx.lot.count({
      where: { status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } },
    });
    if (liveCount > 0) return { created: false, reason: 'HAS_LIVE' };

    const auctioneer = await tx.user.findUnique({ where: { email: DEMO_AUCTIONEER_EMAIL } });
    if (!auctioneer || auctioneer.role !== 'AUCTIONEER') return { created: false, reason: 'NO_AUCTIONEER' };

    // Revezamento das obras: cada lote novo usa a próxima da lista.
    const previous = await tx.lot.count({ where: { auctioneerId: auctioneer.id } });
    const artwork = DEMO_ARTWORKS[previous % DEMO_ARTWORKS.length];

    const created = await tx.lot.create({
      data: {
        auctioneerId: auctioneer.id,
        ...artwork,
        startingBidCents: 50000,
        minIncrementCents: 5000,
        startsAt: now,
        endsAt: new Date(now.getTime() + DEMO_DURATION_MS),
      },
    });
    // Mesmo selo inicial do lot.service.createLot: o lote nasce auditável, com 0 lances.
    const lot = await tx.lot.update({
      where: { id: created.id },
      data: { seal: hashChain.computeSeal({ lotId: created.id, bidCount: 0, lastHash: null }) },
    });
    return { created: true, lotId: lot.id };
  });
}

module.exports = { ensureLiveDemoLot, DEMO_AUCTIONEER_EMAIL };
