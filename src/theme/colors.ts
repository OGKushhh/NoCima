// AbdoBest color theme
// "Abdo" = red-orange gradient | "Best" = deep blue → cyan gradient
export const Colors = {
  dark: {
    // Brand gradients
    gradientAbdo: ['#E53935', '#FF6D00'] as const,   // red → orange
    gradientBest: ['#1565C0', '#29B6F6'] as const,   // dark blue → cyan

    // Primary actions (use red-orange)
    primary: '#E53935',
    primaryLight: '#FF6D00',
    primaryGradient: ['#E53935', '#FF6D00'] as const,

    // Accent (blue-cyan)
    accent: '#1565C0',
    accentLight: '#29B6F6',
    accentGradient: ['#1565C0', '#29B6F6'] as const,

    // Surfaces - dark navy palette
    background: '#0A0D14',
    surface: '#12161F',
    surfaceLight: '#1A2030',
    card: '#141824',
    tabBar: '#0D1018',

    // Text
    text: '#F0F4FF',
    textSecondary: '#8B95B0',
    textMuted: '#4A5270',

    // UI
    border: '#1E2535',
    overlay: 'rgba(0,0,0,0.75)',

    // Status
    success: '#00C853',
    warning: '#FF8F00',
    error: '#E53935',

    // Badges
    badge: {
      quality: '#29B6F6',       // cyan (accent light)
      category: '#FF6D00',      // orange
      categoryText: '#FFFFFF',
      rating: '#FFD700',
      views: '#B0BEC5',
    },
  },
  light: {
    gradientAbdo: ['#E53935', '#FF6D00'] as const,
    gradientBest: ['#1565C0', '#29B6F6'] as const,
    primary: '#E53935',
    primaryLight: '#FF6D00',
    primaryGradient: ['#E53935', '#FF6D00'] as const,
    accent: '#1565C0',
    accentLight: '#29B6F6',
    accentGradient: ['#1565C0', '#29B6F6'] as const,
    background: '#F5F7FC',
    surface: '#FFFFFF',
    surfaceLight: '#EEF1F8',
    card: '#FFFFFF',
    tabBar: '#FFFFFF',
    text: '#0A0D14',
    textSecondary: '#4A5270',
    textMuted: '#8B95B0',
    border: '#DDE3F0',
    overlay: 'rgba(255,255,255,0.8)',
    success: '#00C853',
    warning: '#FF8F00',
    error: '#E53935',
    badge: {
      quality: '#1565C0',
      category: '#FF6D00',
      categoryText: '#FFFFFF',
      rating: '#E65100',
      views: '#455A64',
    },
  },
};

export type ThemeMode = 'dark' | 'light';
