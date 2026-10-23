const { Router } = require('express');
const catalogService = require('../services/catalog.service');
const auth = require('../middlewares/auth');
const requireRole = require('../middlewares/requireRole');

const router = Router();

// GET /catalog/search?q=monet  (AUCTIONEER) → { results: [obra, ...] }
router.get('/search', auth, requireRole('AUCTIONEER'), async (req, res) => {
  const results = await catalogService.search(req.query.q);
  res.json({ results });
});

module.exports = router;
