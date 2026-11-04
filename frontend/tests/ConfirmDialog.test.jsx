import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '../src/components/ConfirmDialog';
import { ConfirmProvider, useConfirm } from '../src/context/ConfirmContext';

function renderDialog() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      open
      title="Cancelar lote"
      message="Os lances serão estornados."
      confirmLabel="Cancelar lote"
      cancelLabel="Voltar"
      destructive
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('confirma pelo botão de confirmar', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancelar lote' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancela pelo botão de cancelar', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('fecha com Esc', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();

    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('com o provider: devolve false no Esc e o foco volta ao botão de origem', async () => {
    let answer;
    function Page() {
      const confirm = useConfirm();
      return (
        <button type="button" onClick={async () => (answer = await confirm({ title: 'Depositar?', message: 'Confirme.' }))}>
          Depositar
        </button>
      );
    }
    const user = userEvent.setup();
    render(
      <ConfirmProvider>
        <Page />
      </ConfirmProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Depositar' }));
    expect(screen.getByRole('alertdialog', { name: 'Depositar?' })).toBeInTheDocument();
    // Foco inicial na opção segura.
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(answer).toBe(false);
    expect(screen.getByRole('button', { name: 'Depositar' })).toHaveFocus();
  });
});
