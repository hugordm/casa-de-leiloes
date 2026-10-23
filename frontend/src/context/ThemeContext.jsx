// Tema claro/escuro. As cores ficam em variáveis CSS (styles/tokens.css);
// aqui só trocamos o atributo data-theme do <html> e salvamos a escolha.
// O tema inicial já foi aplicado por um script no index.html (evita "piscar").
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'leiloes.theme';
const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next); // a escolha manual passa a valer nas próximas visitas
      } catch {
        // sem localStorage: vale só até fechar a aba
      }
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
