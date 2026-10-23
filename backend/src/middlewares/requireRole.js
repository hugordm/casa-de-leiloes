// Autorização por papel. Uso: router.post('/lots', auth, requireRole('AUCTIONEER'), ...)
// Deve vir DEPOIS do middleware auth (precisa de req.user).
// O front também esconde botões por papel, mas é aqui que o bloqueio de verdade acontece.
const AppError = require('../errors/AppError');

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Faça login para continuar');
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'Seu perfil não tem permissão para esta ação');
    }
    next();
  };
}

module.exports = requireRole;
