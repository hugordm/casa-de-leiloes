import { STATUS_LABEL } from '../utils/lot';

// Selo de status do lote: Ao vivo (com ponto pulsando), Agendado, Encerrado, Cancelado.
export function StatusBadge({ status }) {
  return (
    <span className={`badge badge--${status}`}>
      {status === 'live' && <span className="badge__dot" aria-hidden="true" />}
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
