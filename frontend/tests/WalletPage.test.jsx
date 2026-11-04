import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { walletApi } from '../src/api/endpoints';
import { WalletPage } from '../src/pages/WalletPage';
import { renderWithProviders } from './renderWithProviders';

vi.mock('../src/api/endpoints', () => ({
  authApi: { me: vi.fn() },
  walletApi: { get: vi.fn(), deposit: vi.fn() },
}));

beforeEach(() => {
  vi.resetAllMocks();
});

// O valor de cada cartão é procurado DENTRO do cartão: os botões de depósito rápido
// também mostram valores em R$ e poderiam confundir uma busca na página inteira.
function statValue(label) {
  return within(screen.getByText(label).closest('.stat')).getByText(/^R\$/);
}

describe('Carteira', () => {
  it('exibe total, comprometido e disponível formatados em R$', async () => {
    // A API manda centavos; a formatação é responsabilidade do front.
    walletApi.get.mockResolvedValue({
      balanceCents: 500000,
      committedCents: 105050,
      availableCents: 394950,
      transactions: [],
    });
    renderWithProviders(<WalletPage />);

    await screen.findByRole('heading', { name: 'Carteira' });
    expect(statValue('Saldo total')).toHaveTextContent('R$ 5.000,00');
    expect(statValue('Comprometido')).toHaveTextContent('R$ 1.050,50');
    expect(statValue('Disponível para lances')).toHaveTextContent('R$ 3.949,50');
  });
});
