import { create } from 'zustand';
import {
  listCustomThemes,
  saveCustomTheme,
  readCustomTheme,
  deleteCustomTheme,
} from '../ipc/files';
import { withThemeTransition } from '../features/theme/themeTransition';

// 内置主题 — 通过 ?raw 导入为字符串
import freshCss from '../themes/fresh.css?raw';
import midnightCss from '../themes/midnight.css?raw';
import scholarlyCss from '../themes/scholarly.css?raw';
import tahoeCss from '../themes/tahoe.css?raw';

const STORAGE_KEY = 'mdpp.activeCustomTheme';
const BUILTIN_KEY = 'mdpp.activeBuiltinTheme';

export interface BuiltinTheme {
  id: string;
  name: string;
  nameZh: string;
  css: string;
}

/** 内置主题列表，顺序决定 UI 展示顺序 */
export const BUILTIN_THEMES: BuiltinTheme[] = [
  { id: 'fresh',     name: 'Fresh',     nameZh: '清新',  css: freshCss },
  { id: 'midnight',  name: 'Midnight',  nameZh: '午夜',  css: midnightCss },
  { id: 'scholarly', name: 'Scholarly', nameZh: '学术',  css: scholarlyCss },
  { id: 'tahoe',     name: 'Tahoe',     nameZh: 'Tahoe', css: tahoeCss },
];

interface CustomThemeState {
  /** 可用的自定义主题文件名列表 */
  themes: string[];
  /** 当前激活的自定义主题名（null 表示无） */
  activeTheme: string | null;
  /** 当前激活的内置主题 id（null 表示无） */
  activeBuiltin: string | null;
  /** 加载状态 */
  loading: boolean;

  /** 加载主题列表 */
  loadThemes: () => Promise<void>;
  /** 导入新的自定义主题 */
  importTheme: (name: string, css: string) => Promise<void>;
  /** 切换激活的自定义主题（null 取消） */
  setActive: (name: string | null) => Promise<void>;
  /** 切换激活的内置主题（null 取消） */
  setActiveBuiltin: (id: string | null) => void;
  /** 删除主题 */
  removeTheme: (name: string) => Promise<void>;
  /** 刷新当前主题 CSS（主题列表变化后调用） */
  refreshActiveCss: () => Promise<void>;
}

let styleEl: HTMLStyleElement | null = null;

function ensureStyleEl(): HTMLStyleElement {
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'custom-theme-css';
    document.head.appendChild(styleEl);
  }
  return styleEl;
}

function applyCss(css: string) {
  ensureStyleEl().textContent = css;
}

function clearCss() {
  if (styleEl) {
    styleEl.textContent = '';
  }
}

export const useCustomThemeStore = create<CustomThemeState>((set, get) => ({
  themes: [],
  activeTheme: localStorage.getItem(STORAGE_KEY) || null,
  activeBuiltin: localStorage.getItem(BUILTIN_KEY) || null,
  loading: false,

  async loadThemes() {
    set({ loading: true });
    try {
      const themes = await listCustomThemes();
      set({ themes });

      // 优先恢复内置主题
      const builtin = get().activeBuiltin;
      if (builtin) {
        const found = BUILTIN_THEMES.find((t) => t.id === builtin);
        if (found) {
          applyCss(found.css);
          // 内置主题激活时清除自定义主题状态
          localStorage.removeItem(STORAGE_KEY);
          set({ activeTheme: null });
          return;
        }
      }

      // 恢复上次激活的自定义主题
      const active = get().activeTheme;
      if (active && themes.includes(active)) {
        try {
          const css = await readCustomTheme(active);
          applyCss(css);
        } catch {
          localStorage.removeItem(STORAGE_KEY);
          set({ activeTheme: null });
          clearCss();
        }
      } else if (active) {
        localStorage.removeItem(STORAGE_KEY);
        set({ activeTheme: null });
        clearCss();
      }
    } catch (err) {
      console.error('[customTheme] loadThemes failed:', err);
    } finally {
      set({ loading: false });
    }
  },

  async importTheme(name: string, css: string) {
    await saveCustomTheme(name, css);
    await get().loadThemes();
  },

  async setActive(name: string | null) {
    if (name) {
      try {
        const css = await readCustomTheme(name);
        withThemeTransition(() => {
          applyCss(css);
          // 切换到自定义主题时清除内置主题状态
          localStorage.removeItem(BUILTIN_KEY);
          localStorage.setItem(STORAGE_KEY, name);
          set({ activeTheme: name, activeBuiltin: null });
        });
      } catch (err) {
        console.error('[customTheme] setActive failed:', err);
      }
    } else {
      withThemeTransition(() => {
        clearCss();
        localStorage.removeItem(STORAGE_KEY);
        set({ activeTheme: null });
      });
    }
  },

  setActiveBuiltin(id: string | null) {
    if (id) {
      const found = BUILTIN_THEMES.find((t) => t.id === id);
      if (!found) return;
      withThemeTransition(() => {
        applyCss(found.css);
        // 切换到内置主题时清除自定义主题状态
        localStorage.removeItem(STORAGE_KEY);
        localStorage.setItem(BUILTIN_KEY, id);
        set({ activeBuiltin: id, activeTheme: null });
      });
    } else {
      withThemeTransition(() => {
        clearCss();
        localStorage.removeItem(BUILTIN_KEY);
        set({ activeBuiltin: null });
      });
    }
  },

  async removeTheme(name: string) {
    await deleteCustomTheme(name);
    if (get().activeTheme === name) {
      withThemeTransition(() => {
        clearCss();
        localStorage.removeItem(STORAGE_KEY);
        set({ activeTheme: null });
      });
    }
    await get().loadThemes();
  },

  async refreshActiveCss() {
    const builtin = get().activeBuiltin;
    if (builtin) {
      const found = BUILTIN_THEMES.find((t) => t.id === builtin);
      if (found) { applyCss(found.css); return; }
    }
    const active = get().activeTheme;
    if (active) {
      try {
        const css = await readCustomTheme(active);
        applyCss(css);
      } catch {
        clearCss();
      }
    }
  },
}));
