import { create } from 'zustand';

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
  },
}));
