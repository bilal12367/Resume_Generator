import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppStorage, STORAGE_KEYS } from '../utils/storage';

export interface ThemePalette {
  isDark: boolean;
  bg: string;
  surface: string;
  card: string;
  cardActive: string;
  border: string;
  borderLight: string;
  textMain: string;
  textSecondary: string;
  textMuted: string;
  textLight: string;
  primary: string;
  primaryLight: string;
  primaryBorder: string;
  tabBar: string;
  tabBarBorder: string;
  inputBg: string;
  inputBorder: string;
  codeBg: string;
  codeText: string;
  danger: string;
  success: string;
  warning: string;
}

const LIGHT_THEME: ThemePalette = {
  isDark: false,
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  cardActive: '#EDE9FE',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  textMain: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#64748B',
  textLight: '#94A3B8',
  primary: '#7C3AED',
  primaryLight: '#F3E8FF',
  primaryBorder: '#DDD6FE',
  tabBar: '#FFFFFF',
  tabBarBorder: '#E2E8F0',
  inputBg: '#FFFFFF',
  inputBorder: '#CBD5E1',
  codeBg: '#0F172A',
  codeText: '#E2E8F0',
  danger: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
};

const DARK_THEME: ThemePalette = {
  isDark: true,
  bg: '#0B0F19',
  surface: '#111827',
  card: '#1E293B',
  cardActive: '#2E1065',
  border: '#334155',
  borderLight: '#1E293B',
  textMain: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  textLight: '#64748B',
  primary: '#8B5CF6',
  primaryLight: '#2E1065',
  primaryBorder: '#7C3AED',
  tabBar: '#0F172A',
  tabBarBorder: '#1E293B',
  inputBg: '#0F172A',
  inputBorder: '#475569',
  codeBg: '#030712',
  codeText: '#F8FAFC',
  danger: '#F87171',
  success: '#34D399',
  warning: '#FBBF24',
};

interface ThemeContextType {
  themeMode: 'light' | 'dark';
  isDark: boolean;
  theme: ThemePalette;
  toggleTheme: () => Promise<void>;
  setThemeMode: (mode: 'light' | 'dark') => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const loadThemePreference = async () => {
      try {
        const saved = await AppStorage.getItem(STORAGE_KEYS.THEME_MODE);
        if (saved === 'dark' || saved === 'light') {
          setThemeModeState(saved);
        }
      } catch {
        // default light
      }
    };
    loadThemePreference();
  }, []);

  const setThemeMode = async (mode: 'light' | 'dark') => {
    setThemeModeState(mode);
    try {
      await AppStorage.setItem(STORAGE_KEYS.THEME_MODE, mode);
    } catch {
      // ignore
    }
  };

  const toggleTheme = async () => {
    const next = themeMode === 'light' ? 'dark' : 'light';
    await setThemeMode(next);
  };

  const theme = themeMode === 'dark' ? DARK_THEME : LIGHT_THEME;

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        isDark: themeMode === 'dark',
        theme,
        toggleTheme,
        setThemeMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
