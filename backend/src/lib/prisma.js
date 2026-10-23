// Uma única instância do Prisma para toda a aplicação
// (cada instância abre seu próprio pool de conexões com o Postgres).
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;
