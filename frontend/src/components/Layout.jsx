import { Outlet } from 'react-router';
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
          <p>Lances auditáveis por corrente de hashes HMAC-SHA256</p>
        </div>
      </footer>
    </div>
  );
}
