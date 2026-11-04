// Erro de negócio previsto (ex.: "Saldo insuficiente"). `code` é estável para o front e os
// testes; `message` é o texto em português exibido ao usuário.
class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

module.exports = AppError;
