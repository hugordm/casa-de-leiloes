import { Link } from 'react-router';
import { LotImage } from './LotImage';
import { StatusBadge } from './StatusBadge';
import { Countdown } from './Countdown';
import { formatBRL, formatDateTime } from '../utils/format';
import { currentPrice, displayStatusAt, lotDigits } from '../utils/lot';

// Uma linha de catálogo impresso: número do lote, obra, preço e prazo alinhados em colunas.
export function LotRow({ lot, now }) {
  const status = displayStatusAt(lot, now);
  const priceLabel =
    status === 'ended' ? (lot.finalPriceCents ? 'Arrematado por' : 'Sem lances') : lot.bidCount ? 'Lance atual' : 'Lance inicial';

  return (
    <Link to={`/lotes/${lot.id}`} className="lot-row">
      <p className="lot-row__no">
        <span>Lote</span> <b>{lotDigits(lot.id)}</b>
      </p>
      <div className="lot-row__thumb">
        <LotImage src={lot.imageUrl} alt={lot.title} />
      </div>
      <div className="lot-row__info">
        <StatusBadge status={status} />
        <h3 className="lot-row__title">{lot.title}</h3>
        <p className="lot-row__artist">{lot.artist}</p>
        <p className="lot-row__bids">
          {lot.bidCount} {lot.bidCount === 1 ? 'lance' : 'lances'}
        </p>
      </div>
      <div className="lot-row__price">
        <p className="label">{priceLabel}</p>
        <p className="lot-row__amount num">
          {status === 'ended' && !lot.finalPriceCents ? '—' : formatBRL(lot.finalPriceCents ?? currentPrice(lot))}
        </p>
      </div>
      <div className="lot-row__time">
        {status === 'live' && (
          <>
            <p className="label">Fecha em</p>
            <Countdown target={lot.endsAt} compact />
          </>
        )}
        {status === 'scheduled' && (
          <>
            <p className="label">Abre em</p>
            <span className="num">{formatDateTime(lot.startsAt)}</span>
          </>
        )}
        {status === 'ended' && (
          <>
            <p className="label">Encerrado em</p>
            <span className="num">{formatDateTime(lot.endsAt)}</span>
          </>
        )}
      </div>
    </Link>
  );
}
