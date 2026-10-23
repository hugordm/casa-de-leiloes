// Funções de apoio para montar cenários nos testes.
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/lib/prisma');
const { signToken } = require('../src/services/auth.service');
const { computeSeal } = require('../src/services/hashChain.service');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// Apaga todos os dados entre os testes (cada teste começa com o banco vazio).
async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "WalletTransaction", "Receipt", "Bid", "Lot", "User" RESTART IDENTITY CASCADE'
  );
}

let userCounter = 0;

// Cria usuário direto no banco (sem bcrypt, para os testes ficarem rápidos)
// e já devolve um token válido para ele.
async function createUser({ role = 'BIDDER', balanceCents = 0, name } = {}) {
  userCounter += 1;
  const user = await prisma.user.create({
    data: {
      name: name || `Usuário ${userCounter}`,
      email: `user${userCounter}@teste.com`,
      passwordHash: 'nao-usado-nos-testes',
      role,
      balanceCents,
    },
  });
  return { ...user, token: signToken(user) };
}

// Cria lote direto no banco (sem chamar a API externa).
// Padrão: AO VIVO (começou há 1h, termina em 1h), inicial R$ 1.000,00, incremento R$ 50,00.
async function createLot(auctioneer, overrides = {}) {
  const now = Date.now();
  const lot = await prisma.lot.create({
    data: {
      auctioneerId: auctioneer.id,
      externalId: 1,
      title: 'Obra de teste',
      artist: 'Artista de teste',
      imageUrl: null,
      attributes: {},
      startingBidCents: 100000,
      minIncrementCents: 5000,
      startsAt: new Date(now - HOUR),
      endsAt: new Date(now + HOUR),
      ...overrides,
    },
  });
  // Selo inicial, igual ao lot.service.createLot (lote sem lances também é auditável).
  return prisma.lot.update({
    where: { id: lot.id },
    data: { seal: computeSeal({ lotId: lot.id, bidCount: 0, lastHash: null }) },
  });
}

// Faz um lance pela API (passando por rota, middlewares e service).
function bid(lotId, user, amountCents) {
  return request(app)
    .post(`/lots/${lotId}/bids`)
    .set('Authorization', `Bearer ${user.token}`)
    .send({ amountCents });
}

function getWallet(user) {
  return request(app).get('/wallet').set('Authorization', `Bearer ${user.token}`);
}

module.exports = { app, prisma, request, resetDb, createUser, createLot, bid, getWallet, MINUTE, HOUR };
