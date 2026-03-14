import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ViewMode = 'list' | 'compact' | 'full';
export type CenterLayout = 'single' | 'radial';
export type CenterBackdrop = 'page' | 'card';
export type AppThemeName = 'default' | 'default-glass' | 'academia' | 'academia-2026' | 'academia-mono' | 'arc' | 'custom-theme';
export type PomodoroPosition = 'footer' | 'corner-top' | 'corner-bottom-sm' | 'corner-bottom-lg';

export interface PaletteDefinition {
  label: string;
  colors: string[];
  builtIn?: boolean;
}

export const appThemeOptions: Record<AppThemeName, { label: string; description: string; defaultPalette: string }> = {
  default: {
    label: 'Default',
    description: 'Clean sans-serif, neutral grays',
    defaultPalette: 'classic',
  },
  'default-glass': {
    label: 'Default Glass',
    description: 'Apple liquid glass navbar — frosted blur, light refraction, sliding pill',
    defaultPalette: 'classic',
  },
  academia: {
    label: 'Academia',
    description: 'Tufte-inspired — serif fonts, warm ivory background',
    defaultPalette: 'mono',
  },
  'academia-2026': {
    label: 'Academia 2026',
    description: 'Glassmorphism + warm parchment — frosted glass depth, grain texture, editorial serif',
    defaultPalette: 'mono',
  },
  'academia-mono': {
    label: 'Academia Mono',
    description: 'Same Tufte flat style as Academia — crisp white/grey surfaces, slate-blue accent',
    defaultPalette: 'mono',
  },
  arc: {
    label: 'Arc',
    description: 'Frosted white/grey glassmorphism — cool neutral surfaces, vivid accent pops',
    defaultPalette: 'classic',
  },
  'custom-theme': {
    label: 'Custom CSS',
    description: 'Write your own CSS — full control over colors, fonts, and layout',
    defaultPalette: 'classic',
  },
};

export const builtInPalettes: Record<string, PaletteDefinition> = {
  classic: {
    label: 'Classic Greens',
    colors: ['#22c55e', '#15803d', '#22c55e', '#15803d', '#22c55e', '#15803d', '#22c55e', '#15803d'],
    builtIn: true,
  },
  rainbow: {
    label: 'Rainbow',
    colors: ['#f97316', '#facc15', '#22c55e', '#14b8a6', '#0ea5e9', '#6366f1', '#ec4899', '#ef4444'],
    builtIn: true,
  },
  pastel: {
    label: 'Pastel',
    colors: ['#fecdd3', '#fde68a', '#d9f99d', '#bae6fd', '#ddd6fe', '#fde68a', '#fecdd3', '#c4b5fd'],
    builtIn: true,
  },
  mono: {
    label: 'Greyscale',
    colors: ['#374151', '#9ca3af', '#374151', '#9ca3af', '#374151', '#9ca3af', '#374151', '#9ca3af'],
    builtIn: true,
  },
};

export const DEFAULT_FALLBACK_COLOR = '#22c55e';

export interface TabOrder {
  navbar: string[];
  lifeTabs: string[];
  commandTabs: string[];
  adminTabs: string[];
  panelTabs: string[];
}

export const DEFAULT_TAB_ORDER: TabOrder = {
  navbar: ['todo', 'sprints', 'life', 'command', 'admin'],
  lifeTabs: ['journal', 'goals', 'habits', 'recipes', 'bookshelf', 'phonebook'],
  commandTabs: ['actions', 'monitoring', 'agents'],
  adminTabs: ['terminal', 'settings', 'wiki'],
  panelTabs: ['tab1', 'tab2', 'tab3'],
};

export function sortTabs<T>(defs: T[], order: string[], keyFn: (t: T) => string): T[] {
  const idx = new Map(order.map((k, i) => [k, i]));
  return [...defs].sort((a, b) => (idx.get(keyFn(a)) ?? 999) - (idx.get(keyFn(b)) ?? 999));
}

export interface DisplaySettings {
  defaultView: ViewMode;
  appTheme: AppThemeName;
  palette: string;
  customPalettes: Record<string, { label: string; colors: string[] }>;
  customSubGoalColors: Record<number, string>;
  inheritActionColors: boolean;
  actionShadePercent: number;
  centerLayout: CenterLayout;
  centerBackdrop: CenterBackdrop;
  goalsPerPage: number;
  guestbookPerPage: number;
  language: string;
  darkMode: boolean;
  showHeaderBranding: boolean;
  vividColors: boolean;
  pomodoroPosition: PomodoroPosition;
  customCSS: string;
  tabOrder: TabOrder;
}

export interface GoalTheme {
  palette: string;
  customSubGoalColors: Record<number, string>;
  inheritActionColors: boolean;
  actionShadePercent: number;
  centerLayout: CenterLayout;
  centerBackdrop: CenterBackdrop;
}

export function getAllPalettes(customPalettes: Record<string, { label: string; colors: string[] }> = {}): Record<string, PaletteDefinition> {
  const custom: Record<string, PaletteDefinition> = {};
  for (const [id, p] of Object.entries(customPalettes)) {
    custom[id] = { ...p, builtIn: false };
  }
  return { ...builtInPalettes, ...custom };
}

export function lookupPaletteColors(paletteName: string, customPalettes: Record<string, { label: string; colors: string[] }> = {}): string[] {
  return builtInPalettes[paletteName]?.colors || customPalettes[paletteName]?.colors || builtInPalettes.classic.colors;
}

export function computeColorsFromTheme(theme: GoalTheme, customPalettes: Record<string, { label: string; colors: string[] }> = {}): Record<number, string> {
  const palette = lookupPaletteColors(theme.palette, customPalettes);
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
  appTheme: 'academia',
  palette: 'mono',
  customPalettes: {},
  customSubGoalColors: {},
  inheritActionColors: true,
  actionShadePercent: 60,
  centerLayout: 'single',
  centerBackdrop: 'card',
  goalsPerPage: 5,
  guestbookPerPage: 5,
  language: 'en-US',
  darkMode: false,
  showHeaderBranding: false,
  vividColors: false,
  pomodoroPosition: 'footer',
  customCSS: '',
  tabOrder: DEFAULT_TAB_ORDER,
};

interface DisplaySettingsContextValue {
  settings: DisplaySettings;
  updateSettings: (changes: Partial<DisplaySettings>) => void;
  setSubGoalColor: (position: number, color: string | null) => void;
  resetSubGoalColors: () => void;
  computedColors: Record<number, string>;
  createCustomPalette: (label: string, colors: string[]) => string;
  deleteCustomPalette: (id: string) => void;
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

  // Apply vivid P3 color class to <html>
  useEffect(() => {
    if (settings.vividColors) {
      document.documentElement.classList.add('vivid-colors');
    } else {
      document.documentElement.classList.remove('vivid-colors');
    }
  }, [settings.vividColors]);

  // Apply app theme CSS class to <html>
  useEffect(() => {
    Object.keys(appThemeOptions).forEach((theme) => {
      if (theme !== 'default') {
        document.documentElement.classList.remove(theme);
      }
    });
    if (settings.appTheme !== 'default') {
      document.documentElement.classList.add(settings.appTheme);
    }
  }, [settings.appTheme]);

  // Inject custom CSS into <head> when custom-theme is active
  useEffect(() => {
    const id = 'thesys-custom-theme';
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (settings.appTheme === 'custom-theme' && settings.customCSS) {
      if (!el) {
        el = document.createElement('style');
        el.id = id;
        document.head.appendChild(el);
      }
      el.textContent = settings.customCSS;
    } else if (el) {
      el.remove();
    }
  }, [settings.appTheme, settings.customCSS]);

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

  const createCustomPalette = (label: string, colors: string[]): string => {
    const id = 'custom-' + crypto.randomUUID();
    setSettings((prev) => ({
      ...prev,
      customPalettes: { ...prev.customPalettes, [id]: { label, colors } },
      palette: id,
      customSubGoalColors: {},
    }));
    return id;
  };

  const deleteCustomPalette = (id: string) => {
    setSettings((prev) => {
      const next = { ...prev.customPalettes };
      delete next[id];
      return {
        ...prev,
        customPalettes: next,
        // If we just deleted the active palette, fall back to classic
        palette: prev.palette === id ? 'classic' : prev.palette,
      };
    });
  };

  const computedColors = useMemo(
    () => computeColorsFromTheme(extractThemeFromSettings(settings), settings.customPalettes),
    [settings.palette, settings.customSubGoalColors, settings.customPalettes]
  );

  const value: DisplaySettingsContextValue = {
    settings,
    updateSettings,
    setSubGoalColor,
    resetSubGoalColors,
    computedColors,
    createCustomPalette,
    deleteCustomPalette,
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
