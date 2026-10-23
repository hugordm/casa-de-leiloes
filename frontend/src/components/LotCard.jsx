// Cartão de lote na vitrine, no estilo de catálogo de leilão.
import { Link } from 'react-router';
import { LotImage } from './LotImage';
import { StatusBadge } from './StatusBadge';
import { Countdown } from './Countdown';
import { formatBRL, formatDateTime } from '../utils/format';
import { currentPrice, displayStatusAt, lotNumber } from '../utils/lot';

export function LotCard({ lot, now }) {
  const status = displayStatusAt(lot, now);
  const priceLabel =
    status === 'ended' ? (lot.finalPriceCents ? 'Arrematado por' : 'Sem lances') : lot.bidCount ? 'Lance atual' : 'Lance inicial';

  return (
    <Link to={`/lotes/${lot.id}`} className="lot-card">
      <div className="lot-card__media">
        <LotImage src={lot.imageUrl} alt={lot.title} />
        <div className="lot-card__badge">
          <StatusBadge status={status} />
        </div>
      </div>
      <div className="lot-card__body">
        <p className="eyebrow">{lotNumber(lot.id)}</p>
        <h3 className="lot-card__title">{lot.title}</h3>
        <p className="lot-card__artist">{lot.artist}</p>
        <div className="lot-card__footer">
          <div>
            <p className="label">{priceLabel}</p>
            <p className="lot-card__price">
              {status === 'ended' && !lot.finalPriceCents ? '—' : formatBRL(lot.finalPriceCents ?? currentPrice(lot))}
            </p>
          </div>
          <div className="lot-card__time">
            {status === 'live' && (
              <>
                <p className="label">Termina em</p>
                <Countdown target={lot.endsAt} compact />
              </>
            )}
            {status === 'scheduled' && (
              <>
                <p className="label">Começa em</p>
                <span className="lot-card__date">{formatDateTime(lot.startsAt)}</span>
              </>
            )}
            {status === 'ended' && (
              <>
                <p className="label">Encerrado em</p>
                <span className="lot-card__date">{formatDateTime(lot.endsAt)}</span>
              </>
            )}
          </div>
        </div>
        <p className="lot-card__bids">
          {lot.bidCount} {lot.bidCount === 1 ? 'lance' : 'lances'}
        </p>
      </div>
    </Link>
  );
}
