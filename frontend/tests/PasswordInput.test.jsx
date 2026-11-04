import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PasswordInput } from '../src/components/PasswordInput';

describe('PasswordInput', () => {
  it('o botão "olho" mostra e oculta a senha', async () => {
    const user = userEvent.setup();
    render(
      <>
        <label htmlFor="senha">Senha</label>
        <PasswordInput id="senha" defaultValue="segredo123" />
      </>
    );
    const input = screen.getByLabelText('Senha');
    expect(input).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(input).toHaveAttribute('type', 'text');

    // O rótulo do botão acompanha o estado (leitores de tela).
    await user.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(input).toHaveAttribute('type', 'password');
  });
});
