// Campo de valor em reais. O usuário digita "1.050,00" (ou "1050"); quem usa o
// componente converte para centavos com parseBRL na hora de enviar.
import { useId } from 'react';

export function MoneyInput({ label, value, onChange, hint, error, id, ...props }) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <div className={`field ${error ? 'field--error' : ''}`}>
      {label && <label htmlFor={inputId}>{label}</label>}
      <div className="money-input">
        <span className="money-input__prefix">R$</span>
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? 'true' : undefined}
          {...props}
        />
      </div>
      {error ? <p className="field__error">{error}</p> : hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}
