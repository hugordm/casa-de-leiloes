// Usa a hora do SERVIDOR (useServerNow): o relógio do usuário pode estar errado.
// Se endsAt mudar (anti-sniping), o tempo é recalculado na hora: basta o pai passar o novo valor.
import { useServerNow } from '../hooks/useServerNow';
import { formatDuration } from '../utils/format';

const URGENT_MS = 60 * 1000;

export function Countdown({ target, endedLabel = 'Encerrado', compact = false }) {
  const now = useServerNow(compact ? 1000 : 250);
  const remaining = Date.parse(target) - now;

  if (remaining <= 0) return <span className="countdown countdown--ended">{endedLabel}</span>;

  const urgent = remaining < URGENT_MS;
  return (
    <span className={`countdown ${urgent ? 'countdown--urgent' : ''}`} role="timer" aria-live="off">
      {formatDuration(remaining)}
    </span>
  );
}
