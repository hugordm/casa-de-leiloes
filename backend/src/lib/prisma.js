// Instância única: cada PrismaClient abre seu próprio pool de conexões com o Postgres.
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;
