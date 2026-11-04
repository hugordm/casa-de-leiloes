// Pausa com a aba em segundo plano (ninguém está vendo a sala; poupa requisições)
// e busca na hora ao voltar, para a tela não mostrar dado velho.
//
// Usa setTimeout encadeado (e não setInterval): a próxima chamada só é agendada
// depois que a anterior terminou, então nunca há duas requisições ao mesmo tempo.
// `fn` recebe um AbortSignal, cancelado ao sair da página.
import { useEffect, useRef } from 'react';

export function usePolling(fn, intervalMs, enabled = true) {
  // Guarda a versão mais recente de fn sem reiniciar o polling a cada render.
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return undefined;

    const controller = new AbortController();
    let timer = null;
    let running = false;

    async function run() {
      if (running || controller.signal.aborted) return;
      running = true;
      try {
        await fnRef.current(controller.signal);
      } catch {
        // Erros são tratados dentro de fn; aqui só garantimos que o polling continue.
      } finally {
        running = false;
      }
      schedule();
    }

    function schedule() {
      clearTimeout(timer);
      if (!controller.signal.aborted && !document.hidden) {
        timer = setTimeout(run, intervalMs);
      }
    }

    function onVisibilityChange() {
      if (document.hidden) clearTimeout(timer);
      else run();
    }

    run();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
