const { Router } = require('express');
const walletService = require('../services/wallet.service');
const { auth } = require('../middlewares/auth');
const requireRole = require('../middlewares/requireRole');

const router = Router();

router.use(auth, requireRole('BIDDER'));

router.get('/', async (req, res) => {
  res.json(await walletService.getWallet(req.user.id));
});

router.post('/deposit', async (req, res) => {
  res.status(201).json(await walletService.deposit(req.user.id, req.body?.amountCents));
});

module.exports = router;
