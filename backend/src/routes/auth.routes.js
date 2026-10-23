const { Router } = require('express');
const authService = require('../services/auth.service');
const { auth } = require('../middlewares/auth');

const router = Router();

// POST /auth/register  { name, email, password, role? }  → 201 { token, user }
router.post('/register', async (req, res) => {
  const result = await authService.register(req.body);
  res.status(201).json(result);
});

// POST /auth/login  { email, password }  → 200 { token, user }
router.post('/login', async (req, res) => {
  const result = await authService.login(req.body);
  res.json(result);
});

// GET /auth/me  (precisa de token)  → 200 { user }
router.get('/me', auth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
