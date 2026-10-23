// Sessão do usuário: quem está logado, login/cadastro/logout.
//
// O token JWT fica no localStorage (via api/client.js) e vai em toda requisição.
// Ao abrir o site, se houver token salvo, validamos com GET /auth/me.
// Se qualquer chamada da API responder 401 (token expirado/inválido), o client.js
// avisa aqui: limpamos a sessão e mandamos para o login com um aviso.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { getToken, setToken, setUnauthorizedHandler } from '../api/client';
import { authApi } from '../api/endpoints';
import { useToast } from './ToastContext';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // "loading" = ainda validando o token salvo; as rotas protegidas esperam isso terminar.
  const [loading, setLoading] = useState(() => !!getToken());
  // true quando o usuário clicou em "Sair". Páginas protegidas usam isto para mandar
  // para a vitrine (e não para o login, que é o destino quando a sessão EXPIRA).
  const [signedOut, setSignedOut] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  // Abertura do site: valida o token salvo.
  useEffect(() => {
    if (!getToken()) return;
    authApi
      .me()
      .then((data) => setUser(data.user))
      .catch(() => setToken(null)) // token velho: segue como visitante, sem alarde
      .finally(() => setLoading(false));
  }, []);

  // Sessão expirou no meio do uso → sai e vai para o login, lembrando onde estava.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setUser(null);
      toast.info('Sua sessão expirou. Entre novamente para continuar.');
      navigate('/login', { replace: true, state: { from: location.pathname } });
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate, location.pathname, toast]);

  const login = useCallback(async (email, password) => {
    const data = await authApi.login(email, password);
    setToken(data.token);
    setUser(data.user);
    setSignedOut(false);
    return data.user;
  }, []);

  const register = useCallback(async (form) => {
    const data = await authApi.register(form);
    setToken(data.token);
    setUser(data.user);
    setSignedOut(false);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setSignedOut(true);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      signedOut,
      isBidder: user?.role === 'BIDDER',
      isAuctioneer: user?.role === 'AUCTIONEER',
      login,
      register,
      logout,
    }),
    [user, loading, signedOut, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
