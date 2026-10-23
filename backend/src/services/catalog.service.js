// Integração com a API do Art Institute of Chicago (gratuita, sem chave).
// Só é usada para BUSCAR obras e para copiar os dados ao criar um lote.
// Depois de criado, o lote nunca mais depende desta API.
const env = require('../config/env');
const AppError = require('../errors/AppError');

const TIMEOUT_MS = 5000;
const SEARCH_LIMIT = 20;
const FIELDS = 'id,title,artist_display,date_display,medium_display,image_id';

function unavailable() {
  return new AppError(
    502,
    'CATALOG_UNAVAILABLE',
    'O catálogo de obras está indisponível no momento. Tente novamente em instantes.'
  );
}

// Faz a chamada HTTP com timeout e trata todos os jeitos de dar errado.
// Retorna { status, body } — quem chama decide o que fazer com 404 etc.
async function requestJson(path) {
  let response;
  try {
    response = await fetch(`${env.AIC_API_URL}${path}`, {
      headers: { 'AIC-User-Agent': env.AIC_USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // TimeoutError (passou de 5s) ou falha de rede/DNS
    console.error('[catalog] falha ao chamar a AIC:', err.name, err.message);
    throw unavailable();
  }

  // Se a AIC responder HTML (ex.: desafio do Cloudflare), não é algo que conseguimos usar.
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    console.error('[catalog] resposta não-JSON da AIC:', response.status, contentType);
    throw unavailable();
  }

  return { status: response.status, body: await response.json() };
}

// Converte o formato da AIC para o formato do nosso sistema (o mesmo gravado no lote).
function toArtwork(item) {
  return {
    externalId: item.id,
    title: item.title || 'Sem título',
    artist: item.artist_display || 'Artista desconhecido',
    imageUrl: item.image_id
      ? `https://www.artic.edu/iiif/2/${item.image_id}/full/843,/0/default.jpg`
      : null,
    attributes: {
      date: item.date_display || null,
      medium: item.medium_display || null,
    },
  };
}

async function search(q) {
  const term = typeof q === 'string' ? q.trim() : '';
  if (term.length < 2) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Digite pelo menos 2 caracteres para buscar');
  }

  const params = new URLSearchParams({ q: term, fields: FIELDS, limit: String(SEARCH_LIMIT) });
  const { status, body } = await requestJson(`/artworks/search?${params}`);
  if (status !== 200 || !Array.isArray(body.data)) throw unavailable();

  return body.data.map(toArtwork);
}

async function getArtwork(externalId) {
  const { status, body } = await requestJson(`/artworks/${externalId}?fields=${FIELDS}`);
  if (status === 404) {
    throw new AppError(404, 'ARTWORK_NOT_FOUND', 'Obra não encontrada no catálogo');
  }
  if (status !== 200 || !body.data) throw unavailable();

  return toArtwork(body.data);
}

module.exports = { search, getArtwork };
