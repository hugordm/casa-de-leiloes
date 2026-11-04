// A corrente aparece como um livro de registros: a coluna "aponta para" de cada linha precisa
// ser igual ao "hash" da linha de cima, e é isso que o visitante consegue conferir a olho.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { publicApi } from '../api/endpoints';
import { Icon } from '../components/Icon';
import { ErrorState, Loading } from '../components/PageState';
import { formatBRL, shortHash } from '../utils/format';
import { lotNumber, STATUS_LABEL } from '../utils/lot';

const ledgerTime = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

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
        <p className="seal__stamp">{intact ? 'Íntegro' : brokenAtSeq ? `Adulterado no lance #${brokenAtSeq}` : 'Adulterado'}</p>
        <p className="seal__message">{message}</p>
        <p className="seal__meta">
          Verificado agora · selo <span title={lot.seal ?? ''}>{shortHash(lot.seal) ?? '—'}</span>
        </p>
      </div>

      <section className="audit__chain" aria-labelledby="chain-title">
        <h2 id="chain-title">Registro da corrente</h2>
        <div className="ledger-wrap">
          <table className="ledger ledger--audit">
            <thead>
              <tr>
                <th scope="col">Nº</th>
                <th scope="col">Licitante</th>
                <th scope="col" className="ledger__amount">Valor</th>
                <th scope="col">Horário</th>
                <th scope="col">Aponta para</th>
                <th scope="col">Hash</th>
                <th scope="col">Situação</th>
              </tr>
            </thead>
            <tbody>
              <tr className="ledger__row--genesis">
                <td>000</td>
                <td colSpan={4}>início da corrente</td>
                <td>GENESIS:{lot.id}</td>
                <td></td>
              </tr>
              {bids.map((bid) => {
                const isBreak = !intact && bid.seq === brokenAtSeq;
                return (
                  <tr
                    key={bid.seq}
                    className={`${bid.valid ? '' : 'ledger__row--invalid'} ${isBreak ? 'ledger__row--break' : ''}`}
                  >
                    <td>{String(bid.seq).padStart(3, '0')}</td>
                    <td>{bid.bidderAlias.replace('Licitante ', '')}</td>
                    <td className="ledger__amount">{formatBRL(bid.amountCents)}</td>
                    <td>
                      <time dateTime={bid.createdAt}>{ledgerTime.format(new Date(bid.createdAt))}</time>
                    </td>
                    <td className="ledger__hash" title={bid.prevHash}>{shortHash(bid.prevHash)}</td>
                    <td title={bid.hash}>{shortHash(bid.hash)}</td>
                    <td className="ledger__check">{bid.valid ? 'confere' : isBreak ? 'quebra aqui' : 'não confiável'}</td>
                  </tr>
                );
              })}
              <tr className={`ledger__row--seal ${intact ? '' : 'ledger__row--invalid'}`}>
                <td>selo</td>
                <td colSpan={3}>{lot.bidCount} lances · último hash</td>
                <td className="ledger__hash" title={lot.lastHash ?? ''}>
                  {lot.lastHash ? shortHash(lot.lastHash) : `GENESIS:${lot.id}`}
                </td>
                <td title={lot.seal ?? ''}>{shortHash(lot.seal) ?? '—'}</td>
                <td className="ledger__check">{intact ? 'confere' : 'não confere'}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted small audit__note">
          O selo trava o fim da corrente: detecta lances removidos ou acrescentados no final. Passe o mouse num hash
          para ver o valor completo; no celular, deslize a tabela para ver as colunas de hash.
        </p>
      </section>

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
    </div>
  );
}
