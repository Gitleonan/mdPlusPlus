import { create } from 'zustand';
import type { ThemeMode } from '../types';
import { withThemeTransition } from '../features/theme/themeTransition';

type Resolved = 'light' | 'dark';

interface ThemeState {
  theme: ThemeMode;
  resolved: Resolved;
  setTheme: (t: ThemeMode) => void;
  toggle: () => void;
}

function getSystemTheme(): Resolved {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolve(mode: ThemeMode): Resolved {
  return mode === 'system' ? getSystemTheme() : mode;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: (localStorage.getItem('theme') as ThemeMode) || 'system',
  resolved: resolve((localStorage.getItem('theme') as ThemeMode) || 'system'),

  setTheme(theme) {
    const r = resolve(theme);
    withThemeTransition(() => {
      document.documentElement.setAttribute('data-theme', r);
      localStorage.setItem('theme', theme);
      set({ theme, resolved: r });
    });
  },

  toggle() {
    const next: ThemeMode = get().resolved === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },
}));

// 初始应用（在模块加载时同步执行）
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', useThemeStore.getState().resolved);
}
