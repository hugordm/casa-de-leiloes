const { Router } = require('express');
const bidService = require('../services/bid.service');
const lotService = require('../services/lot.service');
const { auth } = require('../middlewares/auth');
const requireRole = require('../middlewares/requireRole');

const router = Router();

router.get('/bids', auth, requireRole('BIDDER'), async (req, res) => {
  res.json({ items: await bidService.listMyBids(req.user.id) });
});

router.get('/lots', auth, requireRole('AUCTIONEER'), async (req, res) => {
  res.json(await lotService.listMyLots(req.user.id));
});

module.exports = router;
