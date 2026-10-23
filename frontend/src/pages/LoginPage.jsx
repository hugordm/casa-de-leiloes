// "/login"
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/Button';
import { PasswordInput } from '../components/PasswordInput';

export function LoginPage() {
  const { user, login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to={from} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const loggedUser = await login(email, password);
      toast.success(`Bem-vindo(a), ${loggedUser.name.split(' ')[0]}!`);
      navigate(from, { replace: true }); // volta para onde estava antes do login
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container auth">
      <form className="card auth__card" onSubmit={handleSubmit} noValidate>
        <p className="eyebrow">Bem-vindo de volta</p>
        <h1>Entrar</h1>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Senha</label>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" loading={loading} className="btn--block">
          Entrar
        </Button>
        <p className="auth__switch">
          Ainda não tem conta? <Link to="/cadastro" state={location.state}>Cadastre-se</Link>
        </p>
        <details className="auth__demo">
          <summary>Contas de demonstração</summary>
          <p>
            Senha <code>senha123</code> para todas: <code>leiloeiro@demo.com</code>, <code>ana@demo.com</code>,{' '}
            <code>bruno@demo.com</code>
          </p>
        </details>
      </form>
    </div>
  );
}
