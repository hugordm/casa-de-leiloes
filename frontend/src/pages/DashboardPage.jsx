// "/painel" (leiloeiro) — resultados dos lotes, total recebido e cancelamento.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { lotsApi, meApi } from '../api/endpoints';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { LotImage } from '../components/LotImage';
import { EmptyState, ErrorState, Loading } from '../components/PageState';
import { formatBRL, formatDateTime } from '../utils/format';
import { lotNumber } from '../utils/lot';

const RESULT = {
  sold: { label: 'Vendido', tone: 'ok' },
  unsold: { label: 'Sem lances', tone: 'neutral' },
  live: { label: 'Ao vivo', tone: 'live' },
  scheduled: { label: 'Agendado', tone: 'info' },
  awaiting_settlement: { label: 'Liquidando…', tone: 'info' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
};

export function DashboardPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  const load = useCallback(() => {
    meApi.lots().then(setData).catch((err) => setError(err.message));
  }, []);
  useEffect(load, [load]);

  async function handleCancel(lot) {
    const hasBids = lot.bidCount > 0;
    const ok = await confirm({
      title: hasBids ? 'Cancelar lote com lances?' : 'Cancelar lote?',
      message: (
        <>
          <p>
            O lote <strong>{lot.title}</strong> sairá da vitrine e não poderá mais receber lances. Esta ação não pode
            ser desfeita.
          </p>
          {hasBids && (
            <p>
              Os {lot.bidCount === 1 ? 'lance será estornado' : `${lot.bidCount} lances serão estornados`}: o valor
              comprometido do licitante que lidera ({formatBRL(lot.currentBidCents)}) volta ao saldo disponível dele,
              ninguém é cobrado e os participantes são avisados por e-mail.
            </p>
          )}
        </>
      ),
      confirmLabel: 'Cancelar lote',
      cancelLabel: 'Manter lote',
      destructive: true,
    });
    if (!ok) return;

    setCancellingId(lot.id);
    try {
      await lotsApi.cancel(lot.id);
      toast.success(lot.bidCount > 0 ? 'Lote cancelado. Os lances foram estornados.' : 'Lote cancelado.');
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCancellingId(null);
    }
  }

  if (error) return <div className="container"><ErrorState message={error} /></div>;
  if (!data) return <Loading label="Carregando painel…" />;

  const liveCount = data.lots.filter((i) => i.result === 'live').length;

  return (
    <div className="container">
      <header className="page-head page-head--row">
        <div>
          <p className="eyebrow">Leiloeiro</p>
          <h1>Painel</h1>
        </div>
        <Link to="/painel/novo-lote" className="btn btn--primary">
          <Icon name="plus" size={16} /> Novo lote
        </Link>
      </header>

      <div className="stats">
        <div className="stat stat--ok">
          <p className="label">Total recebido</p>
          <p className="stat__value">{formatBRL(data.totalReceivedCents)}</p>
          <p className="stat__hint">Soma dos arremates já liquidados.</p>
        </div>
        <div className="stat">
          <p className="label">Lotes vendidos</p>
          <p className="stat__value">{data.soldCount}</p>
          <p className="stat__hint">de {data.lots.length} lotes criados</p>
        </div>
        <div className="stat">
          <p className="label">Ao vivo agora</p>
          <p className="stat__value">{liveCount}</p>
          <p className="stat__hint">recebendo lances</p>
        </div>
      </div>

      {data.lots.length === 0 ? (
        <EmptyState title="Você ainda não criou nenhum lote.">
          <Link to="/painel/novo-lote" className="btn btn--primary">Criar o primeiro lote</Link>
        </EmptyState>
      ) : (
        <ul className="dash-list">
          {data.lots.map(({ lot, result, winnerAlias, receiptCode }) => {
            const info = RESULT[result] ?? { label: result, tone: 'neutral' };
            // Lote agendado ou ao vivo pode ser cancelado, mesmo com lances (estorno automático).
            // Encerrado/liquidado não. Quem decide de verdade é o back-end.
            const canCancel = result === 'live' || result === 'scheduled';
            return (
              <li key={lot.id} className="dash-item card">
                <LotImage src={lot.imageUrl} alt="" className="dash-item__thumb" />
                <div className="dash-item__info">
                  <p className="eyebrow">{lotNumber(lot.id)}</p>
                  <Link to={`/lotes/${lot.id}`} className="dash-item__title">
                    {lot.title}
                  </Link>
                  <p className="muted small">
                    {formatDateTime(lot.startsAt)} → {formatDateTime(lot.endsAt)} · {lot.bidCount}{' '}
                    {lot.bidCount === 1 ? 'lance' : 'lances'}
                  </p>
                </div>
                <div className="dash-item__result">
                  <span className={`pill pill--${info.tone}`}>{info.label}</span>
                  <p className="dash-item__price">
                    {result === 'sold'
                      ? formatBRL(lot.finalPriceCents)
                      : lot.currentBidCents
                        ? `Atual: ${formatBRL(lot.currentBidCents)}`
                        : `Inicial: ${formatBRL(lot.startingBidCents)}`}
                  </p>
                  {winnerAlias && <p className="muted small mono-alias">{winnerAlias}</p>}
                </div>
                <div className="dash-item__actions">
                  {receiptCode && (
                    <Link to={`/comprovante/${receiptCode}`} className="btn btn--ghost btn--sm">
                      Comprovante
                    </Link>
                  )}
                  <Link to={`/auditoria/${lot.id}`} className="btn btn--ghost btn--sm">
                    Auditoria
                  </Link>
                  {canCancel && (
                    <Button
                      variant="danger-ghost"
                      className="btn--sm"
                      loading={cancellingId === lot.id}
                      onClick={() => handleCancel(lot)}
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
