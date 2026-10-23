// "/cadastro" — escolhe o perfil: licitante (dá lances) ou leiloeiro (cria lotes).
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { PasswordInput, PASSWORD_MAX, PASSWORD_MIN, passwordError } from '../components/PasswordInput';

const ROLES = [
  { value: 'BIDDER', title: 'Licitante', text: 'Deposito saldo e dou lances nas obras.', icon: 'gavel' },
  { value: 'AUCTIONEER', title: 'Leiloeiro', text: 'Coloco obras em leilão e recebo pelos arremates.', icon: 'trophy' },
];

export function RegisterPage() {
  const { user, register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'BIDDER' });
  const [error, setError] = useState(null);
  const [passwordMsg, setPasswordMsg] = useState(null); // aviso do campo senha, antes de enviar
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  function handlePasswordChange(e) {
    set('password')(e);
    // Depois do primeiro aviso, o aviso some assim que a senha fica válida.
    if (passwordMsg) setPasswordMsg(passwordError(e.target.value));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    // Validação no front só para avisar antes de enviar; a regra que vale é a do back-end.
    const pwdError = passwordError(form.password);
    setPasswordMsg(pwdError);
    if (pwdError) {
      document.getElementById('password')?.focus();
      return;
    }
    setLoading(true);
    try {
      const created = await register(form);
      toast.success('Conta criada! Você já está conectado.');
      const home = created.role === 'AUCTIONEER' ? '/painel' : '/carteira';
      navigate(location.state?.from || home, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container auth">
      <form className="card auth__card" onSubmit={handleSubmit} noValidate>
        <p className="eyebrow">Nova conta</p>
        <h1>Cadastro</h1>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <fieldset className="role-picker">
          <legend>Como você quer participar?</legend>
          {ROLES.map((r) => (
            <label key={r.value} className={`role-option ${form.role === r.value ? 'role-option--active' : ''}`}>
              <input type="radio" name="role" value={r.value} checked={form.role === r.value} onChange={set('role')} />
              <Icon name={r.icon} size={22} />
              <span>
                <strong>{r.title}</strong>
                <small>{r.text}</small>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="field">
          <label htmlFor="name">Nome</label>
          <input id="name" autoComplete="name" required value={form.name} onChange={set('name')} />
        </div>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
        </div>
        <div className={`field ${passwordMsg ? 'field--error' : ''}`}>
          <label htmlFor="password">Senha</label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN}
            maxLength={PASSWORD_MAX}
            value={form.password}
            onChange={handlePasswordChange}
            aria-invalid={passwordMsg ? true : undefined}
            aria-describedby="password-help"
          />
          {passwordMsg ? (
            <p id="password-help" className="field__error" role="alert">
              {passwordMsg}
            </p>
          ) : (
            <p id="password-help" className="field__hint">
              De {PASSWORD_MIN} a {PASSWORD_MAX} caracteres.
            </p>
          )}
        </div>
        <Button type="submit" loading={loading} className="btn--block">
          Criar conta
        </Button>
        <p className="auth__switch">
          Já tem conta? <Link to="/login" state={location.state}>Entrar</Link>
        </p>
      </form>
    </div>
  );
}
