// Documentação OpenAPI: o arquivo é válido e cobre TODAS as rotas reais da API.
const fs = require('fs');
const path = require('path');
const SwaggerParser = require('@apidevtools/swagger-parser');
const { prisma, request, app } = require('./helpers');
const { spec } = require('../src/routes/docs.routes');

afterAll(() => prisma.$disconnect());

// Descobre as rotas reais lendo como o app.js monta os routers
// (assim, um router novo sem documentação faz este teste falhar).
function realRoutes() {
  const appSource = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
  const modules = {};
  for (const [, name, file] of appSource.matchAll(/const (\w+) = require\('\.\/routes\/([\w.]+)'\)/g)) {
    modules[name] = file;
  }
  const mounts = [];
  for (const [, prefix, name] of appSource.matchAll(/app\.use\((?:'([^']*)',\s*)?(\w+Routes)\)/g)) {
    mounts.push({ prefix: prefix || '', name });
  }

  const routes = [];
  for (const { prefix, name } of mounts) {
    if (name === 'docsRoutes') continue; // a própria documentação
    const router = require(`../src/routes/${modules[name]}`);
    for (const layer of router.stack) {
      if (!layer.route) continue; // middlewares do router (ex.: router.use(auth))
      const fullPath = (prefix + (layer.route.path === '/' ? '' : layer.route.path)) || '/';
      const openApiPath = fullPath.replace(/:(\w+)/g, '{$1}');
      for (const method of Object.keys(layer.route.methods)) routes.push(`${method.toUpperCase()} ${openApiPath}`);
    }
  }
  return routes;
}

function documentedRoutes() {
  return Object.entries(spec.paths).flatMap(([p, ops]) =>
    Object.keys(ops).map((method) => `${method.toUpperCase()} ${p}`)
  );
}

test('openapi.yaml é um documento OpenAPI válido (refs resolvem)', async () => {
  await expect(SwaggerParser.validate(structuredClone(spec))).resolves.toBeTruthy();
});

test('toda rota real da API está documentada, e nada documentado deixou de existir', () => {
  const real = realRoutes().sort();
  const documented = documentedRoutes().sort();
  expect(real.length).toBeGreaterThan(15);
  expect(documented).toEqual(real);
});

test('rotas protegidas declaram autenticação Bearer e erros usam o formato padrão', () => {
  expect(spec.components.securitySchemes.bearerAuth).toMatchObject({ type: 'http', scheme: 'bearer' });
  expect(spec.paths['/lots/{id}/bids'].post.security).toEqual([{ bearerAuth: [] }]);
  expect(spec.components.schemas.Error.properties.error.required).toEqual(['code', 'message']);
});

test('exemplos de erro de lance usam as mensagens reais da API', () => {
  const bids = spec.paths['/lots/{id}/bids'].post.responses;
  const messages = JSON.stringify(bids);
  for (const msg of [
    'Lance abaixo do mínimo (mínimo: R$ 1.050,00)',
    'Saldo insuficiente',
    'Você já está ganhando',
    'Lote ainda não iniciado',
    'Lote encerrado',
    'Leiloeiros não podem dar lances',
  ]) {
    expect(messages).toContain(msg);
  }
});

test('GET /docs serve o Swagger UI e /docs/openapi.json o documento', async () => {
  const ui = await request(app).get('/docs/');
  expect(ui.status).toBe(200);
  expect(ui.text).toContain('swagger-ui');

  const json = await request(app).get('/docs/openapi.json');
  expect(json.status).toBe(200);
  expect(json.body.info.title).toBe('Casa de Leilões — API');
});
