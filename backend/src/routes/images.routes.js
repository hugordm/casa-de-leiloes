const { Router } = require('express');
const imageService = require('../services/image.service');

const router = Router();

// GET /images/aic/:imageId (público) → a imagem JPEG da obra
router.get('/aic/:imageId', async (req, res) => {
  const { contentType, body } = await imageService.fetchAicImage(req.params.imageId);
  // A imagem de um image_id nunca muda: o navegador pode guardar por 7 dias.
  res.set('Cache-Control', 'public, max-age=604800, immutable');
  res.type(contentType).send(body);
});

module.exports = router;
