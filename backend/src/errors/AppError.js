// Erro de regra de negócio, previsto pela aplicação (ex.: "Saldo insuficiente").
// Quem lança informa o status HTTP, um código estável (útil para o front e testes)
// e a mensagem em português que será exibida ao usuário.
class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

module.exports = AppError;
