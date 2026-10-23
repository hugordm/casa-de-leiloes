// Pequenos helpers de validação de entrada.

const MAX_INT4 = 2147483647; // maior valor da coluna INTEGER do Postgres

// Converte um id vindo da URL ("12") em inteiro positivo; retorna null se inválido.
function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= MAX_INT4 ? n : null;
}

// Inteiro em centavos dentro de [min, max]. Rejeita 10.5, "abc", null etc.
function isCents(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  return Number.isInteger(value) && value >= min && value <= max;
}

// Converte string ISO (ou Date) em Date; retorna null se inválida.
function parseDate(value) {
  if (value == null || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

module.exports = { parseId, isCents, parseDate };
