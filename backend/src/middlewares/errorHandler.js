const AppError = require('../errors/AppError');

// Rota inexistente → 404 no mesmo formato dos demais erros.
function notFound(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', 'Rota não encontrada'));
}

// Middleware central de erros (o Express o reconhece por ter 4 parâmetros).
// - AppError: erro de negócio esperado → devolve status e mensagem dele.
// - Qualquer outro: bug/inesperado → loga e devolve 500 genérico,
//   sem vazar detalhes internos para o cliente.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
  }

  // JSON malformado no corpo da requisição
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'JSON inválido' } });
  }

  console.error(err);
  return res
    .status(500)
    .json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno. Tente novamente.' } });
}

module.exports = { notFound, errorHandler };
