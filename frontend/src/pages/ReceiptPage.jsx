// "/comprovante/:code" — comprovante público de arremate (sem nome/e-mail do vencedor).
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { publicApi } from '../api/endpoints';
import { useToast } from '../context/ToastContext';
import { Icon } from '../components/Icon';
import { LotImage } from '../components/LotImage';
import { ErrorState, Loading } from '../components/PageState';
import { formatBRL, formatDateLong } from '../utils/format';
import { lotNumber } from '../utils/lot';

// Copia texto para a área de transferência. navigator.clipboard só existe em HTTPS/localhost;
// fora disso usamos um <textarea> temporário + execCommand (método antigo, ainda suportado).
async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!ok) throw new Error('copy failed');
}

export function ReceiptPage() {
  const { code } = useParams();
  const toast = useToast();
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    publicApi
      .receipt(code)
      .then((data) => setReceipt(data.receipt))
      .catch((err) => setError(err.message));
  }, [code]);

  const shareUrl = `${window.location.origin}/comprovante/${code}`;

  async function handleCopy() {
    try {
      await copyText(shareUrl);
      setCopied(true);
      toast.success('Link do comprovante copiado.');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Não foi possível copiar. Selecione o link e copie manualmente.');
    }
  }

  if (error) return <div className="container"><ErrorState message={error} /></div>;
  if (!receipt) return <Loading label="Carregando comprovante…" />;

  const { lot } = receipt;

  return (
    <div className="container receipt-page">
      <article className="receipt">
        <header className="receipt__header">
          <Icon name="gavel" size={26} />
          <p className="eyebrow">Casa de Leilões</p>
          <h1>Comprovante de arremate</h1>
          <p className="receipt__code">
            Nº <code>{receipt.code}</code>
          </p>
        </header>

        <div className="receipt__body">
          <LotImage src={lot.imageUrl} alt={lot.title} className="receipt__image" eager />
          <div>
            <p className="eyebrow">{lotNumber(lot.id)}</p>
            <h2 className="receipt__title">{lot.title}</h2>
            <p className="muted">{lot.artist}</p>
            {lot.attributes?.date && <p className="muted small">{lot.attributes.date} · {lot.attributes.medium}</p>}

            <dl className="receipt__facts">
              <div>
                <dt>Valor do arremate</dt>
                <dd className="receipt__amount">{formatBRL(receipt.amountCents)}</dd>
              </div>
              <div>
                <dt>Arrematante</dt>
                <dd className="mono-alias">{receipt.winnerAlias}</dd>
              </div>
              <div>
                <dt>Liquidado em</dt>
                <dd>{formatDateLong(receipt.settledAt)}</dd>
              </div>
              <div>
                <dt>Lances no leilão</dt>
                <dd>{lot.bidCount}</dd>
              </div>
            </dl>
          </div>
        </div>

        <footer className="receipt__footer">
          <p className="muted small">
            O arrematante é identificado apenas pelo apelido usado neste leilão. A autenticidade dos lances pode ser
            conferida na auditoria pública.
          </p>
          <div className="receipt__share">
            <label htmlFor="share-url" className="label">Link de compartilhamento</label>
            <div className="copy-field">
              <input id="share-url" readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn btn--primary" onClick={handleCopy}>
                <Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? 'Copiado' : 'Copiar link'}
              </button>
            </div>
          </div>
          <Link to={receipt.auditUrl} className="audit-link">
            <Icon name="shieldCheck" size={18} /> Ver auditoria dos lances deste lote
          </Link>
        </footer>
      </article>
    </div>
  );
}
