// "/" — Vitrine: abas (ao vivo / agendados / encerrados), busca e filtro de preço.
// Os filtros ficam na URL (?status=live&search=...) para o link poder ser compartilhado.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { lotsApi } from '../api/endpoints';
import { LotCard } from '../components/LotCard';
import { Loading, ErrorState, EmptyState } from '../components/PageState';
import { Icon } from '../components/Icon';
import { useServerNow } from '../hooks/useServerNow';
import { parseBRL } from '../utils/format';

const TABS = [
  { value: 'live', label: 'Ao vivo' },
  { value: 'scheduled', label: 'Agendados' },
  { value: 'ended', label: 'Encerrados' },
];

const EMPTY_MESSAGES = {
  live: 'Nenhum leilão acontecendo agora.',
  scheduled: 'Nenhum leilão agendado.',
  ended: 'Nenhum leilão encerrado ainda.',
};

export function ShowcasePage() {
  const [params, setParams] = useSearchParams();
  const status = TABS.some((t) => t.value === params.get('status')) ? params.get('status') : 'live';
  const search = params.get('search') || '';
  const minPrice = params.get('min') || '';
  const maxPrice = params.get('max') || '';

  // Campos digitados ficam em estado local; a URL só muda após uma pausa na digitação.
  const [searchInput, setSearchInput] = useState(search);
  const [minInput, setMinInput] = useState(minPrice);
  const [maxInput, setMaxInput] = useState(maxPrice);

  const [lots, setLots] = useState(null);
  const [error, setError] = useState(null);
  const now = useServerNow(1000);

  // Forma funcional (prev => next): sempre parte da URL ATUAL, mesmo se chamada
  // por um timer antigo (o debounce abaixo), sem desfazer uma troca de aba recente.
  function updateParams(changes) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true }
    );
  }

  // Debounce: espera 400 ms sem digitar para buscar (evita uma requisição por tecla).
  useEffect(() => {
    const id = setTimeout(() => updateParams({ search: searchInput.trim(), min: minInput.trim(), max: maxInput.trim() }), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, minInput, maxInput]);

  const minCents = minPrice ? parseBRL(minPrice) : null;
  const maxCents = maxPrice ? parseBRL(maxPrice) : null;
  const priceError =
    (minPrice && minCents === null) || (maxPrice && maxCents === null)
      ? 'Use valores como 1.500 ou 1500,00'
      : minCents !== null && maxCents !== null && minCents > maxCents
        ? 'O mínimo é maior que o máximo'
        : null;

  useEffect(() => {
    if (priceError) return undefined;
    const controller = new AbortController();
    setLots(null);
    setError(null);
    lotsApi
      .list({ status, search, minPrice: minCents ?? undefined, maxPrice: maxCents ?? undefined }, controller.signal)
      .then((data) => setLots(data.lots))
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message);
      });
    return () => controller.abort(); // mudou o filtro antes de responder: descarta a resposta antiga
  }, [status, search, minCents, maxCents, priceError]);

  const hasFilters = search || minPrice || maxPrice;

  return (
    <div className="container">
      <section className="hero">
        <p className="eyebrow">Leilões de arte</p>
        <h1>Obras-primas, lance a lance.</h1>
        <p className="hero__lead">
          Acervo do Art Institute of Chicago em leilões transparentes: cada lance fica registrado numa corrente
          de hashes que qualquer pessoa pode auditar.
        </p>
      </section>

      <div className="tabs" role="tablist" aria-label="Situação dos leilões">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={status === tab.value}
            className={`tabs__tab ${status === tab.value ? 'tabs__tab--active' : ''}`}
            onClick={() => updateParams({ status: tab.value === 'live' ? '' : tab.value })}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="filters">
        <div className="field filters__search">
          <label htmlFor="search">Buscar</label>
          <div className="input-icon">
            <Icon name="search" />
            <input
              id="search"
              type="search"
              placeholder="Obra ou artista"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="min">Preço mínimo (R$)</label>
          <input id="min" inputMode="decimal" placeholder="0" value={minInput} onChange={(e) => setMinInput(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="max">Preço máximo (R$)</label>
          <input id="max" inputMode="decimal" placeholder="Sem limite" value={maxInput} onChange={(e) => setMaxInput(e.target.value)} />
        </div>
        {hasFilters && (
          <button
            type="button"
            className="btn btn--ghost btn--sm filters__clear"
            onClick={() => {
              setSearchInput('');
              setMinInput('');
              setMaxInput('');
            }}
          >
            Limpar filtros
          </button>
        )}
      </div>
      {priceError && <p className="field__error filters__error">{priceError}</p>}

      {error ? (
        <ErrorState message={error} />
      ) : !lots ? (
        <Loading label="Carregando lotes…" />
      ) : lots.length === 0 ? (
        <EmptyState title={hasFilters ? 'Nenhum lote encontrado com esses filtros.' : EMPTY_MESSAGES[status]} />
      ) : (
        <div className="lot-grid">
          {lots.map((lot) => (
            <LotCard key={lot.id} lot={lot} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}
