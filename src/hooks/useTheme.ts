import {useState, useCallback} from 'react';
import {Colors, ThemeMode} from '../theme/colors';
import {getSettings, saveSettings} from '../storage';

export const useTheme = () => {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const settings = getSettings();
    return settings.darkMode ? 'dark' : 'light';
  });

  const toggleTheme = useCallback(() => {
    const newMode: ThemeMode = mode === 'dark' ? 'light' : 'dark';
    setMode(newMode);
    const settings = getSettings();
    saveSettings({...settings, darkMode: newMode === 'dark'});
  }, [mode]);

  const colors = mode === 'dark' ? Colors.dark : Colors.light;

  return {mode, toggleTheme, colors};
};
