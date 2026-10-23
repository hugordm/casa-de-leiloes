// Variáveis de ambiente usadas SÓ nos testes.
// Os testes rodam num banco separado (leiloes_test), que é apagado e recriado a cada execução.
const DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://leiloes:leiloes@localhost:5434/leiloes_test?schema=public';

// Trava de segurança: nunca rodar os testes (que apagam tudo) num banco que não seja de teste.
const dbName = new URL(DATABASE_URL).pathname.slice(1);
if (!dbName.endsWith('_test')) {
  throw new Error(`Banco de testes deve terminar em "_test" (recebido: "${dbName}")`);
}

module.exports = {
  NODE_ENV: 'test',
  DATABASE_URL,
  JWT_SECRET: 'jwt-secret-de-teste',
  AUDIT_SECRET: 'audit-secret-de-teste',
};
