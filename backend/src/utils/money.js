// Formata centavos como "R$ 1.234,56".
// Usado SÓ em mensagens de erro da API (ex.: "Lance abaixo do mínimo (mínimo: R$ 1.050,00)").
// Fora isso, a API sempre trafega centavos e quem formata é o front.
function formatBRL(cents) {
  const reais = Math.floor(cents / 100);
  const centavos = String(cents % 100).padStart(2, '0');
  const milhares = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${milhares},${centavos}`;
}

module.exports = { formatBRL };
