import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Colors, ThemeMode, ThemeColors } from '../theme/colors';
import { getSettings, saveSettings } from '../storage';

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
  toggleTheme: () => void;
  setDarkMode: (dark: boolean) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const settings = getSettings();
    return settings.darkMode !== false ? 'dark' : 'light';
  });

  const toggleTheme = useCallback(() => {
    setMode(prev => {
      const newMode = prev === 'dark' ? 'light' : 'dark';
      const settings = getSettings();
      saveSettings({ ...settings, darkMode: newMode === 'dark' });
      return newMode;
    });
  }, []);

  const setDarkMode = useCallback((dark: boolean) => {
    setMode(dark ? 'dark' : 'light');
    const settings = getSettings();
    saveSettings({ ...settings, darkMode: dark });
  }, []);

  const colors = mode === 'dark' ? Colors.dark : Colors.light;

  return (
    <ThemeContext.Provider value={{ mode, colors, toggleTheme, setDarkMode, isDark: mode === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};
