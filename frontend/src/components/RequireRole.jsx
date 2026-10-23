// Protege rotas no FRONT: sem login → manda para /login; papel errado → aviso.
// Isto só esconde telas; quem bloqueia de verdade é o back-end (auth + requireRole).
import { Link, Navigate, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { Loading, EmptyState } from './PageState';

export function RequireRole({ role, children }) {
  const { user, loading, signedOut } = useAuth();
  const location = useLocation();

  if (loading) return <Loading />;
  if (!user) {
    // Saiu de propósito → vitrine. Não logado / sessão expirada → login (e volta para cá depois).
    if (signedOut) return <Navigate to="/" replace />;
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (role && user.role !== role) {
    return (
      <div className="container">
        <EmptyState title="Acesso restrito" icon="shield">
          <p>Esta área é exclusiva para {role === 'BIDDER' ? 'licitantes' : 'leiloeiros'}.</p>
          <Link to="/" className="btn btn--ghost">
            Voltar à vitrine
          </Link>
        </EmptyState>
      </div>
    );
  }
  return children;
}
