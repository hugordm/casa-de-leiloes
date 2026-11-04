// optionalAuth: usado na sala do lote, que visitantes também podem ver.
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const env = require('../config/env');
const AppError = require('../errors/AppError');

function invalidToken() {
  return new AppError(401, 'INVALID_TOKEN', 'Sessão inválida ou expirada. Faça login novamente');
}

function readToken(req) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

async function resolveUser(token) {
  let payload;
  try {
    // algorithms fixo: impede aceitar tokens assinados com outro algoritmo.
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    throw invalidToken();
  }

  // Vai ao banco em vez de confiar só no token: o usuário pode ter sido removido
  // ou ter mudado de papel depois que o token foi emitido.
  const user = await prisma.user.findUnique({
    where: { id: Number(payload.sub) },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) throw invalidToken();
  return user;
}

async function auth(req, res, next) {
  const token = readToken(req);
  if (!token) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Faça login para continuar');
  }
  req.user = await resolveUser(token);
  next();
}

async function optionalAuth(req, res, next) {
  const token = readToken(req);
  if (token) {
    try {
      req.user = await resolveUser(token);
    } catch (err) {
      // Token vencido/inválido numa rota pública: trata como visitante em vez de bloquear.
      if (!(err instanceof AppError)) throw err;
    }
  }
  next();
}

module.exports = { auth, optionalAuth };
