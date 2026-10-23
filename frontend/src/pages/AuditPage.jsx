// "/auditoria/:id" — verificação pública da corrente de lances.
// Mostra o selo (Íntegro / Adulterado no lance #N) e a corrente como blocos ligados:
// o "prevHash" de cada bloco precisa ser igual ao "hash" do bloco anterior.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { publicApi } from '../api/endpoints';
import { Icon } from '../components/Icon';
import { ErrorState, Loading } from '../components/PageState';
import { formatBRL, formatDateTimeSeconds, shortHash } from '../utils/format';
import { lotNumber, STATUS_LABEL } from '../utils/lot';

export function AuditPage() {
  const { id } = useParams();
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setAudit(null);
    setError(null);
    publicApi.audit(id).then(setAudit).catch((err) => setError(err.message));
  }, [id]);

  if (error) return <div className="container"><ErrorState message={error} /></div>;
  if (!audit) return <Loading label="Recalculando a corrente de hashes…" />;

  const { lot, intact, brokenAtSeq, message, bids } = audit;

  return (
    <div className="container audit">
      <Link to={`/lotes/${lot.id}`} className="back-link">
        <Icon name="arrowLeft" size={16} /> Voltar ao lote
      </Link>

      <header className="audit__header">
        <p className="eyebrow">Auditoria pública · {lotNumber(lot.id)}</p>
        <h1>{lot.title}</h1>
        <p className="muted">
          {lot.artist} · {STATUS_LABEL[lot.displayStatus]} · {lot.bidCount} {lot.bidCount === 1 ? 'lance' : 'lances'}
        </p>
      </header>

      <div className={`seal ${intact ? 'seal--ok' : 'seal--broken'}`} role="status">
        <Icon name={intact ? 'shieldCheck' : 'shieldAlert'} size={44} />
        <div>
          <p className="seal__title">
            {intact ? 'Íntegro' : brokenAtSeq ? `Adulterado no lance #${brokenAtSeq}` : 'Adulterado'}
          </p>
          <p className="seal__message">{message}</p>
        </div>
      </div>

      <section className="card audit__how">
        <h2>Como esta verificação funciona</h2>
        <ol>
          <li>
            Cada lance guarda um <strong>hash</strong>: uma “impressão digital” calculada com HMAC-SHA256 a partir dos
            dados do lance <em>e do hash do lance anterior</em>.
          </li>
          <li>
            Agora mesmo, o servidor recalculou todos os hashes. Se alguém alterasse um valor, removesse ou inserisse um
            lance direto no banco, a impressão digital não bateria e a corrente “quebraria” naquele ponto.
          </li>
          <li>
            O cálculo usa uma chave secreta que fica só no servidor (nunca no banco). Por isso quem mexe nos dados não
            consegue recalcular hashes válidos para disfarçar a alteração.
          </li>
        </ol>
      </section>

      <section aria-labelledby="chain-title">
        <h2 id="chain-title" className="audit__chain-title">Corrente de lances</h2>
        <ol className="chain">
          <li className="chain__block chain__block--genesis">
            <div className="chain__head">
              <span className="chain__seq">Início</span>
              <span className="chain__alias">Bloco gênese</span>
            </div>
            <dl className="chain__hashes">
              <div>
                <dt>hash</dt>
                <dd><code>GENESIS:{lot.id}</code></dd>
              </div>
            </dl>
          </li>

          {bids.map((bid) => {
            const isBreak = !intact && bid.seq === brokenAtSeq;
            return (
              <li
                key={bid.seq}
                className={`chain__block ${bid.valid ? 'chain__block--ok' : 'chain__block--broken'} ${isBreak ? 'chain__block--break' : ''}`}
              >
                <div className="chain__link" aria-hidden="true">
                  <Icon name="arrowDown" size={16} />
                </div>
                <div className="chain__head">
                  <span className="chain__seq">Lance #{bid.seq}</span>
                  <span className="chain__alias">{bid.bidderAlias}</span>
                  <span className="chain__amount">{formatBRL(bid.amountCents)}</span>
                  <span className="chain__status">
                    <Icon name={bid.valid ? 'check' : 'close'} size={16} />
                    {bid.valid ? 'confere' : isBreak ? 'quebra aqui' : 'não confiável'}
                  </span>
                </div>
                <p className="chain__time">{formatDateTimeSeconds(bid.createdAt)}</p>
                <dl className="chain__hashes">
                  <div>
                    <dt>aponta para</dt>
                    <dd><code title={bid.prevHash}>{shortHash(bid.prevHash)}</code></dd>
                  </div>
                  <div>
                    <dt>hash</dt>
                    <dd><code title={bid.hash}>{shortHash(bid.hash)}</code></dd>
                  </div>
                </dl>
              </li>
            );
          })}

          <li className={`chain__block chain__block--seal ${intact ? 'chain__block--ok' : 'chain__block--broken'}`}>
            <div className="chain__link" aria-hidden="true">
              <Icon name="arrowDown" size={16} />
            </div>
            <div className="chain__head">
              <span className="chain__seq">Selo do lote</span>
              <span className="chain__alias">{lot.bidCount} lances · último hash</span>
            </div>
            <dl className="chain__hashes">
              <div>
                <dt>último</dt>
                <dd><code title={lot.lastHash ?? ''}>{lot.lastHash ? shortHash(lot.lastHash) : `GENESIS:${lot.id}`}</code></dd>
              </div>
              <div>
                <dt>selo</dt>
                <dd><code title={lot.seal ?? ''}>{shortHash(lot.seal) ?? '—'}</code></dd>
              </div>
            </dl>
            <p className="chain__note">O selo trava o fim da corrente: detecta lances removidos ou acrescentados no final.</p>
          </li>
        </ol>
      </section>
    </div>
  );
}
