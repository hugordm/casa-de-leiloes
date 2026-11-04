import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { walletApi } from '../api/endpoints';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/Button';
import { MoneyInput } from '../components/MoneyInput';
import { ErrorState, Loading } from '../components/PageState';
import { centsToInput, formatBRL, parseBRL } from '../utils/format';

const MAX_DEPOSIT_CENTS = 10_000_000; // R$ 100.000 (mesmo limite da API)
const QUICK_AMOUNTS = [10000, 50000, 100000, 500000];

// effect: quanto o lançamento muda o saldo total. REFUND é informativo: o valor estava só
// comprometido (nada foi debitado), então o saldo total não muda.
const TX_LABEL = {
  DEPOSIT: { label: 'Depósito', sign: '+', effect: 1 },
  DEBIT: { label: 'Pagamento de arremate', sign: '−', effect: -1 },
  CREDIT: { label: 'Recebimento de arremate', sign: '+', effect: 1 },
  REFUND: { label: 'Lote cancelado (valor liberado)', sign: '', effect: 0 },
};
const shortDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

// Saldo após cada lançamento, como num livro-caixa. A API manda os mais recentes primeiro;
// partindo do saldo atual e desfazendo cada lançamento, chega-se ao saldo de cada linha.
function withRunningBalance(transactions, balanceCents) {
  let after = balanceCents;
  return transactions.map((t) => {
    const row = { ...t, balanceAfter: after };
    after -= (TX_LABEL[t.type]?.effect ?? 0) * t.amountCents;
    return row;
  });
}

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

  const committedPct = wallet.balanceCents > 0 ? (wallet.committedCents / wallet.balanceCents) * 100 : 0;
  const rows = withRunningBalance(wallet.transactions, wallet.balanceCents);

  return (
    <div className="container wallet">
      <header className="page-head">
        <p className="eyebrow">Licitante</p>
        <h1>Carteira</h1>
      </header>

      <section className="wallet__summary" aria-label="Resumo do saldo">
        <dl className="ledger-sum">
          <div className="stat">
            <dt>Saldo total</dt>
            <dd className="num">{formatBRL(wallet.balanceCents)}</dd>
          </div>
          <div className="stat stat--committed">
            <dt>Comprometido</dt>
            <dd className="num">{formatBRL(wallet.committedCents)}</dd>
          </div>
          <div className="stat stat--available">
            <dt>Disponível para lances</dt>
            <dd className="num">{formatBRL(wallet.availableCents)}</dd>
          </div>
        </dl>

        <div className="wallet__split">
          <div
            className="split-bar"
            role="img"
            aria-label={`${Math.round(committedPct)}% do saldo total comprometido em lances`}
          >
            <span className="split-bar__committed" style={{ width: `${committedPct}%` }} />
            <span className="split-bar__available" style={{ width: `${100 - committedPct}%` }} />
          </div>
          <ul className="split-legend">
            <li>
              <span className="split-legend__key split-legend__key--committed" />
              Comprometido: reservado nos lotes em que você lidera. Volta ao disponível se for superado.
            </li>
            <li>
              <span className="split-legend__key split-legend__key--available" />
              Disponível: saldo total menos o comprometido.
            </li>
          </ul>
        </div>
      </section>

      <div className="wallet__grid">
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
          {rows.length === 0 ? (
            <p className="muted">Nenhuma movimentação ainda.</p>
          ) : (
            <div className="ledger-wrap">
              <table className="cashbook">
                <thead>
                  <tr>
                    <th scope="col">Data</th>
                    <th scope="col">Lançamento</th>
                    <th scope="col" className="cashbook__num">Valor</th>
                    <th scope="col" className="cashbook__num">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => {
                    const info = TX_LABEL[t.type] ?? { label: t.type, sign: '' };
                    return (
                      <tr key={t.id} className={`cashbook__row--${t.type.toLowerCase()}`}>
                        <td className="num">{shortDate.format(new Date(t.createdAt))}</td>
                        <td className="cashbook__desc">
                          {info.label}
                          {t.lot && (
                            <Link to={`/lotes/${t.lot.id}`} className="cashbook__lot">
                              {t.lot.title}
                            </Link>
                          )}
                        </td>
                        <td className="cashbook__num cashbook__amount">
                          {info.sign} {formatBRL(t.amountCents)}
                          {t.type === 'REFUND' && <small className="cashbook__note">liberado, sem alterar o total</small>}
                        </td>
                        <td className="cashbook__num">{formatBRL(t.balanceAfter)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
