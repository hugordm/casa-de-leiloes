// Rótulos e helpers de lote usados em várias páginas.

export const STATUS_LABEL = {
  live: 'Ao vivo',
  scheduled: 'Agendado',
  ended: 'Encerrado',
  cancelled: 'Cancelado',
};

// Status exibido calculado com a hora do SERVIDOR (o displayStatus da API vale para
// o instante da resposta; entre um polling e outro o lote pode ter começado/terminado).
export function displayStatusAt(lot, now) {
  if (lot.status === 'CANCELLED') return 'cancelled';
  if (now < Date.parse(lot.startsAt)) return 'scheduled';
  if (now < Date.parse(lot.endsAt)) return 'live';
  return 'ended';
}

// Preço "da vitrine": lance atual ou, sem lances, o inicial.
export const currentPrice = (lot) => lot.currentBidCents ?? lot.startingBidCents;

// Número do lote no estilo catálogo: 7 → "Lote 007"
export const lotNumber = (id) => `Lote ${String(id).padStart(3, '0')}`;
