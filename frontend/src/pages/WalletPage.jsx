// "/carteira" (licitante) — total, comprometido, disponível, depósito e extrato.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { walletApi } from '../api/endpoints';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/Button';
import { MoneyInput } from '../components/MoneyInput';
import { ErrorState, Loading } from '../components/PageState';
import { centsToInput, formatBRL, formatDateTime, parseBRL } from '../utils/format';

const MAX_DEPOSIT_CENTS = 10_000_000; // R$ 100.000 (mesmo limite da API)
const QUICK_AMOUNTS = [10000, 50000, 100000, 500000];

const TX_LABEL = {
  DEPOSIT: { label: 'Depósito', sign: '+' },
  DEBIT: { label: 'Pagamento de arremate', sign: '−' },
  CREDIT: { label: 'Recebimento de arremate', sign: '+' },
  // Informativo: o valor estava só comprometido (nada foi debitado), então o saldo total não muda.
  REFUND: { label: 'Lote cancelado (valor liberado)', sign: '' },
};

export function WalletPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState(null);
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState(null);
  const [depositing, setDepositing] = useState(false);

  const load = useCallback(() => {
    walletApi.get().then(setWallet).catch((err) => setError(err.message));
  }, []);
  useEffect(load, [load]);

  async function handleDeposit(e) {
    e.preventDefault();
    const cents = parseBRL(amount);
    if (cents === null || cents <= 0) {
      setAmountError('Digite um valor válido, por exemplo 500,00');
      return;
    }
    if (cents > MAX_DEPOSIT_CENTS) {
      setAmountError(`O limite por depósito é ${formatBRL(MAX_DEPOSIT_CENTS)}`);
      return;
    }
    const ok = await confirm({
      title: 'Confirmar depósito',
      message: (
        <p>
          Depositar <strong>{formatBRL(cents)}</strong> na sua carteira? Este é um depósito simulado: nenhum dinheiro
          real é movimentado.
        </p>
      ),
      confirmLabel: `Depositar ${formatBRL(cents)}`,
    });
    if (!ok) return;

    setDepositing(true);
    try {
      setWallet(await walletApi.deposit(cents));
      setAmount('');
      toast.success(`Depósito de ${formatBRL(cents)} realizado.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDepositing(false);
    }
  }

  if (error) return <div className="container"><ErrorState message={error} /></div>;
  if (!wallet) return <Loading label="Carregando carteira…" />;

  return (
    <div className="container">
      <header className="page-head">
        <p className="eyebrow">Licitante</p>
        <h1>Carteira</h1>
      </header>

      <div className="stats">
        <div className="stat">
          <p className="label">Saldo total</p>
          <p className="stat__value">{formatBRL(wallet.balanceCents)}</p>
          <p className="stat__hint">Tudo o que você depositou, menos os arremates pagos.</p>
        </div>
        <div className="stat stat--warn">
          <p className="label">Comprometido</p>
          <p className="stat__value">{formatBRL(wallet.committedCents)}</p>
          <p className="stat__hint">Reservado nos lotes em que você lidera. Volta ao disponível se for superado.</p>
        </div>
        <div className="stat stat--ok">
          <p className="label">Disponível para lances</p>
          <p className="stat__value">{formatBRL(wallet.availableCents)}</p>
          <p className="stat__hint">Saldo total − comprometido.</p>
        </div>
      </div>

      <div className="two-cols">
        <section className="card" aria-labelledby="deposit-title">
          <h2 id="deposit-title">Depositar</h2>
          <form onSubmit={handleDeposit} noValidate>
            <MoneyInput
              label="Valor"
              placeholder="0,00"
              value={amount}
              onChange={(v) => {
                setAmount(v);
                setAmountError(null);
              }}
              error={amountError}
              hint="Depósito simulado, até R$ 100.000,00 por vez."
              disabled={depositing}
            />
            <div className="quick-bids">
              {QUICK_AMOUNTS.map((cents) => (
                <button key={cents} type="button" className="chip" onClick={() => setAmount(centsToInput(cents))} disabled={depositing}>
                  {formatBRL(cents)}
                </button>
              ))}
            </div>
            <Button type="submit" loading={depositing} className="btn--block">
              Depositar
            </Button>
          </form>
        </section>

        <section className="card" aria-labelledby="statement-title">
          <h2 id="statement-title">Extrato</h2>
          {wallet.transactions.length === 0 ? (
            <p className="muted">Nenhuma movimentação ainda.</p>
          ) : (
            <ul className="statement">
              {wallet.transactions.map((t) => {
                const info = TX_LABEL[t.type] ?? { label: t.type, sign: '' };
                return (
                  <li key={t.id} className={`statement__row statement__row--${t.type.toLowerCase()}`}>
                    <div>
                      <p className="statement__label">{info.label}</p>
                      <p className="muted small">
                        {formatDateTime(t.createdAt)}
                        {t.lot && (
                          <>
                            {' · '}
                            <Link to={`/lotes/${t.lot.id}`}>{t.lot.title}</Link>
                          </>
                        )}
                      </p>
                    </div>
                    <p className="statement__amount">
                      {info.sign} {formatBRL(t.amountCents)}
                      {t.type === 'REFUND' && <small className="statement__note">liberado, sem alterar o total</small>}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
