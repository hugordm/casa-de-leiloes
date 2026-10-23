// Re-renderiza o componente a cada `tickMs` com a hora atual DO SERVIDOR.
import { useEffect, useState } from 'react';
import { serverNow } from '../utils/serverClock';

export function useServerNow(tickMs = 1000) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now;
}
