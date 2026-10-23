// Roda UMA vez antes de todos os testes: recria o banco de testes do zero
// aplicando as migrations (mesmo schema da aplicação).
const { execSync } = require('child_process');
const testEnv = require('./testEnv');

module.exports = async () => {
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
    env: { ...process.env, ...testEnv },
    stdio: 'ignore',
  });
};
