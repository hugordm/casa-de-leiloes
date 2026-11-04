const { Router } = require('express');
const authService = require('../services/auth.service');
const { auth } = require('../middlewares/auth');

const router = Router();

router.post('/register', async (req, res) => {
  const result = await authService.register(req.body);
  res.status(201).json(result);
});

router.post('/login', async (req, res) => {
  const result = await authService.login(req.body);
  res.json(result);
});

router.get('/me', auth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
