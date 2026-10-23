// Botão com estado de carregamento: enquanto `loading`, fica desabilitado
// (evita clique duplo, ex.: dois lances iguais) e mostra um spinner.
export function Button({ loading = false, variant = 'primary', disabled, children, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`btn btn--${variant} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <span className="spinner" aria-hidden="true" />}
      <span className={loading ? 'btn__label--loading' : undefined}>{children}</span>
    </button>
  );
}
