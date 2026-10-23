// "/cadastro" — escolhe o perfil: licitante (dá lances) ou leiloeiro (cria lotes).
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';

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
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
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
        <div className="field">
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={form.password}
            onChange={set('password')}
          />
          <p className="field__hint">Mínimo de 6 caracteres.</p>
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
