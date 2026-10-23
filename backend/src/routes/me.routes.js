const { Router } = require('express');
const bidService = require('../services/bid.service');
const lotService = require('../services/lot.service');
const { auth } = require('../middlewares/auth');
const requireRole = require('../middlewares/requireRole');

const router = Router();

// GET /me/bids (BIDDER) → lotes em que dei lance, meu maior lance, se estou ganhando/venci e o comprovante
router.get('/bids', auth, requireRole('BIDDER'), async (req, res) => {
  res.json({ items: await bidService.listMyBids(req.user.id) });
});

// GET /me/lots (AUCTIONEER) → { totalReceivedCents, soldCount, lots: [{ lot, result, winnerAlias, receiptCode }] }
router.get('/lots', auth, requireRole('AUCTIONEER'), async (req, res) => {
  res.json(await lotService.listMyLots(req.user.id));
});

module.exports = router;
