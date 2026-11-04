const { Router } = require('express');
const auditService = require('../services/audit.service');
const receiptService = require('../services/receipt.service');
const AppError = require('../errors/AppError');
const { parseId } = require('../utils/validation');

const router = Router();

router.get('/audit/:lotId', async (req, res) => {
  const lotId = parseId(req.params.lotId);
  if (!lotId) throw new AppError(404, 'LOT_NOT_FOUND', 'Lote não encontrado');
  res.json(await auditService.getAudit(lotId));
});

router.get('/receipts/:code', async (req, res) => {
  res.json({ receipt: await receiptService.getReceipt(req.params.code) });
});

module.exports = router;
