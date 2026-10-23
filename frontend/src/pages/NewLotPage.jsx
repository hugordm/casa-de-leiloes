// "/painel/novo-lote" (leiloeiro) — busca a obra na API do Art Institute (via nosso back-end)
// e cria o lote. Só o externalId da obra é enviado: o back-end copia título/imagem/artista.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { catalogApi, lotsApi } from '../api/endpoints';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { LotImage } from '../components/LotImage';
import { MoneyInput } from '../components/MoneyInput';
import { formatBRL, parseBRL, toDateTimeLocal } from '../utils/format';

const HOUR = 60 * 60 * 1000;
const DURATIONS = [
  { label: '1 hora', ms: HOUR },
  { label: '1 dia', ms: 24 * HOUR },
  { label: '3 dias', ms: 72 * HOUR },
  { label: '7 dias', ms: 7 * 24 * HOUR },
];

export function NewLotPage() {
  const toast = useToast();
  const navigate = useNavigate();

  // Busca no catálogo
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [selected, setSelected] = useState(null);

  // Formulário do lote
  const [startingBid, setStartingBid] = useState('1.000,00');
  const [increment, setIncrement] = useState('50,00');
  const [startNow, setStartNow] = useState(true);
  const [startsAt, setStartsAt] = useState(() => toDateTimeLocal(new Date(Date.now() + HOUR)));
  const [endsAt, setEndsAt] = useState(() => toDateTimeLocal(new Date(Date.now() + 24 * HOUR)));
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSearch(e) {
    e.preventDefault();
    if (query.trim().length < 2) {
      setSearchError('Digite pelo menos 2 caracteres.');
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const data = await catalogApi.search(query.trim());
      setResults(data.results);
    } catch (err) {
      // ex.: "O catálogo de obras está indisponível no momento..." (timeout de 5 s no back-end)
      setSearchError(err.message);
      setResults(null);
    } finally {
      setSearching(false);
    }
  }

  // Botões de duração: término = início + duração
  function applyDuration(ms) {
    const base = startNow ? Date.now() : new Date(startsAt).getTime();
    setEndsAt(toDateTimeLocal(new Date(base + ms)));
  }

  useEffect(() => {
    if (selected) document.getElementById('lot-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selected]);

  async function handleSubmit(e) {
    e.preventDefault();
    const startingBidCents = parseBRL(startingBid);
    const minIncrementCents = parseBRL(increment);
    const nextErrors = {};
    if (!startingBidCents) nextErrors.startingBid = 'Informe um valor válido';
    if (!minIncrementCents) nextErrors.increment = 'Informe um valor válido';
    if (!endsAt) nextErrors.endsAt = 'Informe o término';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      const { lot } = await lotsApi.create({
        externalId: selected.externalId,
        startingBidCents,
        minIncrementCents,
        // datetime-local é hora LOCAL; new Date(...).toISOString() converte para UTC para a API.
        startsAt: startNow ? undefined : new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      });
      toast.success(`Lote "${lot.title}" criado.`);
      navigate(`/lotes/${lot.id}`);
    } catch (err) {
      toast.error(err.message); // validação da API: datas, valores, obra inexistente...
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container">
      <Link to="/painel" className="back-link">
        <Icon name="arrowLeft" size={16} /> Painel
      </Link>
      <header className="page-head">
        <p className="eyebrow">Leiloeiro</p>
        <h1>Novo lote</h1>
        <p className="muted">Escolha uma obra do acervo do Art Institute of Chicago e defina as regras do leilão.</p>
      </header>

      <section className="card">
        <h2>1. Escolha a obra</h2>
        <form className="search-bar" onSubmit={handleSearch}>
          <div className="input-icon">
            <Icon name="search" />
            <input
              type="search"
              aria-label="Buscar obra no catálogo"
              placeholder="Ex.: Monet, Hopper, impressionism…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button type="submit" loading={searching}>
            Buscar
          </Button>
        </form>
        {searchError && <p className="form-error" role="alert">{searchError}</p>}

        {results && results.length === 0 && <p className="muted">Nenhuma obra encontrada para “{query}”.</p>}
        {results && results.length > 0 && (
          <ul className="catalog-grid">
            {results.map((art) => (
              <li key={art.externalId}>
                <button
                  type="button"
                  className={`catalog-item ${selected?.externalId === art.externalId ? 'catalog-item--selected' : ''}`}
                  onClick={() => setSelected(art)}
                  aria-pressed={selected?.externalId === art.externalId}
                >
                  <LotImage src={art.imageUrl} alt={art.title} />
                  <span className="catalog-item__title">{art.title}</span>
                  <span className="catalog-item__artist">{art.artist}</span>
                  {selected?.externalId === art.externalId && (
                    <span className="catalog-item__check">
                      <Icon name="check" size={16} />
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && (
        <form id="lot-form" className="card new-lot" onSubmit={handleSubmit} noValidate>
          <h2>2. Regras do leilão</h2>
          <div className="new-lot__grid">
            <div className="new-lot__preview">
              <LotImage src={selected.imageUrl} alt={selected.title} eager />
              <p className="new-lot__title">{selected.title}</p>
              <p className="muted small">{selected.artist}</p>
              {selected.attributes?.date && (
                <p className="muted small">
                  {selected.attributes.date} · {selected.attributes.medium}
                </p>
              )}
            </div>

            <div className="new-lot__fields">
              <div className="form-row">
                <MoneyInput label="Lance inicial" value={startingBid} onChange={setStartingBid} error={errors.startingBid} />
                <MoneyInput
                  label="Incremento mínimo"
                  value={increment}
                  onChange={setIncrement}
                  error={errors.increment}
                  hint="Diferença mínima entre um lance e o próximo."
                />
              </div>

              <div className="field">
                <span className="label">Início</span>
                <label className="checkbox">
                  <input type="checkbox" checked={startNow} onChange={(e) => setStartNow(e.target.checked)} />
                  Começar agora
                </label>
                {!startNow && (
                  <input
                    type="datetime-local"
                    aria-label="Data e hora de início"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                )}
              </div>

              <div className="field">
                <label htmlFor="endsAt">Término</label>
                <input id="endsAt" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                {errors.endsAt && <p className="field__error">{errors.endsAt}</p>}
                <div className="quick-bids">
                  {DURATIONS.map((d) => (
                    <button key={d.label} type="button" className="chip" onClick={() => applyDuration(d.ms)}>
                      {d.label}
                    </button>
                  ))}
                </div>
                <p className="field__hint">Entre 5 minutos e 30 dias de duração. Horários no seu fuso local.</p>
              </div>

              <p className="new-lot__summary">
                {parseBRL(startingBid) ? `Lances a partir de ${formatBRL(parseBRL(startingBid))}` : ''}
                {parseBRL(increment) ? `, subindo de ${formatBRL(parseBRL(increment))} em ${formatBRL(parseBRL(increment))}.` : ''}
              </p>
              <Button type="submit" loading={submitting} className="btn--block btn--lg">
                Criar lote
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
