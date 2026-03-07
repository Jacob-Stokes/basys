import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ViewMode = 'compact' | 'full';
export type CenterLayout = 'single' | 'radial';
export type CenterBackdrop = 'page' | 'card';
export type PaletteName = 'classic' | 'rainbow' | 'pastel' | 'mono';
export type AppThemeName = 'default' | 'academia';

export const appThemeOptions: Record<AppThemeName, { label: string; description: string; defaultPalette: PaletteName }> = {
  default: {
    label: 'Default',
    description: 'Clean sans-serif, neutral grays',
    defaultPalette: 'classic',
  },
  academia: {
    label: 'Academia',
    description: 'Tufte-inspired — serif fonts, warm ivory background',
    defaultPalette: 'mono',
  },
};

export interface DisplaySettings {
  defaultView: ViewMode;
  appTheme: AppThemeName;
  palette: PaletteName;
  customSubGoalColors: Record<number, string>;
  inheritActionColors: boolean;
  actionShadePercent: number;
  centerLayout: CenterLayout;
  centerBackdrop: CenterBackdrop;
  goalsPerPage: number;
  guestbookPerPage: number;
  language: string;
  darkMode: boolean;
}

export const paletteOptions: Record<PaletteName, { label: string; colors: string[] }> = {
  classic: {
    label: 'Classic Greens',
    colors: ['#22c55e', '#86efac', '#15803d', '#bbf7d0', '#4ade80', '#166534', '#86efac', '#22c55e'],
  },
  rainbow: {
    label: 'Rainbow',
    colors: ['#f97316', '#facc15', '#22c55e', '#14b8a6', '#0ea5e9', '#6366f1', '#ec4899', '#ef4444'],
  },
  pastel: {
    label: 'Pastel',
    colors: ['#fecdd3', '#fde68a', '#d9f99d', '#bae6fd', '#ddd6fe', '#fde68a', '#fecdd3', '#c4b5fd'],
  },
  mono: {
    label: 'Greyscale',
    colors: ['#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db', '#4b5563', '#1f2937'],
  },
};

export interface GoalTheme {
  palette: PaletteName;
  customSubGoalColors: Record<number, string>;
  inheritActionColors: boolean;
  actionShadePercent: number;
  centerLayout: CenterLayout;
  centerBackdrop: CenterBackdrop;
}

export function computeColorsFromTheme(theme: GoalTheme): Record<number, string> {
  const palette = paletteOptions[theme.palette]?.colors || paletteOptions.classic.colors;
  const mapping: Record<number, string> = {};
  for (let i = 1; i <= 8; i += 1) {
    mapping[i] = theme.customSubGoalColors[i] || palette[i - 1] || palette[0];
  }
  return mapping;
}

export function extractThemeFromSettings(settings: DisplaySettings): GoalTheme {
  return {
    palette: settings.palette,
    customSubGoalColors: settings.customSubGoalColors,
    inheritActionColors: settings.inheritActionColors,
    actionShadePercent: settings.actionShadePercent,
    centerLayout: settings.centerLayout,
    centerBackdrop: settings.centerBackdrop,
  };
}

const STORAGE_KEY = 'haradaDisplaySettings';

const defaultSettings: DisplaySettings = {
  defaultView: 'compact',
  appTheme: 'default',
  palette: 'classic',
  customSubGoalColors: {},
  inheritActionColors: true,
  actionShadePercent: 60,
  centerLayout: 'single',
  centerBackdrop: 'card',
  goalsPerPage: 5,
  guestbookPerPage: 5,
  language: 'en-US',
  darkMode: false,
};

interface DisplaySettingsContextValue {
  settings: DisplaySettings;
  updateSettings: (changes: Partial<DisplaySettings>) => void;
  setSubGoalColor: (position: number, color: string | null) => void;
  resetSubGoalColors: () => void;
  computedColors: Record<number, string>;
}

const DisplaySettingsContext = createContext<DisplaySettingsContextValue | null>(null);

const readStoredSettings = (): DisplaySettings => {
  if (typeof window === 'undefined') return defaultSettings;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.warn('Failed to parse display settings', error);
  }
  return defaultSettings;
};

export function DisplaySettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<DisplaySettings>(readStoredSettings);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (settings.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.darkMode]);

  // Apply app theme CSS class to <html>
  useEffect(() => {
    // Remove all theme classes
    Object.keys(appThemeOptions).forEach((theme) => {
      if (theme !== 'default') {
        document.documentElement.classList.remove(theme);
      }
    });
    // Add current theme class
    if (settings.appTheme !== 'default') {
      document.documentElement.classList.add(settings.appTheme);
    }
  }, [settings.appTheme]);

  const updateSettings = (changes: Partial<DisplaySettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...changes };
      // When switching app theme, also switch to that theme's default palette
      if (changes.appTheme && changes.appTheme !== prev.appTheme && !changes.palette) {
        next.palette = appThemeOptions[changes.appTheme].defaultPalette;
        next.customSubGoalColors = {};
      }
      return next;
    });
  };

  const setSubGoalColor = (position: number, color: string | null) => {
    setSettings((prev) => {
      const nextColors = { ...prev.customSubGoalColors };
      if (!color) {
        delete nextColors[position];
      } else {
        nextColors[position] = color;
      }
      return { ...prev, customSubGoalColors: nextColors };
    });
  };

  const resetSubGoalColors = () => {
    setSettings((prev) => ({ ...prev, customSubGoalColors: {} }));
  };

  const computedColors = useMemo(() => {
    const palette = paletteOptions[settings.palette]?.colors || paletteOptions.classic.colors;
    const mapping: Record<number, string> = {};
    for (let i = 1; i <= 8; i += 1) {
      mapping[i] = settings.customSubGoalColors[i] || palette[i - 1] || palette[0];
    }
    return mapping;
  }, [settings.palette, settings.customSubGoalColors]);

  const value: DisplaySettingsContextValue = {
    settings,
    updateSettings,
    setSubGoalColor,
    resetSubGoalColors,
    computedColors,
  };

  return (
    <DisplaySettingsContext.Provider value={value}>
      {children}
    </DisplaySettingsContext.Provider>
  );
}

export function useDisplaySettings() {
  const context = useContext(DisplaySettingsContext);
  if (!context) {
    throw new Error('useDisplaySettings must be used within DisplaySettingsProvider');
  }
  return context;
}
