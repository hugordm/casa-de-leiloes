// Campo de senha com botão "olho" para mostrar/ocultar o que foi digitado.
// Usado em todos os formulários com senha (login e cadastro).
// Repassa as demais props (id, value, onChange, autoComplete...) para o <input>.
import { useState } from 'react';
import { Icon } from './Icon';

// Regra de senha do cadastro. Quem valida de verdade é o back-end (auth.service.js);
// aqui serve só para avisar antes de enviar.
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

export function passwordError(password) {
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return `A senha deve ter entre ${PASSWORD_MIN} e ${PASSWORD_MAX} caracteres`;
  }
  return null;
}

export function PasswordInput(props) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-input">
      <input {...props} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className="password-input__toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={visible}
        aria-controls={props.id}
      >
        <Icon name={visible ? 'eyeOff' : 'eye'} />
      </button>
    </div>
  );
}
