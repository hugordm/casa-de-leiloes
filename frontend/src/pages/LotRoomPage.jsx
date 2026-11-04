// Polling de 2 s em GET /lots/:id em vez de WebSocket: mais simples e não exige conexão
// persistente com o servidor.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { lotsApi, publicApi, walletApi } from '../api/endpoints';
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
import { centsToInput, formatBRL, formatDateTime, parseBRL, shortHash } from '../utils/format';
import { displayStatusAt, lotDigits } from '../utils/lot';

const POLL_MS = 2000;
const INCREMENT_STEPS = [0, 1, 2, 5];
const ledgerTime = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

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
  const [hashes, setHashes] = useState(new Map());

  const previousLot = useRef(null);
  const requestSeq = useRef(0); // descarta respostas antigas que cheguem fora de ordem

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

  // Navegar de uma sala para outra reaproveita o componente: zera o estado do lote anterior.
  useEffect(() => {
    previousLot.current = null;
    setLot(null);
    setLoadError(null);
    setBidInput('');
  }, [id]);

  // GET /lots/:id não traz o hash dos lances; ele vem da auditoria pública, buscada só
  // quando entra um lance novo (e não a cada polling de 2 s).
  const lotId = lot?.id;
  const bidCount = lot?.bidCount;
  useEffect(() => {
    if (!lotId || !bidCount) return;
    publicApi
      .audit(lotId)
      .then((audit) => setHashes(new Map(audit.bids.map((b) => [b.seq, b.hash]))))
      .catch(() => {});
  }, [lotId, bidCount]);

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
      // Mensagem EXATA da API: o back-end é quem sabe o mínimo e o saldo de verdade.
      toast.error(err.message);
      setBidError(err.message);
      loadLot(); // o motivo pode ser um lance novo de outra pessoa: atualiza a sala
    } finally {
      setBidding(false);
    }
  }

  const canBid = status === 'live' && isBidder;
  const leading = me?.status === 'leading';
  const steps = INCREMENT_STEPS.map((n) => ({
    label: n === 0 ? 'Mínimo' : `+${n} ${n === 1 ? 'incremento' : 'incrementos'}`,
    cents: lot.minNextBidCents + lot.minIncrementCents * n,
  }));

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

        <section className="room__panel" aria-labelledby="lot-title">
          <div className="room__header">
            <p className="room__lotno">
              Lote <b>{lotDigits(lot.id)}</b>
            </p>
            <StatusBadge status={status} />
          </div>
          <h1 id="lot-title" className="room__title">
            {lot.title}
          </h1>
          <p className="room__artist">{lot.artist}</p>

          <dl className="room__figures">
            <div>
              <dt>{lot.finalPriceCents ? 'Arrematado por' : lot.bidCount ? 'Lance atual' : 'Lance inicial'}</dt>
              <dd className="room__price num">{formatBRL(lot.finalPriceCents ?? lot.currentBidCents ?? lot.startingBidCents)}</dd>
              <dd className="room__sub">
                {lot.bidCount} {lot.bidCount === 1 ? 'lance' : 'lances'}
                {(lot.winnerAlias || lot.leaderAlias) && (
                  <>
                    {' · '}
                    {lot.winnerAlias ? 'vencedor' : 'líder'} <span className="mono-alias">{lot.winnerAlias ?? lot.leaderAlias}</span>
                  </>
                )}
              </dd>
            </div>
            <div className={`room__clock ${extendedRecently ? 'room__clock--extended' : ''}`}>
              <dt>{status === 'scheduled' ? 'Abre em' : status === 'live' ? 'Fecha em' : 'Encerrado em'}</dt>
              <dd className="room__time num">
                {status === 'scheduled' && <Countdown target={lot.startsAt} />}
                {status === 'live' && <Countdown target={lot.endsAt} />}
                {(status === 'ended' || status === 'cancelled') && (
                  <span className="countdown countdown--ended">{formatDateTime(lot.endsAt)}</span>
                )}
              </dd>
              {status === 'live' && (
                <dd className="room__ext">{extendedRecently ? '+2 min: lance nos minutos finais' : 'Lance nos 2 min finais estende +2 min'}</dd>
              )}
            </div>
          </dl>

          <MeBanner lot={lot} me={me} status={status} />

          {status === 'live' && (
            <div className="room__next">
              <p className="label">Próximo lance mínimo</p>
              <p className="room__next-value num">{formatBRL(lot.minNextBidCents)}</p>
            </div>
          )}

          {canBid && (
            <form className="bid-form" onSubmit={handleBid} noValidate>
              <MoneyInput
                label="Seu lance"
                value={bidInput}
                onChange={(v) => {
                  setBidInput(v);
                  setBidError(null);
                }}
                error={bidError}
                hint={wallet ? `Disponível para lances: ${formatBRL(wallet.availableCents)}` : undefined}
                disabled={bidding || leading}
              />
              <Button type="submit" loading={bidding} disabled={leading} className="btn--block btn--lg btn--bid">
                {leading ? 'Você já está ganhando' : 'Dar lance'}
              </Button>
              {wallet && wallet.availableCents < lot.minNextBidCents && !leading && (
                <p className="field__hint">
                  Saldo disponível insuficiente para o lance mínimo. <Link to="/carteira">Depositar</Link>
                </p>
              )}
            </form>
          )}

          {status === 'live' && (
            <table className="increments">
              <caption>Tabela de incrementos · R$ {centsToInput(lot.minIncrementCents)} por lance</caption>
              <tbody>
                {steps.map((step) => (
                  <tr key={step.label}>
                    <th scope="row">{step.label}</th>
                    <td className="num">{formatBRL(step.cents)}</td>
                    {canBid && (
                      <td className="increments__use">
                        <button type="button" className="link-btn" onClick={() => setBidInput(centsToInput(step.cents))} disabled={bidding || leading}>
                          usar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {status === 'live' && !user && (
            <div className="room__cta">
              <Link to="/login" state={{ from: location.pathname }} className="btn btn--primary btn--block">
                Entrar para dar lance
              </Link>
              <p className="muted small">Só licitantes dão lances; visitantes acompanham o pregão.</p>
            </div>
          )}
          {status === 'live' && isAuctioneer && <p className="room__note">Leiloeiros acompanham o pregão, mas não dão lances.</p>}
          {status === 'ended' && lot.status === 'ACTIVE' && <p className="room__note">Leilão encerrado. Processando o resultado…</p>}
        </section>
      </div>

      <div className="room__lower">
        <section className="card" aria-labelledby="history-title">
          <div className="section-head">
            <h2 id="history-title">Registro de lances</h2>
            {me?.position && (
              <p className="position-note">
                Sua posição: <strong>{me.position}º</strong> de {me.totalBidders}
              </p>
            )}
          </div>
          {lot.recentBids.length === 0 ? (
            <p className="muted">Nenhum lance ainda. {status === 'live' ? 'Seja o primeiro!' : ''}</p>
          ) : (
            <div className="ledger-wrap">
              <table className="ledger">
                <thead>
                  <tr>
                    <th scope="col">Nº</th>
                    <th scope="col">Licitante</th>
                    <th scope="col" className="ledger__amount">Valor</th>
                    <th scope="col">Horário</th>
                    <th scope="col">Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {lot.recentBids.map((b, index) => {
                    const mine = me?.alias && b.bidderAlias === me.alias;
                    const hash = hashes.get(b.seq);
                    return (
                      <tr key={b.seq} className={`${index === 0 ? 'ledger__row--top' : ''} ${mine ? 'ledger__row--mine' : ''}`}>
                        <td>{String(b.seq).padStart(3, '0')}</td>
                        <td>
                          {b.bidderAlias.replace('Licitante ', '')}
                          {mine && <span className="you-tag">você</span>}
                        </td>
                        <td className="ledger__amount">{formatBRL(b.amountCents)}</td>
                        <td>
                          <time dateTime={b.createdAt}>{ledgerTime.format(new Date(b.createdAt))}</time>
                        </td>
                        <td className="ledger__hash" title={hash}>
                          {hash ? shortHash(hash) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted small ledger__foot">
            {lot.bidCount > lot.recentBids.length && <>Mostrando os {lot.recentBids.length} lances mais recentes de {lot.bidCount}. </>}
            <Link to={`/auditoria/${lot.id}`}>Conferir a corrente completa na auditoria</Link>
          </p>
        </section>

        <section className="card" aria-labelledby="details-title">
          <h2 id="details-title">Detalhes do lote</h2>
          <dl className="details">
            <div><dt>Leiloeiro</dt><dd>{lot.auctioneer?.name}</dd></div>
            <div><dt>Lance inicial</dt><dd className="num">{formatBRL(lot.startingBidCents)}</dd></div>
            <div><dt>Incremento mínimo</dt><dd className="num">{formatBRL(lot.minIncrementCents)}</dd></div>
            <div><dt>Início</dt><dd className="num">{formatDateTime(lot.startsAt)}</dd></div>
            <div><dt>Término</dt><dd className="num">{formatDateTime(lot.endsAt)}</dd></div>
            {lot.attributes?.date && <div><dt>Data da obra</dt><dd>{lot.attributes.date}</dd></div>}
            {lot.attributes?.medium && <div><dt>Técnica</dt><dd>{lot.attributes.medium}</dd></div>}
          </dl>
        </section>
      </div>
    </div>
  );
}

function MeBanner({ lot, me, status }) {
  if (lot.status === 'CANCELLED') {
    return (
      <div className="me-banner me-banner--neutral" role="status">
        <strong>Lote cancelado</strong>
        <p>Este leilão foi cancelado pelo leiloeiro. Valores comprometidos foram liberados.</p>
      </div>
    );
  }
  if (!me || me.status === 'none') return null;

  const position = `${me.position}º de ${me.totalBidders} ${me.totalBidders === 1 ? 'licitante' : 'licitantes'}`;

  if (me.status === 'won' || (me.status === 'leading' && status === 'ended')) {
    return (
      <div className="me-banner me-banner--won" role="status">
        <strong>Você arrematou esta obra!</strong>
        <p>
          Por {formatBRL(me.myBestBidCents)}.{' '}
          {me.receiptCode ? <Link to={`/comprovante/${me.receiptCode}`}>Ver comprovante</Link> : 'Gerando comprovante…'}
        </p>
      </div>
    );
  }
  if (me.status === 'leading') {
    return (
      <div className="me-banner me-banner--leading" role="status" aria-live="polite">
        <strong>Você está ganhando</strong>
        <p>Seu lance de {formatBRL(me.myBestBidCents)} é o maior · {position}</p>
      </div>
    );
  }
  if (me.status === 'outbid' && status === 'live') {
    return (
      <div className="me-banner me-banner--outbid" role="status" aria-live="polite">
        <strong>Você foi superado</strong>
        <p>
          Seu maior lance: {formatBRL(me.myBestBidCents)} · {position}. Cubra com pelo menos{' '}
          {formatBRL(lot.minNextBidCents)}.
        </p>
      </div>
    );
  }
  // perdeu (liquidado) ou foi superado num lote já encerrado
  return (
    <div className="me-banner me-banner--neutral" role="status">
      <strong>Leilão encerrado</strong>
      <p>Seu maior lance foi {formatBRL(me.myBestBidCents)} · você terminou em {position}.</p>
    </div>
  );
}
