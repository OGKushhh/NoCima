import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Colors, ThemeMode, ThemeColors } from '../theme/colors';
import { getSettings, saveSettings } from '../storage';

// ---------------------------------------------------------------------------
// ThemeContext — provides colors to any child without prop drilling
// ---------------------------------------------------------------------------
interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  colors: Colors.dark,
  toggleTheme: () => {},
  isDark: true,
});

// ---------------------------------------------------------------------------
// ThemeProvider — wrap your root component with this
// ---------------------------------------------------------------------------
export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const settings = getSettings();
    return settings.darkMode !== false ? 'dark' : 'light';
  });

  const toggleTheme = useCallback(() => {
    const newMode: ThemeMode = mode === 'dark' ? 'light' : 'dark';
    setMode(newMode);
    const settings = getSettings();
    saveSettings({ ...settings, darkMode: newMode === 'dark' });
  }, [mode]);

  const colors = mode === 'dark' ? Colors.dark : Colors.light;

  return (
    <ThemeContext.Provider value={{ mode, colors, toggleTheme, isDark: mode === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// useTheme — call inside any component to get current theme colors
// ---------------------------------------------------------------------------
export const useTheme = () => useContext(ThemeContext);

// Re-export types for convenience
export type { ThemeMode, ThemeColors };
