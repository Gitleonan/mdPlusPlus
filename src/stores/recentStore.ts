import { create } from 'zustand';
import type { RecentFile } from '../types';
import { listRecent, addRecent } from '../ipc/recent';

interface RecentState {
  files: RecentFile[];
  load: () => Promise<void>;
  record: (path: string, name: string) => Promise<void>;
}

export const useRecentStore = create<RecentState>((set) => ({
  files: [],
  async load() {
    try {
      set({ files: await listRecent() });
    } catch {
      // Tauri 命令可能还没注册（开发时前端先启动）
      set({ files: [] });
    }
  },
  async record(path, name) {
    try {
      await addRecent({ path, name, lastOpenedAt: Date.now() });
      set((s) => ({
        files: [
          { path, name, lastOpenedAt: Date.now() },
          ...s.files.filter((f) => f.path !== path),
        ].slice(0, 20),
      }));
    } catch (err) {
      // 失败不打断阅读，但必须留痕：这条 catch 曾经把「字段名不匹配导致
      // add_recent 永远失败」这个 bug 藏了几个月
      console.error('[recent] 记录最近文件失败', err);
    }
  },
}));
