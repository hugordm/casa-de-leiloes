const { Router } = require('express');
const bidService = require('../services/bid.service');
const { auth } = require('../middlewares/auth');
const requireRole = require('../middlewares/requireRole');

const router = Router();

// GET /me/bids (BIDDER) → lotes em que dei lance, meu maior lance e se estou ganhando
router.get('/bids', auth, requireRole('BIDDER'), async (req, res) => {
  res.json({ items: await bidService.listMyBids(req.user.id) });
});

// GET /me/lots (AUCTIONEER, com resultados e total recebido) entra na Fase 5, com a liquidação.

module.exports = router;
