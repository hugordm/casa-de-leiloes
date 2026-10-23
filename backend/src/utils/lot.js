// Regras de cálculo sobre um lote, reaproveitadas por listagem, lances e liquidação.

// Status EXIBIDO do lote — calculado na hora, nunca gravado no banco.
//   CANCELLED            → 'cancelled'
//   agora <  startsAt    → 'scheduled' (agendado)
//   startsAt <= agora < endsAt → 'live' (ao vivo)
//   agora >= endsAt      → 'ended' (encerrado; inclui SETTLED)
function getDisplayStatus(lot, now = new Date()) {
  if (lot.status === 'CANCELLED') return 'cancelled';
  if (now < lot.startsAt) return 'scheduled';
  if (now < lot.endsAt) return 'live';
  return 'ended';
}

// Menor lance aceito agora:
//   sem lances → o lance inicial;  com lances → lance atual + incremento mínimo.
function getMinNextBidCents(lot) {
  if (lot.bidCount === 0 || lot.currentBidCents == null) return lot.startingBidCents;
  return lot.currentBidCents + lot.minIncrementCents;
}

module.exports = { getDisplayStatus, getMinNextBidCents };
