import { create } from 'zustand';
import { useTabsStore } from './tabsStore';

interface EditState {
  /** 当前是否处于编辑模式 */
  isEditing: boolean;
  /** 当前是否有未保存的修改 */
  isDirty: boolean;
  /** 最后保存的时间戳（用于通知 file watcher 跳过） */
  lastSaveAt: number;
  /** force=true 跳过确认（保存成功后的自动流转等场景） */
  toggleEditing: (force?: boolean) => void;
  setDirty: (dirty: boolean) => void;
  markSaved: () => void;
  reset: () => void;
}

export const useEditStore = create<EditState>((set, get) => ({
  isEditing: false,
  isDirty: false,
  lastSaveAt: 0,

  toggleEditing(force = false) {
    const { isEditing, isDirty } = get();
    // 从编辑切回预览且有未保存修改:拦截并确认,防静默丢弃(原来这里直接清 isDirty)
    if (!force && isEditing && isDirty) {
      const s = useTabsStore.getState();
      const fileName = s.tabs.find((t) => t.id === s.activeTabId)?.fileName ?? '当前文档';
      // ponytail: 同步确认,文案与 tabsStore.confirmDiscardDirty 对齐;异步化时两处一起迁
      const ok = window.confirm(`「${fileName}」有未保存的修改,关闭后将丢失。确定放弃?`);
      if (!ok) return;
    }
    set({ isEditing: !isEditing, isDirty: false });
  },

  setDirty(dirty) {
    set({ isDirty: dirty });
  },

  markSaved() {
    set({ isDirty: false, lastSaveAt: Date.now() });
  },

  reset() {
    set({ isEditing: false, isDirty: false });
  },
}));
