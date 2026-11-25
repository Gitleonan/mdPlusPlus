import { create } from 'zustand';
import { useTabsStore } from './tabsStore';
import { useDiscardConfirmStore } from './discardConfirmStore';
import { useToastStore } from './toastStore';

interface EditState {
  /** 当前是否处于编辑模式 */
  isEditing: boolean;
  /** 当前是否有未保存的修改 */
  isDirty: boolean;
  /** 最后保存的时间戳（用于通知 file watcher 跳过） */
  lastSaveAt: number;
  /** force=true 跳过确认（保存成功后的自动流转等场景） */
  toggleEditing: (force?: boolean) => Promise<void>;
  setDirty: (dirty: boolean) => void;
  markSaved: () => void;
  /** 仅用于已确认丢弃或 tab 已不存在；默认有脏修改时先确认 */
  reset: (force?: boolean) => Promise<void>;
}

export const useEditStore = create<EditState>((set, get) => ({
  isEditing: false,
  isDirty: false,
  lastSaveAt: 0,

  async toggleEditing(force = false) {
    const { isEditing, isDirty } = get();
    if (!isEditing) {
      const s = useTabsStore.getState();
      const active = s.tabs.find((t) => t.id === s.activeTabId);
      // 读取失败的 tab 正文为空；若放行编辑，Ctrl+S 会用空内容覆盖原文件。
      if (!active || active.isLoading || active.loadError || active.isLazy) {
        if (active?.loadError) {
          useToastStore.getState().push('文件读取失败，无法进入编辑模式', 'error');
        } else if (active) {
          useToastStore.getState().push('文件仍在加载，请稍候', 'info');
        }
        return;
      }
    }
    // 从编辑切回预览且有未保存修改:拦截并确认,防静默丢弃(原来这里直接清 isDirty)
    if (!force && isEditing && isDirty) {
      const s = useTabsStore.getState();
      const fileName = s.tabs.find((t) => t.id === s.activeTabId)?.fileName ?? '当前文档';
      // WebView 里 window.confirm 会被直接放行,必须走应用内异步确认。
      const ok = await useDiscardConfirmStore.getState().ask(
        '放弃未保存的修改？',
        `「${fileName}」有未保存的修改，退出编辑后将丢失。`,
        '放弃并退出',
      );
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

  async reset(force = false) {
    const { isEditing, isDirty } = get();
    if (!force && isEditing && isDirty) {
      const s = useTabsStore.getState();
      const fileName = s.tabs.find((t) => t.id === s.activeTabId)?.fileName ?? '当前文档';
      const ok = await useDiscardConfirmStore.getState().ask(
        '放弃未保存的修改？',
        `「${fileName}」有未保存的修改，离开后将丢失。`,
        '放弃并离开',
      );
      if (!ok) return;
    }
    set({ isEditing: false, isDirty: false });
  },
}));
