// Cadastro e login: regra de senha (mínimo 8, máximo 72 caracteres).
const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/lib/prisma');
const { resetDb } = require('./helpers');

const register = (password, email = 'carla@exemplo.com') =>
  request(app).post('/auth/register').send({ name: 'Carla Souza', email, password });

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('POST /auth/register — senha', () => {
  test.each([
    ['7 caracteres', 'a'.repeat(7)],
    ['73 caracteres', 'a'.repeat(73)],
    ['vazia', ''],
    ['ausente', undefined],
  ])('recusa senha %s → 400, sem criar o usuário', async (_, password) => {
    const res = await register(password);

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'A senha deve ter entre 8 e 72 caracteres',
    });
    expect(await prisma.user.count()).toBe(0);
  });

  test.each([
    ['8 caracteres (mínimo)', 'a'.repeat(8)],
    ['72 caracteres (máximo)', 'a'.repeat(72)],
  ])('aceita senha de %s', async (_, password) => {
    const res = await register(password);

    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  test('a senha é guardada só como hash bcrypt', async () => {
    await register('segredo123');
    const user = await prisma.user.findUnique({ where: { email: 'carla@exemplo.com' } });

    expect(user.passwordHash).not.toBe('segredo123');
    expect(await bcrypt.compare('segredo123', user.passwordHash)).toBe(true);
  });
});

describe('POST /auth/login', () => {
  test('entra com a senha cadastrada', async () => {
    await register('segredo123');
    const res = await request(app).post('/auth/login').send({ email: 'carla@exemplo.com', password: 'segredo123' });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('carla@exemplo.com');
  });

  test('senha errada → 401 com mensagem genérica', async () => {
    await register('segredo123');
    const res = await request(app).post('/auth/login').send({ email: 'carla@exemplo.com', password: 'errada123' });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('E-mail ou senha inválidos');
  });

  test('conta antiga com senha de 6 caracteres (regra anterior) continua entrando', async () => {
    await prisma.user.create({
      data: {
        name: 'Conta Antiga',
        email: 'antiga@exemplo.com',
        passwordHash: await bcrypt.hash('abc123', 4),
        role: 'BIDDER',
      },
    });
    const res = await request(app).post('/auth/login').send({ email: 'antiga@exemplo.com', password: 'abc123' });

    expect(res.status).toBe(200);
  });
});
