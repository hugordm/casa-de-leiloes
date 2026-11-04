const AppError = require('../errors/AppError');

function notFound(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', 'Rota não encontrada'));
}

// O Express reconhece o middleware de erro por ter 4 parâmetros.
// Erro que não é AppError é bug: vai para o log e o cliente recebe um 500 genérico,
// sem detalhes internos.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'JSON inválido' } });
  }

  console.error(err);
  return res
    .status(500)
    .json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno. Tente novamente.' } });
}

module.exports = { notFound, errorHandler };
