// Cabeçalho: marca, navegação por papel, alternância de tema e sessão.
// No celular, a navegação vira um menu que abre pelo botão "hambúrguer".
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { Icon } from './Icon';

export function Header() {
  const { user, isBidder, isAuctioneer, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Fecha o menu do celular ao trocar de página.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  async function handleLogout() {
    const ok = await confirm({
      title: 'Sair da conta?',
      message: 'Você precisará entrar novamente para dar lances ou acessar sua carteira.',
      confirmLabel: 'Sair',
      destructive: true,
    });
    if (!ok) return;
    logout();
    toast.success('Você saiu da sua conta.');
    navigate('/');
  }

  const navClass = ({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`;

  return (
    <header className="header">
      <div className="container header__inner">
        <Link to="/" className="brand" aria-label="Casa de Leilões — início">
          <span className="brand__mark">
            <Icon name="gavel" size={20} />
          </span>
          <span className="brand__name">
            Casa de Leilões
            <small>Leilões de arte</small>
          </span>
        </Link>

        <button
          type="button"
          className="icon-btn header__menu-btn"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-controls="main-nav"
          aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
        >
          <Icon name={menuOpen ? 'close' : 'menu'} size={22} />
        </button>

        <nav id="main-nav" className={`nav ${menuOpen ? 'nav--open' : ''}`} aria-label="Principal">
          <NavLink to="/" end className={navClass}>
            Vitrine
          </NavLink>
          {isBidder && (
            <>
              <NavLink to="/meus-arremates" className={navClass}>
                Meus arremates
              </NavLink>
              <NavLink to="/carteira" className={navClass}>
                Carteira
              </NavLink>
            </>
          )}
          {isAuctioneer && (
            <>
              <NavLink to="/painel" end className={navClass}>
                Painel
              </NavLink>
              <NavLink to="/painel/novo-lote" className={navClass}>
                Novo lote
              </NavLink>
            </>
          )}

          <div className="nav__actions">
            <button
              type="button"
              className="icon-btn"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
              title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>

            {user ? (
              <div className="nav__user">
                <span className="nav__user-name" title={user.email}>
                  {user.name.split(' ')[0]}
                  <small>{isAuctioneer ? 'Leiloeiro' : 'Licitante'}</small>
                </span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={handleLogout}>
                  <Icon name="logout" size={16} /> Sair
                </button>
              </div>
            ) : (
              <div className="nav__user">
                <Link to="/login" className="btn btn--ghost btn--sm">
                  Entrar
                </Link>
                <Link to="/cadastro" className="btn btn--primary btn--sm">
                  Cadastrar
                </Link>
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
