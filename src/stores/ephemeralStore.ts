import { create } from 'zustand';
import { useToastStore } from './toastStore';
import { useTabsStore } from './tabsStore';

const STORAGE_KEY = 'mdpp.ephemeralSession';

interface EphemeralState {
  /** 无痕会话：开启后关闭软件不恢复标签页，也不写入最近文件 */
  enabled: boolean;
  toggle: () => void;
}

function readInitial(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** 把状态同步到 <html> 属性,驱动全局紫色 accent(仿 themeStore 的 data-theme 机制) */
function applyDom(enabled: boolean) {
  document.documentElement.setAttribute('data-ephemeral', String(enabled));
}

export const useEphemeralStore = create<EphemeralState>((set, get) => ({
  enabled: readInitial(),
  toggle() {
    const enabled = !get().enabled;
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    } catch {
      // localStorage 不可用时本次会话内仍生效
    }
    set({ enabled });
    applyDom(enabled);
    if (enabled) {
      useToastStore.getState().push('无痕会话已开启——关闭软件后当前标签页不会被保留', 'info');
    } else {
      // 恢复留痕:以当前屏幕上的 tab 集为新基线立即落盘(所见即所留,不恢复开启前的旧会话)
      const s = useTabsStore.getState();
      s.syncSessionNow();
      useToastStore.getState().push('已退出无痕会话,恢复正常记录', 'success');
    }
  },
}));

// 模块加载即同步,持久化开启的会话首帧就是紫色
applyDom(readInitial());
