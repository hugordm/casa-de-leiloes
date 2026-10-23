// "/meus-arremates" (licitante) — obras arrematadas (com comprovante) e participações.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { meApi } from '../api/endpoints';
import { Icon } from '../components/Icon';
import { LotImage } from '../components/LotImage';
import { EmptyState, ErrorState, Loading } from '../components/PageState';
import { StatusBadge } from '../components/StatusBadge';
import { useServerNow } from '../hooks/useServerNow';
import { formatBRL, formatDateTime } from '../utils/format';
import { displayStatusAt } from '../utils/lot';

export function MyWinsPage() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const now = useServerNow(5000);

  useEffect(() => {
    meApi
      .bids()
      .then((data) => setItems(data.items))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="container"><ErrorState message={error} /></div>;
  if (!items) return <Loading label="Carregando seus lances…" />;

  const won = items.filter((i) => i.won);
  const active = items.filter((i) => !i.won && displayStatusAt(i.lot, now) === 'live');
  const others = items.filter((i) => !i.won && displayStatusAt(i.lot, now) !== 'live');

  return (
    <div className="container">
      <header className="page-head">
        <p className="eyebrow">Licitante</p>
        <h1>Meus arremates</h1>
      </header>

      {items.length === 0 && (
        <EmptyState title="Você ainda não participou de nenhum leilão.">
          <Link to="/" className="btn btn--primary">Explorar a vitrine</Link>
        </EmptyState>
      )}

      {won.length > 0 && (
        <section className="section">
          <h2 className="section__title">
            <Icon name="trophy" /> Arrematados
          </h2>
          <div className="win-grid">
            {won.map(({ lot, receiptCode }) => (
              <article key={lot.id} className="win-card card">
                <LotImage src={lot.imageUrl} alt={lot.title} />
                <div className="win-card__body">
                  <h3>{lot.title}</h3>
                  <p className="muted small">{lot.artist}</p>
                  <p className="win-card__price">{formatBRL(lot.finalPriceCents)}</p>
                  <p className="muted small">Encerrado em {formatDateTime(lot.endsAt)}</p>
                  <div className="win-card__actions">
                    {receiptCode && (
                      <Link to={`/comprovante/${receiptCode}`} className="btn btn--primary btn--sm">
                        Ver comprovante
                      </Link>
                    )}
                    <Link to={`/auditoria/${lot.id}`} className="btn btn--ghost btn--sm">
                      Auditoria
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {active.length > 0 && (
        <section className="section">
          <h2 className="section__title">
            <Icon name="clock" /> Em andamento
          </h2>
          <ParticipationList items={active} now={now} />
        </section>
      )}

      {others.length > 0 && (
        <section className="section">
          <h2 className="section__title">Encerrados e cancelados</h2>
          <ParticipationList items={others} now={now} />
        </section>
      )}
    </div>
  );
}

function ParticipationList({ items, now }) {
  return (
    <ul className="participation">
      {items.map(({ lot, myBestBidCents, isLeader }) => {
        const status = displayStatusAt(lot, now);
        const situation =
          status === 'cancelled'
            ? { text: 'Cancelado pelo leiloeiro', tone: 'neutral' }
            : status === 'live'
              ? isLeader
                ? { text: 'Você está ganhando', tone: 'ok' }
                : { text: 'Você foi superado', tone: 'danger' }
              : isLeader
                ? { text: 'Aguardando liquidação', tone: 'ok' }
                : { text: 'Não arrematado', tone: 'neutral' };
        return (
          <li key={lot.id}>
            <Link to={`/lotes/${lot.id}`} className="participation__row">
              <LotImage src={lot.imageUrl} alt="" className="participation__thumb" />
              <div className="participation__info">
                <p className="participation__title">{lot.title}</p>
                <p className="muted small">
                  Seu maior lance: {formatBRL(myBestBidCents)} · atual: {formatBRL(lot.currentBidCents)}
                </p>
              </div>
              <StatusBadge status={status} />
              <span className={`pill pill--${situation.tone}`}>{situation.text}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
