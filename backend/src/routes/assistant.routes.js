const { Router } = require('express');
const { rateLimit } = require('express-rate-limit');
const assistantService = require('../services/assistant/assistant.service');

const router = Router();

// Público (visitantes também podem perguntar), por isso o limite por IP:
// cada mensagem custa uma chamada paga à API da Anthropic.
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10, // 10 mensagens por minuto por IP
  standardHeaders: 'draft-8', // devolve RateLimit/Retry-After para o cliente saber quando tentar
  legacyHeaders: false,
  // Mesmo formato de erro do resto da API
  handler: (req, res) =>
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Muitas mensagens em pouco tempo. Aguarde um minuto e tente de novo.' },
    }),
});

// POST /assistant/chat { message, history? } → { reply }
router.post('/chat', chatLimiter, async (req, res) => {
  res.json(await assistantService.chat(req.body || {}));
});

module.exports = router;
module.exports.chatLimiter = chatLimiter; // os testes zeram o contador entre um caso e outro
