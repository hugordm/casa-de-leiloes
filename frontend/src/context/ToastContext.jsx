// Toasts: mensagens de sucesso/erro no canto da tela que somem sozinhas.
// Uso: const toast = useToast(); toast.success('Lance registrado'); toast.error(err.message);
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';

const ToastContext = createContext(null);

const DURATION = { success: 4000, info: 4500, error: 6500 }; // erro fica mais tempo para dar tempo de ler

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (type, message) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, type, message }]); // no máximo 4 na tela
      setTimeout(() => dismiss(id), DURATION[type]);
    },
    [dismiss]
  );

  const api = useMemo(
    () => ({
      success: (msg) => show('success', msg),
      error: (msg) => show('error', msg),
      info: (msg) => show('info', msg),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region">
        {toasts.map((t) => (
          // role="alert" (erro) é anunciado na hora por leitores de tela; "status" espera a vez.
          <div key={t.id} className={`toast toast--${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>
            <Icon name={t.type === 'success' ? 'check' : t.type === 'error' ? 'alert' : 'info'} />
            <p>{t.message}</p>
            <button type="button" className="toast__close" onClick={() => dismiss(t.id)} aria-label="Fechar aviso">
              <Icon name="close" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
