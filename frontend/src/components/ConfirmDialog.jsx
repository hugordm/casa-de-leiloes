// Diálogo de confirmação acessível (substitui window.confirm).
//   - Esc ou clique fora → cancela
//   - foco preso dentro do modal enquanto aberto (Tab/Shift+Tab circulam só nos botões dele)
//   - ao fechar, o foco volta para o elemento que abriu o modal
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  onConfirm,
  onCancel,
}) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    if (!open) return undefined;

    // Lembra quem tinha o foco (o botão que abriu) para devolver ao fechar.
    const previouslyFocused = document.activeElement;
    // Foco inicial no "Cancelar": a opção segura, caso a pessoa aperte Enter sem querer.
    cancelRef.current?.focus();
    // Impede a página de fundo de rolar enquanto o modal está aberto.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== 'Tab') return;
      // Prende o foco: do último elemento volta ao primeiro (e vice-versa).
      const items = dialogRef.current.querySelectorAll(FOCUSABLE);
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!dialogRef.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.(); // devolve o foco ao botão de origem
    };
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-backdrop"
      // Clique fora (no fundo escuro) cancela; clique dentro do modal não.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
      >
        <h2 id={titleId} className="modal__title">
          {title}
        </h2>
        <div id={messageId} className="modal__message">
          {message}
        </div>
        <div className="modal__actions">
          <button ref={cancelRef} type="button" className="btn btn--ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${destructive ? 'btn--danger' : 'btn--primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
