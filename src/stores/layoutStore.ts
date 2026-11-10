import { create } from 'zustand';
import { withViewTransition } from '../features/theme/themeTransition';
import { resetTableWidths } from '../features/markdown/table-resize';

export type ContentWidth = 'centered' | 'full';

const STORAGE_KEY = 'mdpp.contentWidth';

function loadContentWidth(): ContentWidth {
  return localStorage.getItem(STORAGE_KEY) === 'full' ? 'full' : 'centered';
}

function applyContentWidth(width: ContentWidth): void {
  document.documentElement.setAttribute('data-content-width', width);
}

interface LayoutState {
  contentWidth: ContentWidth;
  toggleContentWidth: () => void;
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  contentWidth: loadContentWidth(),

  toggleContentWidth() {
    const next: ContentWidth = get().contentWidth === 'full' ? 'centered' : 'full';
    // 布局切换只改一个属性，过渡交给 View Transition，避免长文档逐帧重排
    withViewTransition(() => {
      applyContentWidth(next);
      // 栏宽变了，表格回到自动列宽重新排版
      resetTableWidths();
      localStorage.setItem(STORAGE_KEY, next);
      set({ contentWidth: next });
    }, 300);
  },
}));

// 初始应用（模块加载时同步执行，早于首帧）
if (typeof document !== 'undefined') {
  applyContentWidth(useLayoutStore.getState().contentWidth);
}
