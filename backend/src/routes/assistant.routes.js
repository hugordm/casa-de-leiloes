const { Router } = require('express');
const { rateLimit } = require('express-rate-limit');
const assistantService = require('../services/assistant/assistant.service');

const router = Router();

// Público (visitantes também podem perguntar), por isso o limite por IP:
// cada mensagem custa uma chamada paga à API da Anthropic.
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Muitas mensagens em pouco tempo. Aguarde um minuto e tente de novo.' },
    }),
});

router.post('/chat', chatLimiter, async (req, res) => {
  res.json(await assistantService.chat(req.body || {}));
});

module.exports = router;
module.exports.chatLimiter = chatLimiter; // exportado para os testes zerarem o contador
