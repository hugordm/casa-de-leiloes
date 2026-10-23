import { Outlet } from 'react-router';
import { apiUrl } from '../api/client';
import { AssistantWidget } from './AssistantWidget';
import { Header } from './Header';

// Moldura comum a todas as páginas: cabeçalho, conteúdo e rodapé.
export function Layout() {
  return (
    <div className="app">
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>
      <Header />
      <main id="conteudo" className="main">
        <Outlet />
      </main>
      <footer className="footer">
        <div className="container footer__inner">
          <p>
            Casa de Leilões · obras do{' '}
            <a href="https://www.artic.edu/" target="_blank" rel="noreferrer">
              Art Institute of Chicago
            </a>
          </p>
          <p>
            Lances auditáveis por corrente de hashes HMAC-SHA256 ·{' '}
            <a href={apiUrl('/docs')} target="_blank" rel="noreferrer">
              Documentação da API
            </a>
          </p>
        </div>
      </footer>
      <AssistantWidget />
    </div>
  );
}
