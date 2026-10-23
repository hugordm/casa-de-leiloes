// Proxy de imagens da AIC. O fetch externo é simulado (os testes não dependem da internet).
const { prisma, request, app } = require('./helpers');
const { toPublicImageUrl } = require('../src/services/image.service');

const IMAGE_ID = '831a05de-d3f6-f4fa-a460-23008dd58dda';

afterEach(() => jest.restoreAllMocks());
afterAll(() => prisma.$disconnect());

test('converte a URL da AIC gravada no lote para o endereço do proxy', () => {
  expect(toPublicImageUrl(`https://www.artic.edu/iiif/2/${IMAGE_ID}/full/843,/0/default.jpg`)).toBe(`/images/aic/${IMAGE_ID}`);
  expect(toPublicImageUrl(null)).toBeNull();
  expect(toPublicImageUrl('https://exemplo.com/x.jpg')).toBe('https://exemplo.com/x.jpg');
});

test('busca a imagem na AIC com o cabeçalho AIC-User-Agent e devolve com cache', async () => {
  const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(Buffer.from('jpeg-falso'), { status: 200, headers: { 'content-type': 'image/jpeg' } })
  );

  const res = await request(app).get(`/images/aic/${IMAGE_ID}`);

  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toBe('image/jpeg');
  expect(res.headers['cache-control']).toContain('max-age=604800');
  const [url, options] = fetchSpy.mock.calls[0];
  expect(url).toBe(`https://www.artic.edu/iiif/2/${IMAGE_ID}/full/843,/0/default.jpg`);
  expect(options.headers['AIC-User-Agent']).toBeTruthy();
});

test('id fora do formato UUID é recusado sem chamar a AIC (sem proxy aberto)', async () => {
  const fetchSpy = jest.spyOn(global, 'fetch');
  for (const bad of ['abc', '..%2F..%2Fetc', 'http%3A%2F%2Finterno%2F']) {
    expect((await request(app).get(`/images/aic/${bad}`)).status).toBe(404);
  }
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('AIC fora do ar ou respondendo HTML (Cloudflare) → 502', async () => {
  jest.spyOn(global, 'fetch').mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
  expect((await request(app).get(`/images/aic/${IMAGE_ID}`)).status).toBe(502);

  jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response('<html>Just a moment...</html>', { status: 403, headers: { 'content-type': 'text/html' } })
  );
  expect((await request(app).get(`/images/aic/${IMAGE_ID}`)).status).toBe(502);
});
