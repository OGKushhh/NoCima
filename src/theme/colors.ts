// =============================================================================
// AbdoBest Design System — Color Foundation
// Brand palette: "Abdo" red-to-orange gradient + "Best" blue gradient
// Supports Dark & Light themes via useTheme() hook
// =============================================================================

// ---------------------------------------------------------------------------
// Spacing Scale
// ---------------------------------------------------------------------------
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export type SpacingKey = keyof typeof SPACING;

// ---------------------------------------------------------------------------
// Border Radius
// ---------------------------------------------------------------------------
export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

export type RadiusKey = keyof typeof RADIUS;

// ---------------------------------------------------------------------------
// ThemeColors — the shape returned by useTheme()
// Every screen uses this interface — no more direct Colors.dark.* access
// ---------------------------------------------------------------------------
export interface ThemeColors {
  // Base
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceLight: string;
  border: string;
  card: string;

  // Text
  text: string;
  textSecondary: string;
  textMuted: string;

  // Brand — "Abdo" red-to-orange
  primary: string;
  primaryLight: string;
  primaryGradient: readonly [string, string];
  gradientAbdo: readonly [string, string];

  // Brand — "Best" deep-blue-to-light-blue
  accent: string;
  accentLight: string;
  accentGradient: readonly [string, string];
  gradientBest: readonly [string, string];

  // Status
  success: string;
  warning: string;
  error: string;

  // Rating / Gold
  rating: string;

  // UI Helpers
  overlay: string;

  // Tab Bar
  tabBar: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;

  // Badge Chips
  badge: {
    quality: { backgroundColor: string; color: string };
    genre: { backgroundColor: string; color: string };
    rating: { backgroundColor: string; color: string };
  };

  // Shadows (Android elevation + iOS shadow)
  shadowSm: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };
  shadowMd: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };
  shadowLg: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };
  shadowGlow: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };

  // For NavigationContainer theme
  statusBar: 'light-content' | 'dark-content';
}

// ---------------------------------------------------------------------------
// Dark Theme — primary theme, brand-matched
// "Abdo" = #E53935 → #FF6D00 (red to orange)
// "Best"  = #1565C0 → #29B6F6 (deep blue to light blue)
// ---------------------------------------------------------------------------
const dark: ThemeColors = {
  background: '#0B0E14',
  surface: '#141820',
  surfaceElevated: '#1A1F2B',
  surfaceLight: '#1A1F2B',
  border: '#1E2530',
  card: '#141820',

  text: '#FFFFFF',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',

  primary: '#E53935',
  primaryLight: '#FF6D00',
  primaryGradient: ['#E53935', '#FF6D00'],
  gradientAbdo: ['#E53935', '#FF6D00'],

  accent: '#29B6F6',
  accentLight: '#29B6F6',
  accentGradient: ['#1565C0', '#29B6F6'],
  gradientBest: ['#1565C0', '#29B6F6'],

  success: '#4CAF50',
  warning: '#FFC107',
  error: '#EF5350',

  rating: '#FFD700',

  overlay: 'rgba(0,0,0,0.75)',

  tabBar: '#0F1219',
  tabBarBorder: '#1A1F2B',
  tabBarActive: '#E53935',
  tabBarInactive: '#4B5563',

  badge: {
    quality: { backgroundColor: '#E5393520', color: '#FF5252' },
    genre: { backgroundColor: '#29B6F620', color: '#29B6F6' },
    rating: { backgroundColor: '#FFD70020', color: '#FFD700' },
  },

  shadowSm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  shadowMd: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  shadowLg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 16,
  },
  shadowGlow: {
    shadowColor: '#E53935',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 12,
  },

  statusBar: 'light-content',
};

// ---------------------------------------------------------------------------
// Light Theme — brand-matched, bright & clean
// ---------------------------------------------------------------------------
const light: ThemeColors = {
  background: '#F5F7FC',
  surface: '#FFFFFF',
  surfaceElevated: '#EEF1F8',
  surfaceLight: '#EEF1F8',
  border: '#DDE3F0',
  card: '#FFFFFF',

  text: '#0A0D14',
  textSecondary: '#4A5270',
  textMuted: '#8B95B0',

  primary: '#E53935',
  primaryLight: '#FF6D00',
  primaryGradient: ['#E53935', '#FF6D00'],
  gradientAbdo: ['#E53935', '#FF6D00'],

  accent: '#1565C0',
  accentLight: '#1565C0',
  accentGradient: ['#1565C0', '#29B6F6'],
  gradientBest: ['#1565C0', '#29B6F6'],

  success: '#4CAF50',
  warning: '#FFC107',
  error: '#EF5350',

  rating: '#E65100',

  overlay: 'rgba(0,0,0,0.5)',

  tabBar: '#FFFFFF',
  tabBarBorder: '#DDE3F0',
  tabBarActive: '#E53935',
  tabBarInactive: '#9CA3AF',

  badge: {
    quality: { backgroundColor: '#E5393520', color: '#E53935' },
    genre: { backgroundColor: '#29B6F620', color: '#1565C0' },
    rating: { backgroundColor: '#FFD70020', color: '#E65100' },
  },

  shadowSm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  shadowMd: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  shadowLg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
  },
  shadowGlow: {
    shadowColor: '#E53935',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },

  statusBar: 'dark-content',
};

// ---------------------------------------------------------------------------
// Main Colors Export
// ---------------------------------------------------------------------------
export const Colors = { dark, light };

export type ThemeMode = 'dark' | 'light';
