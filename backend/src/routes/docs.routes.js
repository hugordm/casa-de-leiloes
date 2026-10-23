// Documentação interativa da API (Swagger UI) a partir de docs/openapi.yaml.
//   GET /docs              → interface do Swagger
//   GET /docs/openapi.json → o documento OpenAPI em JSON
const fs = require('fs');
const path = require('path');
const { Router } = require('express');
const yaml = require('js-yaml');
const swaggerUi = require('swagger-ui-express');

// Lido uma vez, na subida: se o YAML estiver inválido, a API nem inicia (erro visível no deploy).
const spec = yaml.load(fs.readFileSync(path.join(__dirname, '../../docs/openapi.yaml'), 'utf8'));

const router = Router();

router.get('/openapi.json', (req, res) => res.json(spec));
router.use(
  '/',
  swaggerUi.serve,
  swaggerUi.setup(spec, {
    customSiteTitle: 'Casa de Leilões — API',
    swaggerOptions: { persistAuthorization: true }, // mantém o token após recarregar a página
  })
);

module.exports = router;
module.exports.spec = spec;
