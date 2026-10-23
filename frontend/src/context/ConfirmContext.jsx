// Permite pedir confirmação de qualquer página com uma linha:
//   const confirm = useConfirm();
//   if (await confirm({ title, message, confirmLabel, destructive: true })) { ...faz a ação... }
// Existe UM <ConfirmDialog> na aplicação, controlado por este provider.
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [options, setOptions] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        resolveRef.current = resolve;
        setOptions(opts);
      }),
    []
  );

  const close = useCallback((result) => {
    setOptions(null);
    resolveRef.current?.(result);
    resolveRef.current = null;
  }, []);

  const handleCancel = useCallback(() => close(false), [close]);
  const handleConfirm = useCallback(() => close(true), [close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog open={!!options} {...options} onCancel={handleCancel} onConfirm={handleConfirm} />
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);
