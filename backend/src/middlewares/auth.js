// Middlewares de autenticação via "Authorization: Bearer <token>".
//   auth         → login OBRIGATÓRIO (401 se faltar ou for inválido)
//   optionalAuth → login OPCIONAL: preenche req.user se houver token válido,
//                  senão segue como visitante (usado na sala do lote).
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const env = require('../config/env');
const AppError = require('../errors/AppError');

function invalidToken() {
  return new AppError(401, 'INVALID_TOKEN', 'Sessão inválida ou expirada. Faça login novamente');
}

// Lê o token do cabeçalho; retorna null se não houver.
function readToken(req) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

// Valida o token e busca o usuário no banco. Lança AppError 401 se algo falhar.
async function resolveUser(token) {
  let payload;
  try {
    // algorithms fixo: impede aceitar tokens assinados com outro algoritmo.
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    // Assinatura inválida, token adulterado ou expirado.
    throw invalidToken();
  }

  // Busca no banco para garantir que o usuário ainda existe
  // e para usar o papel atual (não só o que está gravado no token).
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
