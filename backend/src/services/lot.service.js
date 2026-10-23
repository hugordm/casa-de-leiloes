// Regras de lotes: criação (com snapshot da obra), cancelamento, listagem e detalhe.
const prisma = require('../lib/prisma');
const AppError = require('../errors/AppError');
const catalogService = require('./catalog.service');
const { getDisplayStatus, getMinNextBidCents } = require('../utils/lot');
const { isCents, parseDate, parseId } = require('../utils/validation');

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

const MAX_PRICE_CENTS = 100_000_000; // R$ 1.000.000,00 — teto para valores de lote
const MIN_DURATION_MS = 5 * MINUTE;
const MAX_DURATION_MS = 30 * DAY;
const START_TOLERANCE_MS = MINUTE; // aceita startsAt até 1 min no passado (relógio/latência)
const LIST_LIMIT = 100;

function notFound() {
  return new AppError(404, 'LOT_NOT_FOUND', 'Lote não encontrado');
}

function validationError(message) {
  return new AppError(400, 'VALIDATION_ERROR', message);
}

// Formato público do lote. Não expõe leaderId/winnerId (privacidade dos licitantes).
function serializeLot(lot, now = new Date()) {
  return {
    id: lot.id,
    externalId: lot.externalId,
    title: lot.title,
    artist: lot.artist,
    imageUrl: lot.imageUrl,
    attributes: lot.attributes,
    startingBidCents: lot.startingBidCents,
    minIncrementCents: lot.minIncrementCents,
    currentBidCents: lot.currentBidCents,
    minNextBidCents: getMinNextBidCents(lot),
    bidCount: lot.bidCount,
    startsAt: lot.startsAt,
    endsAt: lot.endsAt,
    status: lot.status,
    displayStatus: getDisplayStatus(lot, now),
    finalPriceCents: lot.finalPriceCents,
    auctioneer: lot.auctioneer ? { id: lot.auctioneer.id, name: lot.auctioneer.name } : undefined,
    createdAt: lot.createdAt,
  };
}

const includeAuctioneer = { auctioneer: { select: { id: true, name: true } } };

// ---------- Criação ----------

async function createLot(auctioneerId, body = {}) {
  const { externalId, startingBidCents, minIncrementCents } = body;
  const now = new Date();

  if (!Number.isInteger(externalId) || !parseId(externalId)) {
    throw validationError('Selecione uma obra do catálogo');
  }
  if (!isCents(startingBidCents, { min: 1, max: MAX_PRICE_CENTS })) {
    throw validationError('Lance inicial inválido (em centavos, entre 1 e 100000000)');
  }
  if (!isCents(minIncrementCents, { min: 1, max: MAX_PRICE_CENTS })) {
    throw validationError('Incremento mínimo inválido (em centavos, entre 1 e 100000000)');
  }

  // startsAt é opcional: se não vier, o lote começa agora.
  const startsAt = body.startsAt == null ? now : parseDate(body.startsAt);
  const endsAt = parseDate(body.endsAt);
  if (!startsAt) throw validationError('Data de início inválida');
  if (!endsAt) throw validationError('Data de término inválida');
  if (startsAt.getTime() < now.getTime() - START_TOLERANCE_MS) {
    throw validationError('A data de início não pode estar no passado');
  }
  const duration = endsAt.getTime() - startsAt.getTime();
  if (duration < MIN_DURATION_MS) {
    throw validationError('O leilão deve durar pelo menos 5 minutos');
  }
  if (duration > MAX_DURATION_MS) {
    throw validationError('O leilão pode durar no máximo 30 dias');
  }

  // SNAPSHOT: o servidor busca a obra na API externa e copia os dados para o banco.
  // Não confiamos em título/imagem enviados pelo cliente, e a partir daqui
  // o lote não depende mais da API (vitrine, sala e auditoria funcionam se ela cair).
  const artwork = await catalogService.getArtwork(externalId);

  const lot = await prisma.lot.create({
    data: {
      auctioneerId,
      externalId: artwork.externalId,
      title: artwork.title,
      artist: artwork.artist,
      imageUrl: artwork.imageUrl,
      attributes: artwork.attributes,
      startingBidCents,
      minIncrementCents,
      startsAt,
      endsAt,
    },
    include: includeAuctioneer,
  });

  return serializeLot(lot);
}

// ---------- Cancelamento ----------

async function cancelLot(lotId, auctioneerId) {
  return prisma.$transaction(async (tx) => {
    // Trava a linha do lote até o fim da transação. Assim um lance não consegue
    // entrar entre a verificação "não há lances" e a gravação do cancelamento
    // (o serviço de lances trava a mesma linha).
    const locked = await tx.$queryRaw`SELECT id FROM "Lot" WHERE id = ${lotId} FOR UPDATE`;
    if (locked.length === 0) throw notFound();

    const lot = await tx.lot.findUnique({ where: { id: lotId } });
    const now = new Date();

    if (lot.auctioneerId !== auctioneerId) {
      throw new AppError(403, 'NOT_LOT_OWNER', 'Você só pode cancelar os seus próprios lotes');
    }
    if (lot.status === 'CANCELLED') {
      throw new AppError(409, 'LOT_ALREADY_CANCELLED', 'Este lote já foi cancelado');
    }
    if (lot.status === 'SETTLED' || now >= lot.endsAt) {
      throw new AppError(409, 'LOT_ENDED', 'Lote encerrado não pode ser cancelado');
    }
    if (lot.bidCount > 0) {
      throw new AppError(409, 'LOT_HAS_BIDS', 'Não é possível cancelar um lote que já recebeu lances');
    }

    const updated = await tx.lot.update({
      where: { id: lotId },
      data: { status: 'CANCELLED' },
      include: includeAuctioneer,
    });
    return serializeLot(updated, now);
  });
}

// ---------- Listagem (vitrine) ----------

// Lê um filtro de preço (em centavos) da query string. undefined = filtro não usado.
function parsePriceFilter(value, label) {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw validationError(`Filtro ${label} inválido (use centavos, ex.: 150000 = R$ 1.500,00)`);
  }
  return n;
}

async function listLots(query = {}) {
  const now = new Date();
  // Cancelados nunca aparecem na vitrine.
  const and = [{ status: { not: 'CANCELLED' } }];
  let orderBy = { endsAt: 'asc' };

  // Status exibido → condições de data (mesma regra de getDisplayStatus)
  switch (query.status) {
    case undefined:
    case '':
      break;
    case 'live':
      and.push({ startsAt: { lte: now } }, { endsAt: { gt: now } });
      orderBy = { endsAt: 'asc' }; // terminando antes primeiro
      break;
    case 'scheduled':
      and.push({ startsAt: { gt: now } });
      orderBy = { startsAt: 'asc' }; // começando antes primeiro
      break;
    case 'ended':
      and.push({ endsAt: { lte: now } });
      orderBy = { endsAt: 'desc' }; // encerrado mais recente primeiro
      break;
    default:
      throw validationError('Filtro de status inválido (use live, scheduled ou ended)');
  }

  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search) {
    and.push({
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { artist: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  // Preço "atual" = lance atual, ou o lance inicial se ainda não houver lances.
  const minPrice = parsePriceFilter(query.minPrice, 'minPrice');
  const maxPrice = parsePriceFilter(query.maxPrice, 'maxPrice');
  if (minPrice !== undefined) {
    and.push({
      OR: [
        { currentBidCents: { gte: minPrice } },
        { currentBidCents: null, startingBidCents: { gte: minPrice } },
      ],
    });
  }
  if (maxPrice !== undefined) {
    and.push({
      OR: [
        { currentBidCents: { lte: maxPrice } },
        { currentBidCents: null, startingBidCents: { lte: maxPrice } },
      ],
    });
  }

  const lots = await prisma.lot.findMany({
    where: { AND: and },
    orderBy,
    take: LIST_LIMIT,
    include: includeAuctioneer,
  });
  return lots.map((lot) => serializeLot(lot, now));
}

// ---------- Detalhe (sala) ----------

const RECENT_BIDS = 10;

// Situação do licitante logado na sala: está ganhando? qual o maior lance dele? em que posição?
// Posição = ranking dos licitantes pelo maior lance de cada um (1 = líder).
async function getViewerSituation(lot, userId) {
  const ranking = await prisma.bid.groupBy({
    by: ['bidderId'],
    where: { lotId: lot.id },
    _max: { amountCents: true },
    orderBy: { _max: { amountCents: 'desc' } },
  });
  const index = ranking.findIndex((r) => r.bidderId === userId);
  if (index === -1) return { status: 'none' }; // ainda não deu lance neste lote

  return {
    status: lot.leaderId === userId ? 'leading' : 'outbid',
    myBestBidCents: ranking[index]._max.amountCents,
    position: index + 1,
    totalBidders: ranking.length,
  };
}

// viewer = req.user (opcional). Visitante vê tudo, menos o bloco "me".
async function getLot(lotId, viewer) {
  const lot = await prisma.lot.findUnique({
    where: { id: lotId },
    include: {
      ...includeAuctioneer,
      // Últimos lances, só com apelido (nunca nome/e-mail/id do licitante)
      bids: {
        orderBy: { seq: 'desc' },
        take: RECENT_BIDS,
        select: { seq: true, bidderAlias: true, amountCents: true, createdAt: true },
      },
    },
  });
  if (!lot) throw notFound();

  // Cancelado é retornado (displayStatus 'cancelled') para quem tinha o link entender o que houve.
  const result = {
    ...serializeLot(lot),
    leaderAlias: lot.bids[0]?.bidderAlias ?? null, // o último lance é sempre do líder
    recentBids: lot.bids,
  };
  if (viewer?.role === 'BIDDER') {
    result.me = await getViewerSituation(lot, viewer.id);
  }
  return result;
}

module.exports = { createLot, cancelLot, listLots, getLot, serializeLot };
