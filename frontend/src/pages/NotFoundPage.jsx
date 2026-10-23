import { Link } from 'react-router';
import { EmptyState } from '../components/PageState';

export function NotFoundPage() {
  return (
    <div className="container">
      <EmptyState title="Página não encontrada" icon="search">
        <p>O endereço pode estar errado ou a página não existe mais.</p>
        <Link to="/" className="btn btn--primary">Ir para a vitrine</Link>
      </EmptyState>
    </div>
  );
}
