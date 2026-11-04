// Sala do lote com a API SIMULADA: o teste controla o que cada endpoint devolve.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { authApi, lotsApi, walletApi } from '../src/api/endpoints';
import { ApiError } from '../src/api/client';
import { LotRoomPage } from '../src/pages/LotRoomPage';
import { renderWithProviders } from './renderWithProviders';

vi.mock('../src/api/endpoints', () => ({
  authApi: { me: vi.fn() },
  lotsApi: { get: vi.fn(), bid: vi.fn() },
  walletApi: { get: vi.fn() },
}));

const HOUR = 60 * 60 * 1000;

// Lote ao vivo com 1 lance de R$ 1.000,00 de outra pessoa: mínimo atual R$ 1.050,00.
function liveLot(overrides = {}) {
  return {
    id: 1,
    title: 'Nighthawks',
    artist: 'Edward Hopper',
    imageUrl: null,
    attributes: {},
    startingBidCents: 100000,
    minIncrementCents: 5000,
    currentBidCents: 100000,
    minNextBidCents: 105000,
    bidCount: 1,
    startsAt: new Date(Date.now() - HOUR).toISOString(),
    endsAt: new Date(Date.now() + HOUR).toISOString(),
    status: 'ACTIVE',
    displayStatus: 'live',
    finalPriceCents: null,
    auctioneer: { id: 1, name: 'Leiloeiro Demo' },
    leaderAlias: 'Licitante #AAAAAA',
    winnerAlias: null,
    recentBids: [
      { seq: 1, bidderAlias: 'Licitante #AAAAAA', amountCents: 100000, createdAt: new Date().toISOString() },
    ],
    me: { status: 'none' },
    ...overrides,
  };
}

// O mesmo lote depois do lance de R$ 1.050,00 do usuário logado.
const leadingLot = liveLot({
  currentBidCents: 105000,
  minNextBidCents: 110000,
  bidCount: 2,
  leaderAlias: 'Licitante #BBBBBB',
  recentBids: [
    { seq: 2, bidderAlias: 'Licitante #BBBBBB', amountCents: 105000, createdAt: new Date().toISOString() },
    { seq: 1, bidderAlias: 'Licitante #AAAAAA', amountCents: 100000, createdAt: new Date().toISOString() },
  ],
  me: { status: 'leading', alias: 'Licitante #BBBBBB', myBestBidCents: 105000, position: 1, totalBidders: 2 },
});

function renderRoom() {
  return renderWithProviders(<LotRoomPage />, { path: '/lotes/:id', route: '/lotes/1' });
}

// Abre o diálogo com o valor pré-preenchido (o mínimo) e confirma.
async function placeBid(user) {
  await user.click(await screen.findByRole('button', { name: 'Dar lance' }));
  // \s: o Intl.NumberFormat separa "R$" do número com espaço inseparável (NBSP).
  await user.click(await screen.findByRole('button', { name: /^Dar lance de R\$\s1\.050,00$/ }));
}

beforeEach(() => {
  vi.resetAllMocks();
  // Licitante logado: o AuthProvider encontra o token e valida com /auth/me (simulado).
  localStorage.setItem('leiloes.token', 'token-de-teste');
  authApi.me.mockResolvedValue({ user: { id: 2, name: 'Ana', email: 'ana@demo.com', role: 'BIDDER' } });
  walletApi.get.mockResolvedValue({ balanceCents: 500000, committedCents: 0, availableCents: 500000, transactions: [] });
});

describe('Sala do lote: envio de lance', () => {
  it('lance aceito mostra "Você está ganhando"', async () => {
    // O servidor só passa a dizer "leading" depois que o lance é aceito,
    // para o polling não fazer o teste passar sozinho.
    let accepted = false;
    lotsApi.get.mockImplementation(async () => ({ lot: accepted ? leadingLot : liveLot() }));
    lotsApi.bid.mockImplementation(async () => {
      accepted = true;
      return { bid: { seq: 2 }, extended: false, lot: leadingLot };
    });
    const user = userEvent.setup();
    renderRoom();

    await screen.findByRole('button', { name: 'Dar lance' });
    expect(screen.queryByText('Você está ganhando')).not.toBeInTheDocument();

    await placeBid(user);

    expect(lotsApi.bid).toHaveBeenCalledWith(1, 105000);
    expect(await screen.findByText('Você está ganhando')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Você já está ganhando' })).toBeDisabled();
  });

  it.each([
    ['BID_TOO_LOW', 'Lance abaixo do mínimo (mínimo: R$ 1.100,00)'],
    ['INSUFFICIENT_BALANCE', 'Saldo insuficiente'],
  ])('lance recusado (%s) mostra a mensagem exata da API', async (code, message) => {
    lotsApi.get.mockResolvedValue({ lot: liveLot() });
    lotsApi.bid.mockRejectedValue(new ApiError(400, code, message));
    const user = userEvent.setup();
    renderRoom();

    await placeBid(user);

    // Aparece no toast de erro e embaixo do campo, sem nenhuma alteração no texto.
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByText(message, { selector: '.field__error' })).toBeInTheDocument();
    expect(screen.queryByText('Você está ganhando')).not.toBeInTheDocument();
  });
});
