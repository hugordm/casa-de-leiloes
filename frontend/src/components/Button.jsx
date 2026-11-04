// Desabilitado enquanto `loading`: evita clique duplo (ex.: dois lances iguais).
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
