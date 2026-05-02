// AbdoBest color theme
// "Abdo" = red-orange gradient | "Best" = deep blue → cyan gradient

export const Colors = {
  dark: {
    // Brand gradients
    gradientAbdo: ['#E53935', '#FF6D00'] as const,   // red → orange
    gradientBest: ['#1565C0', '#29B6F6'] as const,   // dark blue → cyan

    // Primary actions (red-orange)
    primary: '#E53935',
    primaryLight: '#FF6D00',
    primaryGradient: ['#E53935', '#FF6D00'] as const,

    // Accent (blue-cyan)
    accent: '#1565C0',
    accentLight: '#29B6F6',
    accentGradient: ['#1565C0', '#29B6F6'] as const,

    // Surfaces – dark navy palette (very dark charcoal/navy)
    background: '#0A0D14',    // darkest
    surface: '#12161F',       // card background
    surfaceLight: '#1A2030',  // elevated surface
    card: '#141824',
    tabBar: '#0D1018',

    // Text
    text: '#F0F4FF',
    textSecondary: '#8B95B0',
    textMuted: '#4A5270',

    // UI elements
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
    // Same brand gradients (keep brand identity)
    gradientAbdo: ['#E53935', '#FF6D00'] as const,
    gradientBest: ['#1565C0', '#29B6F6'] as const,

    // Primary (slightly darker for contrast on light bg)
    primary: '#C62828',
    primaryLight: '#F57C00',
    primaryGradient: ['#E53935', '#FF6D00'] as const,

    // Accent
    accent: '#0D47A1',
    accentLight: '#0288D1',
    accentGradient: ['#1565C0', '#29B6F6'] as const,

    // Surfaces – light, clean
    background: '#F5F7FC',
    surface: '#FFFFFF',
    surfaceLight: '#EEF1F8',
    card: '#FFFFFF',
    tabBar: '#FFFFFF',

    // Text – dark for readability
    text: '#0A0D14',
    textSecondary: '#4A5270',
    textMuted: '#8B95B0',

    // UI
    border: '#DDE3F0',
    overlay: 'rgba(255,255,255,0.8)',

    // Status (same as dark)
    success: '#00C853',
    warning: '#FF8F00',
    error: '#E53935',

    // Badges
    badge: {
      quality: '#1565C0',
      category: '#FF6D00',
      categoryText: '#FFFFFF',
      rating: '#E65100',
      views: '#455A64',
    },
  },
};

// Helper: get gradient as LinearGradient props
export const getGradientProps = (type: 'abdo' | 'best') => {
  const gradient = type === 'abdo' ? Colors.dark.gradientAbdo : Colors.dark.gradientBest;
  return {
    colors: gradient,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  };
};

export type ThemeMode = 'dark' | 'light';