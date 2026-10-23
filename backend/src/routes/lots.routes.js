const { Router } = require('express');
const lotService = require('../services/lot.service');
const auth = require('../middlewares/auth');
const requireRole = require('../middlewares/requireRole');
const AppError = require('../errors/AppError');
const { parseId } = require('../utils/validation');

const router = Router();

// Converte :id da URL; id inválido ("abc", "-1") é tratado como lote inexistente.
function lotIdFrom(req) {
  const id = parseId(req.params.id);
  if (!id) throw new AppError(404, 'LOT_NOT_FOUND', 'Lote não encontrado');
  return id;
}

// GET /lots?status=live|scheduled|ended&search=&minPrice=&maxPrice=  (público)
router.get('/', async (req, res) => {
  const lots = await lotService.listLots(req.query);
  res.json({ lots });
});

// GET /lots/:id  (público)
router.get('/:id', async (req, res) => {
  const lot = await lotService.getLot(lotIdFrom(req));
  res.json({ lot });
});

// POST /lots  (AUCTIONEER)  { externalId, startingBidCents, minIncrementCents, startsAt?, endsAt }
router.post('/', auth, requireRole('AUCTIONEER'), async (req, res) => {
  const lot = await lotService.createLot(req.user.id, req.body);
  res.status(201).json({ lot });
});

// POST /lots/:id/cancel  (AUCTIONEER dono do lote — o "dono" é checado no service)
router.post('/:id/cancel', auth, requireRole('AUCTIONEER'), async (req, res) => {
  const lot = await lotService.cancelLot(lotIdFrom(req), req.user.id);
  res.json({ lot });
});

module.exports = router;
