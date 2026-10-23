// Regras de autenticação: cadastro, login e "quem sou eu".
// Não conhece Express (req/res): recebe dados, devolve dados ou lança AppError.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const env = require('../config/env');
const AppError = require('../errors/AppError');

const ROLES = ['AUCTIONEER', 'BIDDER'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 10;

// O que o cliente pode ver de um usuário. NUNCA inclui passwordHash.
function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

// Token guarda só o id (sub) e o papel. O middleware auth busca o resto no banco.
function signToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

function validationError(message) {
  return new AppError(400, 'VALIDATION_ERROR', message);
}

async function register({ name, email, password, role = 'BIDDER' } = {}) {
  name = typeof name === 'string' ? name.trim() : '';
  email = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (name.length < 2) throw validationError('Informe seu nome');
  if (!EMAIL_REGEX.test(email)) throw validationError('E-mail inválido');
  // bcrypt só considera os primeiros 72 bytes da senha, por isso o limite.
  if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
    throw validationError('A senha deve ter entre 6 e 72 caracteres');
  }
  if (!ROLES.includes(role)) throw validationError('Perfil inválido');

  const emailInUse = new AppError(409, 'EMAIL_IN_USE', 'Este e-mail já está cadastrado');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw emailInUse;

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  let user;
  try {
    user = await prisma.user.create({ data: { name, email, passwordHash, role } });
  } catch (err) {
    // P2002 = violação de @unique: dois cadastros simultâneos com o mesmo e-mail.
    if (err.code === 'P2002') throw emailInUse;
    throw err;
  }

  return { token: signToken(user), user: toPublicUser(user) };
}

async function login({ email, password } = {}) {
  email = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!email || typeof password !== 'string' || !password) {
    throw validationError('Informe e-mail e senha');
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const passwordOk = user ? await bcrypt.compare(password, user.passwordHash) : false;

  // Mesma mensagem para "e-mail não existe" e "senha errada":
  // assim não revelamos quais e-mails estão cadastrados.
  if (!passwordOk) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos');
  }

  return { token: signToken(user), user: toPublicUser(user) };
}

module.exports = { register, login, signToken };
