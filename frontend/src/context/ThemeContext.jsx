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
        localStorage.setItem(STORAGE_KEY, next); // a partir daqui, ignora o tema do sistema
      } catch {
        // sem localStorage: vale só até fechar a aba
      }
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
