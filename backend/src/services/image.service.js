// Proxy das imagens do Art Institute of Chicago.
//
// Por quê: o servidor de imagens da AIC (IIIF) passou a bloquear (403, Cloudflare)
// requisições sem o cabeçalho "AIC-User-Agent". Uma tag <img> no navegador não consegue
// enviar cabeçalhos próprios, então o navegador pede a imagem à NOSSA API e a API busca
// na AIC com o cabeçalho.
//
// Segurança: só aceitamos um image_id no formato UUID e montamos a URL da AIC nós mesmos.
// Assim a rota não vira um "proxy aberto" capaz de buscar qualquer endereço (SSRF).
const env = require('../config/env');
const AppError = require('../errors/AppError');

const TIMEOUT_MS = 5000;
const IMAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AIC_IIIF_URL = /^https:\/\/www\.artic\.edu\/iiif\/2\/([0-9a-f-]{36})\//i;

function aicImageUrl(imageId) {
  return `https://www.artic.edu/iiif/2/${imageId}/full/843,/0/default.jpg`;
}

// URL gravada no lote (snapshot da AIC) → endereço público via nosso proxy.
// O banco continua com a URL original; a troca acontece só na resposta da API.
function toPublicImageUrl(imageUrl) {
  const match = typeof imageUrl === 'string' ? imageUrl.match(AIC_IIIF_URL) : null;
  return match ? `/images/aic/${match[1].toLowerCase()}` : imageUrl;
}

function unavailable() {
  return new AppError(502, 'IMAGE_UNAVAILABLE', 'Imagem indisponível no momento');
}

async function fetchAicImage(imageId) {
  if (!IMAGE_ID.test(imageId)) {
    throw new AppError(404, 'IMAGE_NOT_FOUND', 'Imagem não encontrada');
  }

  let response;
  try {
    response = await fetch(aicImageUrl(imageId), {
      headers: { 'AIC-User-Agent': env.AIC_USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error('[images] falha ao buscar imagem na AIC:', err.name, err.message);
    throw unavailable();
  }

  const contentType = response.headers.get('content-type') || '';
  if (response.status === 404) throw new AppError(404, 'IMAGE_NOT_FOUND', 'Imagem não encontrada');
  if (!response.ok || !contentType.startsWith('image/')) {
    console.error('[images] resposta inesperada da AIC:', response.status, contentType);
    throw unavailable();
  }

  return { contentType, body: Buffer.from(await response.arrayBuffer()) };
}

module.exports = { toPublicImageUrl, fetchAicImage };
