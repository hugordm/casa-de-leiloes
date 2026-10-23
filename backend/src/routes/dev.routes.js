// Rotas TEMPORÁRIAS, só para testar auth + requireRole com curl enquanto
// as rotas reais por papel (POST /lots, POST /lots/:id/bids...) não existem.
// Montadas apenas fora de produção (ver app.js). Serão removidas na Fase 4.
const { Router } = require('express');
const auth = require('../middlewares/auth');
const requireRole = require('../middlewares/requireRole');

const router = Router();

router.get('/auctioneer-only', auth, requireRole('AUCTIONEER'), (req, res) => {
  res.json({ message: `Olá, leiloeiro ${req.user.name}` });
});

router.get('/bidder-only', auth, requireRole('BIDDER'), (req, res) => {
  res.json({ message: `Olá, licitante ${req.user.name}` });
});

module.exports = router;
