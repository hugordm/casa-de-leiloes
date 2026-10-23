// Estados de página padronizados: carregando, erro e vazio.
import { Icon } from './Icon';

export function Loading({ label = 'Carregando…' }) {
  return (
    <div className="page-state" role="status">
      <span className="spinner spinner--lg" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({ message, action }) {
  return (
    <div className="page-state page-state--error" role="alert">
      <Icon name="alert" size={28} />
      <p>{message}</p>
      {action}
    </div>
  );
}

export function EmptyState({ title, children, icon = 'gavel' }) {
  return (
    <div className="page-state page-state--empty">
      <Icon name={icon} size={30} />
      <p className="page-state__title">{title}</p>
      {children && <div className="page-state__body">{children}</div>}
    </div>
  );
}
