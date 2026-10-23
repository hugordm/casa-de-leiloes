// Middleware de autenticação: exige "Authorization: Bearer <token>".
// Se o token for válido, coloca o usuário em req.user para as próximas etapas.
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const env = require('../config/env');
const AppError = require('../errors/AppError');

async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Faça login para continuar');
  }

  let payload;
  try {
    // algorithms fixo: impede aceitar tokens assinados com outro algoritmo.
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    // Assinatura inválida, token adulterado ou expirado.
    throw new AppError(401, 'INVALID_TOKEN', 'Sessão inválida ou expirada. Faça login novamente');
  }

  // Busca no banco para garantir que o usuário ainda existe
  // e para usar o papel atual (não só o que está gravado no token).
  const user = await prisma.user.findUnique({
    where: { id: Number(payload.sub) },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) {
    throw new AppError(401, 'INVALID_TOKEN', 'Sessão inválida ou expirada. Faça login novamente');
  }

  req.user = user;
  next();
}

module.exports = auth;
