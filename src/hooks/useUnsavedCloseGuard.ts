import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useDiscardConfirmStore } from '../stores/discardConfirmStore';
import { useEditStore } from '../stores/editStore';
import { useTabsStore } from '../stores/tabsStore';
import { useToastStore } from '../stores/toastStore';

/** 关闭窗口前拦截未保存的编辑内容；确认后销毁窗口，避免二次 close-request。 */
export function useUnsavedCloseGuard() {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    let appWindow: ReturnType<typeof getCurrentWindow>;
    try {
      appWindow = getCurrentWindow();
    } catch {
      // 纯浏览器测试 / 调试环境没有 Tauri 元数据
      return;
    }

    appWindow.onCloseRequested(async (event) => {
      const editing = useEditStore.getState();
      if (!editing.isEditing || !editing.isDirty) return;

      event.preventDefault();
      const tabs = useTabsStore.getState();
      const fileName = tabs.tabs.find((t) => t.id === tabs.activeTabId)?.fileName ?? '当前文档';
      const confirmed = await useDiscardConfirmStore.getState().ask(
        '退出 md++？',
        `「${fileName}」有未保存的修改，关闭应用后将丢失。`,
        '放弃并退出',
      );
      if (!confirmed) return;

      try {
        // 必须先销毁窗口再清脏标记：销毁被 ACL 或系统拒绝时，
        // 草稿仍在窗口里，绝不能把 isDirty 提前置为 false。
        await appWindow.destroy();
        await useEditStore.getState().reset(true);
      } catch (err) {
        console.error('[close guard] failed to destroy window', err);
        useToastStore.getState().push('窗口关闭失败，修改仍保留，请重试', 'error');
      }
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    }).catch((err) => {
      // 纯浏览器调试或权限缺失时不影响应用使用。
      console.error('[close guard] failed to register', err);
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
