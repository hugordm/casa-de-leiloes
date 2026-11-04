
// Calculado na hora, nunca gravado: assim não existe job para "virar" o status
// e ele nunca fica desatualizado.
function getDisplayStatus(lot, now = new Date()) {
  if (lot.status === 'CANCELLED') return 'cancelled';
  if (now < lot.startsAt) return 'scheduled';
  if (now < lot.endsAt) return 'live';
  return 'ended';
}

function getMinNextBidCents(lot) {
  if (lot.bidCount === 0 || lot.currentBidCents == null) return lot.startingBidCents;
  return lot.currentBidCents + lot.minIncrementCents;
}

module.exports = { getDisplayStatus, getMinNextBidCents };
