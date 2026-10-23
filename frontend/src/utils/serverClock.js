// Relógio do SERVIDOR no navegador.
//
// O computador do usuário pode estar com a hora errada (minutos adiantado/atrasado).
// Para o cronômetro do leilão ser justo, usamos a hora do servidor:
//   offset = horaDoServidor - horaLocal  (medido a cada resposta que traz serverTime)
//   serverNow() = Date.now() + offset
//
// A resposta leva um tempo para chegar; o serverTime foi gerado mais ou menos no MEIO
// da ida e volta, então comparamos com o instante médio entre envio e recebimento.
let offsetMs = 0;

export function updateServerOffset(serverTimeIso, sentAt, receivedAt) {
  const serverTime = Date.parse(serverTimeIso);
  if (Number.isNaN(serverTime)) return;
  const localMidpoint = (sentAt + receivedAt) / 2;
  offsetMs = serverTime - localMidpoint;
}

export function serverNow() {
  return Date.now() + offsetMs;
}
