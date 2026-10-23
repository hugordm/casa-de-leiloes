// "/lotes/:id" — Sala do lote.
//   - Polling de 2 s em GET /lots/:id (só com a página aberta e a aba visível).
//   - Cronômetro com a hora do servidor; acompanha o endsAt quando o anti-sniping estende.
//   - Destaque "você está ganhando" / "você foi superado" e posição do usuário.
//   - Lance com confirmação; erro de lance recusado mostra a mensagem exata da API.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { lotsApi, walletApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { usePolling } from '../hooks/usePolling';
import { useServerNow } from '../hooks/useServerNow';
import { Button } from '../components/Button';
import { Countdown } from '../components/Countdown';
import { Icon } from '../components/Icon';
import { LotImage } from '../components/LotImage';
import { MoneyInput } from '../components/MoneyInput';
import { ErrorState, Loading } from '../components/PageState';
import { StatusBadge } from '../components/StatusBadge';
import { centsToInput, formatBRL, formatDateTime, formatDateTimeSeconds, parseBRL } from '../utils/format';
import { displayStatusAt, lotNumber } from '../utils/lot';

const POLL_MS = 2000;

export function LotRoomPage() {
  const { id } = useParams();
  const location = useLocation();
  const { user, isBidder, isAuctioneer } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const now = useServerNow(1000);

  const [lot, setLot] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [bidInput, setBidInput] = useState('');
  const [bidError, setBidError] = useState(null);
  const [bidding, setBidding] = useState(false);
  const [extendedAt, setExtendedAt] = useState(null);

  const previousLot = useRef(null);
  const requestSeq = useRef(0); // descarta respostas antigas que cheguem fora de ordem

  // Compara o estado novo com o anterior para avisar mudanças importantes.
  const handleUpdate = useCallback(
    (next) => {
      const prev = previousLot.current;
      if (prev && prev.id === next.id) {
        if (Date.parse(next.endsAt) > Date.parse(prev.endsAt)) {
          setExtendedAt(Date.now());
          toast.info('Tempo estendido: houve lance nos minutos finais (anti-sniping).');
        }
        if (prev.me?.status === 'leading' && next.me?.status === 'outbid') {
          toast.error(`Você foi superado! Novo lance mínimo: ${formatBRL(next.minNextBidCents)}.`);
        }
        if (prev.me?.status !== 'won' && next.me?.status === 'won') {
          toast.success('Parabéns! Você arrematou esta obra.');
        }
        if (prev.status !== 'CANCELLED' && next.status === 'CANCELLED') {
          toast.info(
            prev.me?.status === 'leading'
              ? `Este lote foi cancelado pelo leiloeiro. Seu lance de ${formatBRL(prev.currentBidCents)} foi estornado e o valor voltou ao seu saldo disponível.`
              : 'Este lote foi cancelado pelo leiloeiro.'
          );
        }
      }
      previousLot.current = next;
      setLot(next);
    },
    [toast]
  );

  const loadLot = useCallback(
    async (signal) => {
      const seq = ++requestSeq.current;
      try {
        const data = await lotsApi.get(id, signal);
        if (seq === requestSeq.current) handleUpdate(data.lot);
        setLoadError(null);
      } catch (err) {
        if (err.name === 'AbortError') return;
        // 404 é definitivo; erro de rede mantém o último estado e tenta no próximo ciclo.
        if (err.status === 404 || !previousLot.current) setLoadError(err);
      }
    },
    [id, handleUpdate]
  );

  const loadWallet = useCallback(async () => {
    try {
      setWallet(await walletApi.get());
    } catch {
      // carteira é complementar: sem ela a sala continua funcionando
    }
  }, []);

  // Trocou de lote (navegação entre salas): zera o estado.
  useEffect(() => {
    previousLot.current = null;
    setLot(null);
    setLoadError(null);
    setBidInput('');
  }, [id]);

  // Polling só enquanto o lote pode mudar. Liquidado/cancelado → nada mais muda.
  const finished = lot && (lot.status === 'SETTLED' || lot.status === 'CANCELLED');
  const notFound = loadError?.status === 404;
  usePolling(loadLot, POLL_MS, !finished && !notFound);

  // Saldo disponível do licitante: ao abrir e quando a situação dele muda (ex.: superado libera saldo).
  const myStatus = lot?.me?.status;
  useEffect(() => {
    if (isBidder) loadWallet();
  }, [isBidder, loadWallet, myStatus]);

  // Mantém o campo do lance sempre >= mínimo atual (pré-preenche e corrige quando alguém dá lance).
  const minNext = lot?.minNextBidCents;
  useEffect(() => {
    if (!minNext) return;
    setBidInput((current) => {
      const cents = parseBRL(current);
      return cents !== null && cents >= minNext ? current : centsToInput(minNext);
    });
  }, [minNext]);

  if (notFound) {
    return (
      <div className="container">
        <ErrorState message="Lote não encontrado." action={<Link to="/" className="btn btn--ghost">Voltar à vitrine</Link>} />
      </div>
    );
  }
  if (loadError && !lot) return <div className="container"><ErrorState message={loadError.message} /></div>;
  if (!lot) return <Loading label="Abrindo a sala do leilão…" />;

  const status = displayStatusAt(lot, now);
  const me = lot.me;
  const extendedRecently = extendedAt && Date.now() - extendedAt < 10000;

  async function handleBid(e) {
    e.preventDefault();
    setBidError(null);
    const amountCents = parseBRL(bidInput);
    if (amountCents === null || amountCents <= 0) {
      setBidError('Digite um valor válido, por exemplo 1.250,00');
      return;
    }
    const ok = await confirm({
      title: 'Confirmar lance',
      message: (
        <>
          <p>
            Você vai ofertar <strong>{formatBRL(amountCents)}</strong> por <em>{lot.title}</em>.
          </p>
          <p>
            Enquanto for o maior lance, esse valor fica comprometido no seu saldo. Lances não podem ser desfeitos.
          </p>
        </>
      ),
      confirmLabel: `Dar lance de ${formatBRL(amountCents)}`,
    });
    if (!ok) return;

    setBidding(true);
    try {
      const result = await lotsApi.bid(lot.id, amountCents);
      toast.success(`Lance de ${formatBRL(amountCents)} registrado. Você está ganhando!`);
      if (result.extended) {
        toast.info('Seu lance foi nos minutos finais: o leilão ganhou +2 minutos.');
        setExtendedAt(Date.now());
      }
      // Já avisamos do próprio lance (e da extensão): o próximo polling não deve repetir os avisos.
      previousLot.current = { ...result.lot, me: { status: 'leading' } };
      await Promise.all([loadLot(), loadWallet()]);
    } catch (err) {
      // Mensagem EXATA da API (ex.: "Lance abaixo do mínimo (mínimo: R$ 1.250,00)")
      toast.error(err.message);
      setBidError(err.message);
      loadLot(); // o motivo pode ser um lance novo de outra pessoa: atualiza a sala
    } finally {
      setBidding(false);
    }
  }

  const quickBids = [
    { label: 'Mínimo', cents: lot.minNextBidCents },
    { label: `+${formatBRL(lot.minIncrementCents)}`, cents: lot.minNextBidCents + lot.minIncrementCents },
    { label: `+${formatBRL(lot.minIncrementCents * 5)}`, cents: lot.minNextBidCents + lot.minIncrementCents * 5 },
  ];

  return (
    <div className="container room">
      <Link to="/" className="back-link">
        <Icon name="arrowLeft" size={16} /> Vitrine
      </Link>

      <div className="room__grid">
        <figure className="room__media">
          <LotImage src={lot.imageUrl} alt={lot.title} eager />
          <figcaption>
            {lot.attributes?.medium && <span>{lot.attributes.medium}</span>}
            {lot.attributes?.date && <span>{lot.attributes.date}</span>}
          </figcaption>
        </figure>

        <section className="room__panel card" aria-labelledby="lot-title">
          <div className="room__header">
            <p className="eyebrow">{lotNumber(lot.id)}</p>
            <StatusBadge status={status} />
          </div>
          <h1 id="lot-title" className="room__title">
            {lot.title}
          </h1>
          <p className="room__artist">{lot.artist}</p>

          <MeBanner lot={lot} me={me} status={status} />

          <dl className="room__stats">
            <div>
              <dt>{lot.finalPriceCents ? 'Arrematado por' : lot.bidCount ? 'Lance atual' : 'Lance inicial'}</dt>
              <dd className="room__price">{formatBRL(lot.finalPriceCents ?? lot.currentBidCents ?? lot.startingBidCents)}</dd>
            </div>
            <div>
              <dt>
                {status === 'scheduled' ? 'Começa em' : status === 'live' ? 'Termina em' : 'Encerrado em'}
              </dt>
              <dd className={`room__timer ${extendedRecently ? 'room__timer--extended' : ''}`}>
                {status === 'scheduled' && <Countdown target={lot.startsAt} />}
                {status === 'live' && <Countdown target={lot.endsAt} />}
                {(status === 'ended' || status === 'cancelled') && (
                  <span className="countdown countdown--ended">{formatDateTime(lot.endsAt)}</span>
                )}
                {extendedRecently && status === 'live' && <span className="extended-tag">+2 min</span>}
              </dd>
            </div>
            <div>
              <dt>Lances</dt>
              <dd>{lot.bidCount}</dd>
            </div>
            <div>
              <dt>{lot.winnerAlias ? 'Vencedor' : 'Líder'}</dt>
              <dd className="mono-alias">{lot.winnerAlias ?? lot.leaderAlias ?? '—'}</dd>
            </div>
          </dl>

          {status === 'live' && isBidder && (
            <form className="bid-form" onSubmit={handleBid} noValidate>
              <MoneyInput
                label="Seu lance"
                value={bidInput}
                onChange={(v) => {
                  setBidInput(v);
                  setBidError(null);
                }}
                error={bidError}
                hint={`Mínimo: ${formatBRL(lot.minNextBidCents)}${wallet ? ` · Disponível: ${formatBRL(wallet.availableCents)}` : ''}`}
                disabled={bidding || me?.status === 'leading'}
              />
              <div className="quick-bids" aria-label="Valores rápidos">
                {quickBids.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    className="chip"
                    onClick={() => setBidInput(centsToInput(q.cents))}
                    disabled={bidding || me?.status === 'leading'}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
              <Button type="submit" loading={bidding} disabled={me?.status === 'leading'} className="btn--block btn--lg">
                {me?.status === 'leading' ? 'Você já está ganhando' : 'Dar lance'}
              </Button>
              {wallet && wallet.availableCents < lot.minNextBidCents && me?.status !== 'leading' && (
                <p className="field__hint">
                  Saldo disponível insuficiente para o lance mínimo. <Link to="/carteira">Depositar</Link>
                </p>
              )}
            </form>
          )}
          {status === 'live' && !user && (
            <div className="room__cta">
              <p>Entre como licitante para dar lances.</p>
              <Link to="/login" state={{ from: location.pathname }} className="btn btn--primary btn--block">
                Entrar para dar lance
              </Link>
            </div>
          )}
          {status === 'live' && isAuctioneer && (
            <p className="room__note">
              <Icon name="info" size={16} /> Leiloeiros acompanham o pregão, mas não dão lances.
            </p>
          )}
          {status === 'ended' && lot.status === 'ACTIVE' && (
            <p className="room__note">
              <Icon name="clock" size={16} /> Leilão encerrado. Processando o resultado…
            </p>
          )}

          <Link to={`/auditoria/${lot.id}`} className="audit-link">
            <Icon name="shieldCheck" size={18} /> Auditar os lances deste lote
          </Link>
        </section>
      </div>

      <div className="room__lower">
        <section className="card" aria-labelledby="history-title">
          <div className="section-head">
            <h2 id="history-title">Histórico de lances</h2>
            {me?.position && (
              <p className="position-pill">
                Sua posição: <strong>{me.position}º</strong> de {me.totalBidders}
              </p>
            )}
          </div>
          {lot.recentBids.length === 0 ? (
            <p className="muted">Nenhum lance ainda. {status === 'live' ? 'Seja o primeiro!' : ''}</p>
          ) : (
            <ol className="bid-history">
              {lot.recentBids.map((b, index) => {
                const mine = me?.alias && b.bidderAlias === me.alias;
                return (
                  <li key={b.seq} className={`bid-row ${index === 0 ? 'bid-row--top' : ''} ${mine ? 'bid-row--mine' : ''}`}>
                    <span className="bid-row__seq">#{b.seq}</span>
                    <span className="bid-row__alias">
                      {b.bidderAlias}
                      {mine && <span className="you-tag">você</span>}
                    </span>
                    <span className="bid-row__amount">{formatBRL(b.amountCents)}</span>
                    <time className="bid-row__time" dateTime={b.createdAt}>
                      {formatDateTimeSeconds(b.createdAt)}
                    </time>
                  </li>
                );
              })}
            </ol>
          )}
          {lot.bidCount > lot.recentBids.length && (
            <p className="muted small">
              Mostrando os {lot.recentBids.length} lances mais recentes de {lot.bidCount}.{' '}
              <Link to={`/auditoria/${lot.id}`}>Ver todos na auditoria</Link>
            </p>
          )}
        </section>

        <section className="card" aria-labelledby="details-title">
          <h2 id="details-title">Detalhes do lote</h2>
          <dl className="details">
            <div><dt>Leiloeiro</dt><dd>{lot.auctioneer?.name}</dd></div>
            <div><dt>Lance inicial</dt><dd>{formatBRL(lot.startingBidCents)}</dd></div>
            <div><dt>Incremento mínimo</dt><dd>{formatBRL(lot.minIncrementCents)}</dd></div>
            <div><dt>Início</dt><dd>{formatDateTime(lot.startsAt)}</dd></div>
            <div><dt>Término</dt><dd>{formatDateTime(lot.endsAt)}</dd></div>
            {lot.attributes?.date && <div><dt>Data da obra</dt><dd>{lot.attributes.date}</dd></div>}
            {lot.attributes?.medium && <div><dt>Técnica</dt><dd>{lot.attributes.medium}</dd></div>}
          </dl>
          <p className="muted small">
            Anti-sniping: lances nos 2 minutos finais estendem o leilão em +2 minutos.
          </p>
        </section>
      </div>
    </div>
  );
}

// Faixa de destaque com a situação do usuário logado neste lote.
function MeBanner({ lot, me, status }) {
  if (lot.status === 'CANCELLED') {
    return (
      <div className="me-banner me-banner--neutral" role="status">
        <Icon name="info" />
        <div>
          <strong>Lote cancelado</strong>
          <p>Este leilão foi cancelado pelo leiloeiro. Valores comprometidos foram liberados.</p>
        </div>
      </div>
    );
  }
  if (!me || me.status === 'none') return null;

  const position = `${me.position}º de ${me.totalBidders} ${me.totalBidders === 1 ? 'licitante' : 'licitantes'}`;

  if (me.status === 'won' || (me.status === 'leading' && status === 'ended')) {
    return (
      <div className="me-banner me-banner--won" role="status">
        <Icon name="trophy" />
        <div>
          <strong>Você arrematou esta obra!</strong>
          <p>
            Por {formatBRL(me.myBestBidCents)}.{' '}
            {me.receiptCode ? <Link to={`/comprovante/${me.receiptCode}`}>Ver comprovante</Link> : 'Gerando comprovante…'}
          </p>
        </div>
      </div>
    );
  }
  if (me.status === 'leading') {
    return (
      <div className="me-banner me-banner--leading" role="status" aria-live="polite">
        <Icon name="check" />
        <div>
          <strong>Você está ganhando</strong>
          <p>Seu lance de {formatBRL(me.myBestBidCents)} é o maior · {position}</p>
        </div>
      </div>
    );
  }
  if (me.status === 'outbid' && status === 'live') {
    return (
      <div className="me-banner me-banner--outbid" role="status" aria-live="polite">
        <Icon name="alert" />
        <div>
          <strong>Você foi superado</strong>
          <p>
            Seu maior lance: {formatBRL(me.myBestBidCents)} · {position}. Cubra com pelo menos{' '}
            {formatBRL(lot.minNextBidCents)}.
          </p>
        </div>
      </div>
    );
  }
  // perdeu (liquidado) ou foi superado num lote já encerrado
  return (
    <div className="me-banner me-banner--neutral" role="status">
      <Icon name="info" />
      <div>
        <strong>Leilão encerrado</strong>
        <p>Seu maior lance foi {formatBRL(me.myBestBidCents)} · você terminou em {position}.</p>
      </div>
    </div>
  );
}
