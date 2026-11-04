const { Router } = require('express');
const prisma = require('../lib/prisma');

const router = Router();

router.get('/', async (req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: 'ok', database: 'ok', time: new Date().toISOString() });
});

module.exports = router;
